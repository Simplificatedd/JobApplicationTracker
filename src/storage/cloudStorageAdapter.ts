import {
  DEFAULT_USER_SETTINGS,
  normalizeApplicationStatus,
} from "../lib/domain";
import { normalizeStatusActivities } from "../lib/statusHistory";
import { migrateLegacyFollowUpSchedule } from "../lib/followUps";
import type { AnalyticsSettings } from "../types/analytics";
import type {
  Activity,
  Application,
  ApplicationContact,
  CoverLetterMetadata,
  Interview,
  ResumeMetadata,
} from "../types/application";
import type { NotificationState, UserSettings } from "../types/settings";
import type { TablePreferences } from "../types/tablePreferences";
import {
  cloudApiClient,
  CloudRevisionConflictError,
  type CloudAccount,
  type CloudApiClient,
  type CloudStateEnvelope,
} from "./cloudApi";
import { indexedDbStorageAdapter } from "./indexedDbAdapter";
import {
  TRACKER_DATA_VERSION,
  type ResumeBlobRecord,
  type StorageAdapter,
  type StorageMutation,
  type StorageSnapshot,
} from "./StorageAdapter";

const MAX_CONFLICT_RETRIES = 3;

export function applyStorageMutation(
  snapshot: StorageSnapshot,
  mutation: StorageMutation,
): StorageSnapshot {
  return {
    ...snapshot,
    activities: upsertRecords(snapshot.activities, mutation.activities),
    applications: upsertRecords(snapshot.applications, mutation.applications),
    contacts: removeRecords(
      upsertRecords(snapshot.contacts, mutation.contacts),
      mutation.deleteContactIds,
    ),
    coverLetters: removeRecords(
      upsertRecords(snapshot.coverLetters ?? [], mutation.coverLetters),
      mutation.deleteCoverLetterIds,
    ),
    interviews: removeRecords(
      upsertRecords(snapshot.interviews, mutation.interviews),
      mutation.deleteInterviewIds,
    ),
    resumes: removeRecords(
      upsertRecords(snapshot.resumes, mutation.resumes),
      mutation.deleteResumeIds,
    ),
  };
}

function upsertRecords<T extends { id: string }>(
  records: T[],
  writes?: readonly T[],
) {
  if (!writes?.length) {
    return records;
  }

  const writesById = new Map(writes.map((record) => [record.id, record]));
  const merged = records.map((record) => writesById.get(record.id) ?? record);
  const existingIds = new Set(records.map((record) => record.id));

  return [
    ...merged,
    ...writes.filter((record) => !existingIds.has(record.id)),
  ];
}

function removeRecords<T extends { id: string }>(
  records: T[],
  deleteIds?: readonly string[],
) {
  if (!deleteIds?.length) {
    return records;
  }

  const deleted = new Set(deleteIds);
  return records.filter((record) => !deleted.has(record.id));
}

export interface CloudStorageAdapter extends StorageAdapter {
  getAccount(): CloudAccount | null;
}

export function createCloudStorageAdapter({
  api = cloudApiClient,
  cache = indexedDbStorageAdapter,
}: {
  api?: CloudApiClient;
  cache?: StorageAdapter;
} = {}): CloudStorageAdapter {
  let account: CloudAccount | null = null;
  let cloudState: CloudStateEnvelope | null = null;
  let initializePromise: Promise<StorageSnapshot> | null = null;
  let mutationQueue = Promise.resolve();

  function getAccount() {
    return account;
  }

  function initialize() {
    if (!initializePromise) {
      initializePromise = initializeNow().catch((error) => {
        initializePromise = null;
        throw error;
      });
    }

    return initializePromise;
  }

  async function initializeNow() {
    const localSnapshot = await cache.initialize();
    account = await api.getSession();
    const remoteState = await api.getState();

    if (remoteState) {
      cloudState = normalizeCloudState(remoteState);
      await refreshCache(cloudState.snapshot);
      return cloudState.snapshot;
    }

    const localFiles = await cache.listResumeFiles();
    await Promise.all(
      localFiles.map(({ file, storageKey }) =>
        api.putResumeFile(storageKey, file),
      ),
    );

    try {
      cloudState = normalizeCloudState(await api.saveState(localSnapshot, null));
    } catch (error) {
      if (!(error instanceof CloudRevisionConflictError) || !error.current) {
        throw error;
      }

      cloudState = normalizeCloudState(error.current);
    }

    await refreshCache(cloudState.snapshot, localFiles);
    return normalizeSnapshot(cloudState.snapshot);
  }

  async function ensureInitialized() {
    if (!cloudState) {
      await initialize();
    }

    if (!cloudState) {
      throw new Error("Cloud storage did not return an initialized snapshot.");
    }

    return cloudState;
  }

  function queueMutation<T>(operation: () => Promise<T>) {
    const result = mutationQueue.then(operation, operation);
    mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async function mutateSnapshot(
    update: (snapshot: StorageSnapshot) => StorageSnapshot,
    localFiles: readonly ResumeBlobRecord[] = [],
  ) {
    return queueMutation(async () => {
      let current = await ensureInitialized();

      for (let attempt = 0; attempt < MAX_CONFLICT_RETRIES; attempt += 1) {
        const nextSnapshot = update(structuredClone(current.snapshot));

        try {
          const saved = normalizeCloudState(
            await api.saveState(nextSnapshot, current.revision),
          );
          cloudState = saved;
          await refreshCache(saved.snapshot, localFiles);
          return saved.snapshot;
        } catch (error) {
          if (!(error instanceof CloudRevisionConflictError) || !error.current) {
            throw error;
          }

          current = normalizeCloudState(error.current);
          cloudState = current;
        }
      }

      throw new Error(
        "Cloud data changed repeatedly. Refresh the tracker and try again.",
      );
    });
  }

  async function refreshCache(
    snapshot: StorageSnapshot,
    addedFiles: readonly ResumeBlobRecord[] = [],
  ) {
    const currentFiles = await cache.listResumeFiles();
    const filesByKey = new Map(
      [...currentFiles, ...addedFiles].map((record) => [record.storageKey, record]),
    );
    const referencedKeys = new Set(
      [
        ...snapshot.resumes,
        ...(snapshot.coverLetters ?? []),
      ].map((document) => document.storageKey),
    );
    const retainedFiles = [...filesByKey.values()].filter((record) =>
      referencedKeys.has(record.storageKey),
    );

    await cache.importSnapshot(snapshot, retainedFiles);
  }

  async function commitMutation(mutation: StorageMutation) {
    const resumeFiles = [...(mutation.resumeFiles ?? [])];

    await Promise.all(
      resumeFiles.map(({ file, storageKey }) =>
        api.putResumeFile(storageKey, file),
      ),
    );
    await mutateSnapshot(
      (snapshot) => applyStorageMutation(snapshot, mutation),
      resumeFiles,
    );

    await Promise.allSettled(
      (mutation.deleteResumeFileKeys ?? []).map((storageKey) =>
        api.deleteResumeFile(storageKey),
      ),
    );
  }

  async function snapshot() {
    return (await ensureInitialized()).snapshot;
  }

  async function listApplications() {
    return (await snapshot()).applications;
  }

  async function getApplication(id: string) {
    return (await listApplications()).find((application) => application.id === id);
  }

  async function createApplication(application: Application) {
    await commitMutation({ applications: [application] });
  }

  async function updateApplication(application: Application) {
    await commitMutation({ applications: [application] });
  }

  async function archiveApplication(application: Application) {
    await updateApplication(application);
  }

  async function restoreApplication(application: Application) {
    await updateApplication(application);
  }

  async function deleteApplication(id: string) {
    await mutateSnapshot((current) => ({
      ...current,
      activities: current.activities.filter(
        (activity) => activity.applicationId !== id,
      ),
      applications: current.applications.filter(
        (application) => application.id !== id,
      ),
      contacts: current.contacts.filter((contact) => contact.applicationId !== id),
      interviews: current.interviews.filter(
        (interview) => interview.applicationId !== id,
      ),
    }));
  }

  async function listContacts(applicationId?: string) {
    const contacts = (await snapshot()).contacts;
    return applicationId
      ? contacts.filter((contact) => contact.applicationId === applicationId)
      : contacts;
  }

  async function saveContacts(contacts: ApplicationContact[]) {
    await commitMutation({ contacts });
  }

  async function createContact(contact: ApplicationContact) {
    await commitMutation({ contacts: [contact] });
  }

  async function updateContact(contact: ApplicationContact) {
    await commitMutation({ contacts: [contact] });
  }

  async function deleteContact(id: string) {
    await commitMutation({ deleteContactIds: [id] });
  }

  async function listActivities(applicationId?: string) {
    const activities = (await snapshot()).activities;
    return applicationId
      ? activities.filter((activity) => activity.applicationId === applicationId)
      : activities;
  }

  async function appendActivity(activity: Activity) {
    await commitMutation({ activities: [activity] });
  }

  async function deleteActivitiesForApplication(applicationId: string) {
    await mutateSnapshot((current) => ({
      ...current,
      activities: current.activities.filter(
        (activity) => activity.applicationId !== applicationId,
      ),
    }));
  }

  async function listInterviews(applicationId?: string) {
    const interviews = (await snapshot()).interviews;
    return applicationId
      ? interviews.filter(
          (interview) => interview.applicationId === applicationId,
        )
      : interviews;
  }

  async function saveInterview(interview: Interview) {
    await commitMutation({ interviews: [interview] });
  }

  async function deleteInterview(id: string) {
    await commitMutation({ deleteInterviewIds: [id] });
  }

  async function deleteInterviewsForApplication(applicationId: string) {
    await mutateSnapshot((current) => ({
      ...current,
      interviews: current.interviews.filter(
        (interview) => interview.applicationId !== applicationId,
      ),
    }));
  }

  async function listResumeMetadata() {
    return (await snapshot()).resumes;
  }

  async function listCoverLetterMetadata() {
    return (await snapshot()).coverLetters ?? [];
  }

  async function saveCoverLetter(coverLetter: CoverLetterMetadata, file: Blob) {
    await commitMutation({
      coverLetters: [coverLetter],
      resumeFiles: [{ file, storageKey: coverLetter.storageKey }],
    });
  }

  async function updateCoverLetterMetadata(coverLetter: CoverLetterMetadata) {
    await commitMutation({ coverLetters: [coverLetter] });
  }

  async function deleteCoverLetterMetadata(id: string) {
    await commitMutation({ deleteCoverLetterIds: [id] });
  }

  async function saveResume(resume: ResumeMetadata, file: Blob) {
    await commitMutation({
      resumes: [resume],
      resumeFiles: [{ file, storageKey: resume.storageKey }],
    });
  }

  async function createResumeMetadata(resume: ResumeMetadata) {
    await commitMutation({ resumes: [resume] });
  }

  async function updateResumeMetadata(resume: ResumeMetadata) {
    await commitMutation({ resumes: [resume] });
  }

  async function deleteResumeMetadata(id: string) {
    await commitMutation({ deleteResumeIds: [id] });
  }

  async function listResumeFiles() {
    const resumes = await listResumeMetadata();
    const files = await Promise.all(
      resumes.map(async (resume) => {
        try {
          return {
            file: await getResumeFile(resume.storageKey),
            storageKey: resume.storageKey,
          };
        } catch {
          return null;
        }
      }),
    );
    return files.filter((file): file is ResumeBlobRecord => file !== null);
  }

  async function saveResumeFile(storageKey: string, file: Blob) {
    await api.putResumeFile(storageKey, file);
    await cache.saveResumeFile(storageKey, file);
  }

  async function getResumeFile(storageKey: string) {
    const cached = await cache.getResumeFile(storageKey);

    if (cached) {
      return cached;
    }

    const file = await api.getResumeFile(storageKey);
    await cache.saveResumeFile(storageKey, file);
    return file;
  }

  async function deleteResumeFile(storageKey: string) {
    await api.deleteResumeFile(storageKey);
    await cache.deleteResumeFile(storageKey);
  }

  async function clearResumeFiles() {
    const documents = [
      ...(await listResumeMetadata()),
      ...(await listCoverLetterMetadata()),
    ];
    await Promise.allSettled(
      documents.map((document) => api.deleteResumeFile(document.storageKey)),
    );
    await cache.clearResumeFiles();
  }

  async function getSettings() {
    return (await snapshot()).settings;
  }

  async function saveSettings(settings: UserSettings) {
    await mutateSnapshot((current) => ({ ...current, settings }));
  }

  async function resetSettings() {
    await saveSettings(DEFAULT_USER_SETTINGS);
    return DEFAULT_USER_SETTINGS;
  }

  async function getNotificationState() {
    return (await snapshot()).notificationState;
  }

  async function saveNotificationState(notificationState: NotificationState) {
    await mutateSnapshot((current) => ({ ...current, notificationState }));
  }

  async function getAnalyticsSettings() {
    return (await snapshot()).analyticsSettings;
  }

  async function saveAnalyticsSettings(analyticsSettings: AnalyticsSettings) {
    await mutateSnapshot((current) => ({ ...current, analyticsSettings }));
  }

  async function getTablePreferences() {
    return (await snapshot()).tablePreferences;
  }

  async function saveTablePreferences(tablePreferences: TablePreferences) {
    await mutateSnapshot((current) => ({ ...current, tablePreferences }));
  }

  async function resetTablePreferences() {
    await mutateSnapshot((current) => ({ ...current, tablePreferences: null }));
  }

  async function exportSnapshot() {
    return structuredClone(await snapshot());
  }

  async function importSnapshot(
    importedSnapshot: StorageSnapshot,
    resumeFiles: ResumeBlobRecord[] = [],
  ) {
    await Promise.all(
      resumeFiles.map(({ file, storageKey }) =>
        api.putResumeFile(storageKey, file),
      ),
    );
    await mutateSnapshot(() => importedSnapshot, resumeFiles);
  }

  return {
    initialize,
    commitMutation,
    listApplications,
    getApplication,
    createApplication,
    updateApplication,
    archiveApplication,
    restoreApplication,
    deleteApplication,
    listContacts,
    saveContacts,
    createContact,
    updateContact,
    deleteContact,
    listActivities,
    appendActivity,
    deleteActivitiesForApplication,
    listInterviews,
    saveInterview,
    deleteInterview,
    deleteInterviewsForApplication,
    listResumeMetadata,
    listCoverLetterMetadata,
    saveCoverLetter,
    updateCoverLetterMetadata,
    deleteCoverLetterMetadata,
    saveResume,
    createResumeMetadata,
    updateResumeMetadata,
    deleteResumeMetadata,
    listResumeFiles,
    saveResumeFile,
    getResumeFile,
    deleteResumeFile,
    clearResumeFiles,
    getSettings,
    saveSettings,
    resetSettings,
    getNotificationState,
    saveNotificationState,
    getAnalyticsSettings,
    saveAnalyticsSettings,
    getTablePreferences,
    saveTablePreferences,
    resetTablePreferences,
    exportSnapshot,
    importSnapshot,
    getAccount,
  };
}

export const cloudStorageAdapter = createCloudStorageAdapter();

function normalizeCloudState(state: CloudStateEnvelope): CloudStateEnvelope {
  return {
    ...state,
    snapshot: normalizeSnapshot(state.snapshot),
  };
}

function normalizeSnapshot(snapshot: StorageSnapshot): StorageSnapshot {
  const hasLegacyOfferSemantics =
    (snapshot.dataVersion ?? 1) < TRACKER_DATA_VERSION;
  const defaultFollowUpPromptDays =
    snapshot.settings.defaultFollowUpPromptDays;

  return {
    ...snapshot,
    activities: normalizeStatusActivities(
      snapshot.activities,
      hasLegacyOfferSemantics,
    ),
    dataVersion: TRACKER_DATA_VERSION,
    applications: snapshot.applications.map((application) => {
      const migratedApplication = migrateLegacyFollowUpSchedule(
        application,
        defaultFollowUpPromptDays,
      );

      return {
        ...migratedApplication,
        status:
          hasLegacyOfferSemantics && application.status === "Offered"
            ? "Accepted"
            : normalizeApplicationStatus(application.status),
      };
    }),
    coverLetters: snapshot.coverLetters ?? [],
  };
}
