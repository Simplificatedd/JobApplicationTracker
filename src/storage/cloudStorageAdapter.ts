import {
  DEFAULT_ANALYTICS_SETTINGS,
  DEFAULT_NOTIFICATION_STATE,
  DEFAULT_USER_SETTINGS,
  normalizeApplicationStatus,
} from "../lib/domain";
import {
  applyAssessmentUpdates,
  assertEquivalentInterviewSource,
  getNextAssessmentNumber,
  migrateStageSnapshot,
} from "../lib/assessments";
import { normalizeStatusActivities } from "../lib/statusHistory";
import { migrateLegacyFollowUpSchedule } from "../lib/followUps";
import type { AnalyticsSettings } from "../types/analytics";
import type {
  Activity,
  Application,
  Assessment,
  ApplicationContact,
  CoverLetterMetadata,
  Interview,
  ResumeMetadata,
} from "../types/application";
import type { NotificationState, UserSettings } from "../types/settings";
import type { TablePreferences } from "../types/tablePreferences";
import {
  cloudApiClient,
  CloudApiError,
  CloudRevisionConflictError,
  type CloudAccount,
  type CloudApiClient,
  type CloudStateEnvelope,
} from "./cloudApi";
import {
  createIndexedDbStorageAdapter,
  indexedDbStorageAdapter,
  TRACKER_DB_NAME,
} from "./indexedDbAdapter";
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
  // A conversion must still refer to the source the user actually saw. Guard both
  // race directions before deleting the interview or overwriting an existing assessment.
  for (const write of mutation.interviews ?? []) {
    const converted = snapshot.assessments?.find((item) => item.id === write.id);
    if (converted) assertEquivalentInterviewSource(write, converted.legacyInterview);
  }
  const repeatedConversions = new Set<string>();
  for (const write of mutation.assessments ?? []) {
    if (
      !write.legacyInterview ||
      !mutation.deleteInterviewIds?.includes(write.id)
    )
      continue;
    const source = snapshot.interviews.find((item) => item.id === write.id);
    if (source) {
      assertEquivalentInterviewSource(source, write.legacyInterview);
    } else {
      const existing = snapshot.assessments?.find((item) => item.id === write.id);
      if (!existing)
        throw new Error(
          "Interview was removed in another session. Refresh the tracker before converting.",
        );
      assertEquivalentInterviewSource(
        write.legacyInterview,
        existing.legacyInterview,
      );
      repeatedConversions.add(write.id);
    }
  }
  return {
    ...snapshot,
    activities: upsertRecords(snapshot.activities, mutation.activities),
    applications: upsertRecords(
      snapshot.applications,
      mutation.applications?.map((write) => {
        if (
          !mutation.assessments?.length &&
          !mutation.assessmentUpdates?.length &&
          !mutation.deleteAssessmentIds?.length
        )
          return write;
        // Assessment actions update activity timestamps, never overwrite a concurrently
        // changed application status, archive state, or other application metadata.
        const current = snapshot.applications.find(
          (item) => item.id === write.id,
        );
        if (!current)
          throw new Error(
            "The assessment’s application no longer exists. Refresh the tracker.",
          );
        return { ...current, updatedAt: write.updatedAt };
      }),
    ),
    contacts: removeRecords(
      upsertRecords(snapshot.contacts, mutation.contacts),
      mutation.deleteContactIds,
    ),
    coverLetters: removeRecords(
      upsertRecords(snapshot.coverLetters ?? [], mutation.coverLetters),
      mutation.deleteCoverLetterIds,
    ),
    assessments: removeRecords(
      applyAssessmentUpdates(
        mergeAssessmentWrites(
          snapshot.assessments ?? [],
          mutation.assessments?.filter(
            (item) => !repeatedConversions.has(item.id),
          ),
        ),
        mutation.assessmentUpdates,
      ),
      mutation.deleteAssessmentIds,
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

function mergeAssessmentWrites(
  records: Assessment[],
  writes?: readonly Assessment[],
) {
  const merged = [...records];
  for (const write of writes ?? []) {
    const index = merged.findIndex((item) => item.id === write.id);
    if (index >= 0) {
      merged[index] = { ...write, number: merged[index].number };
    } else {
      const peers = merged.filter(
        (item) => item.applicationId === write.applicationId,
      );
      const number = peers.some((item) => item.number === write.number)
        ? getNextAssessmentNumber(peers)
        : write.number;
      merged.push({ ...write, number });
    }
  }
  return merged;
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
  cache: injectedCache,
  cacheForAccount = (id) => createIndexedDbStorageAdapter({
    databaseName: `${TRACKER_DB_NAME}:account:${encodeURIComponent(id)}`,
  }),
  legacyCache = indexedDbStorageAdapter,
  confirmLegacyMigration = (account) =>
    window.confirm(
      `Local tracker data was found without an account owner. It may belong to another account. Import it into ${account.email}? The original local data will be kept.`,
    ),
  onAccountChanged = () => {
    window.dispatchEvent(new Event("tracker-account-changed"));
    window.location.reload();
  },
}: {
  api?: CloudApiClient;
  cache?: StorageAdapter;
  cacheForAccount?: (accountId: string) => StorageAdapter;
  legacyCache?: StorageAdapter;
  confirmLegacyMigration?: (account: CloudAccount) => boolean | Promise<boolean>;
  onAccountChanged?: () => void;
} = {}): CloudStorageAdapter {
  let account: CloudAccount | null = null;
  let cache: StorageAdapter | null = null;
  let cloudState: CloudStateEnvelope | null = null;
  let initializePromise: Promise<StorageSnapshot> | null = null;
  let accountIdentityChanged = false;
  let mutationQueue = Promise.resolve();

  function getAccount() {
    return account;
  }

  function activeCache() {
    if (!cache) throw new Error("Account storage has not been initialized.");
    return cache;
  }

  function accountId() {
    if (!account) throw new Error("Signed-in account has not been verified.");
    return account.id;
  }

  function accountChanged() {
    accountIdentityChanged = true;
    account = null;
    cache = null;
    cloudState = null;
    initializePromise = null;
    onAccountChanged();
    throw new Error("Signed-in account changed. Reload the tracker.");
  }

  async function cloudRequest<T>(operation: Promise<T>): Promise<T> {
    try {
      return await operation;
    } catch (error) {
      if (error instanceof CloudApiError && error.status === 412) {
        accountChanged();
      }
      throw error;
    }
  }

  async function verifyAccount() {
    if (accountIdentityChanged) {
      throw new Error("Signed-in account changed. Reload the tracker.");
    }
    const current = await api.getSession();
    if (!current.id || !current.email) {
      throw new Error("The signed-in account has no verified identity.");
    }
    if (account && current.id !== account.id) accountChanged();
    return current;
  }

  async function initialize() {
    if (accountIdentityChanged) {
      throw new Error("Signed-in account changed. Reload the tracker.");
    }
    if (!initializePromise) {
      initializePromise = initializeNow().catch((error) => {
        initializePromise = null;
        throw error;
      });
    }
    const snapshot = await initializePromise;
    await verifyAccount();
    return snapshot;
  }

  async function initializeNow() {
    account = await verifyAccount();
    cache = injectedCache ?? cacheForAccount(account.id);
    const remoteState = await cloudRequest(api.getState(accountId()));

    if (remoteState) {
      let current = remoteState;
      cloudState = normalizeCloudState(current);
      // Persist the entire migration atomically under the existing revision guard.
      for (
        let attempt = 0;
        JSON.stringify(cloudState.snapshot) !==
        JSON.stringify(current.snapshot);
        attempt += 1
      ) {
        try {
          cloudState = normalizeCloudState(
            await cloudRequest(api.saveState(cloudState.snapshot, cloudState.revision, accountId())),
          );
          break;
        } catch (error) {
          if (
            !(error instanceof CloudRevisionConflictError) ||
            !error.current ||
            attempt >= MAX_CONFLICT_RETRIES - 1
          )
            throw error;
          current = error.current;
          cloudState = normalizeCloudState(current);
        }
      }
      await refreshCache(cloudState.snapshot);
      return cloudState.snapshot;
    }

    const scopedSnapshot = normalizeSnapshot(await activeCache().initialize());
    const scopedFiles = await activeCache().listResumeFiles();
    let localSnapshot = scopedSnapshot;
    let localFiles = scopedFiles;
    if (!hasUserData(scopedSnapshot, scopedFiles)) {
      const unownedSnapshot = normalizeSnapshot(await legacyCache.initialize());
      const unownedFiles = await legacyCache.listResumeFiles();
      if (hasUserData(unownedSnapshot, unownedFiles) &&
        await confirmLegacyMigration(account)) {
        localSnapshot = unownedSnapshot;
        localFiles = unownedFiles;
      }
    }
    await Promise.all(
      localFiles.map(({ file, storageKey }) =>
        cloudRequest(api.putResumeFile(storageKey, file, accountId())),
      ),
    );

    try {
      cloudState = normalizeCloudState(await cloudRequest(api.saveState(localSnapshot, null, accountId())));
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
    if (accountIdentityChanged) {
      throw new Error("Signed-in account changed. Reload the tracker.");
    }
    if (!cloudState) {
      await initialize();
    }

    if (!cloudState) {
      throw new Error("Cloud storage did not return an initialized snapshot.");
    }

    await verifyAccount();

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
        const nextSnapshot = normalizeSnapshot(
          update(structuredClone(current.snapshot)),
        );

        try {
          const saved = normalizeCloudState(
            await cloudRequest(api.saveState(nextSnapshot, current.revision, accountId())),
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
    const currentFiles = await activeCache().listResumeFiles();
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

    await activeCache().importSnapshot(snapshot, retainedFiles);
  }

  async function commitMutation(mutation: StorageMutation) {
    await ensureInitialized();
    const resumeFiles = [...(mutation.resumeFiles ?? [])];

    await Promise.all(
      resumeFiles.map(({ file, storageKey }) =>
        cloudRequest(api.putResumeFile(storageKey, file, accountId())),
      ),
    );
    await mutateSnapshot(
      (snapshot) => applyStorageMutation(snapshot, mutation),
      resumeFiles,
    );

    await Promise.allSettled(
      (mutation.deleteResumeFileKeys ?? []).map((storageKey) =>
        cloudRequest(api.deleteResumeFile(storageKey, accountId())),
      ),
    );
    if (accountIdentityChanged) {
      throw new Error("Signed-in account changed. Reload the tracker.");
    }
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
      contacts: current.contacts.filter(
        (contact) => contact.applicationId !== id,
      ),
      assessments: (current.assessments ?? []).filter(
        (item) => item.applicationId !== id,
      ),
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

  async function listAssessments(applicationId?: string) {
    const assessments = (await snapshot()).assessments ?? [];
    return applicationId
      ? assessments.filter((item) => item.applicationId === applicationId)
      : assessments;
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
          if (accountIdentityChanged) {
            throw new Error("Signed-in account changed. Reload the tracker.");
          }
          return null;
        }
      }),
    );
    return files.filter((file): file is ResumeBlobRecord => file !== null);
  }

  async function saveResumeFile(storageKey: string, file: Blob) {
    await ensureInitialized();
    await cloudRequest(api.putResumeFile(storageKey, file, accountId()));
    await activeCache().saveResumeFile(storageKey, file);
  }

  async function getResumeFile(storageKey: string) {
    await ensureInitialized();
    const cached = await activeCache().getResumeFile(storageKey);

    if (cached) {
      return cached;
    }

    const file = await cloudRequest(api.getResumeFile(storageKey, accountId()));
    await activeCache().saveResumeFile(storageKey, file);
    return file;
  }

  async function deleteResumeFile(storageKey: string) {
    await ensureInitialized();
    await cloudRequest(api.deleteResumeFile(storageKey, accountId()));
    await activeCache().deleteResumeFile(storageKey);
  }

  async function clearResumeFiles() {
    const documents = [
      ...(await listResumeMetadata()),
      ...(await listCoverLetterMetadata()),
    ];
    await Promise.allSettled(
      documents.map((document) => cloudRequest(api.deleteResumeFile(document.storageKey, accountId()))),
    );
    await activeCache().clearResumeFiles();
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
    await ensureInitialized();
    await Promise.all(
      resumeFiles.map(({ file, storageKey }) =>
        cloudRequest(api.putResumeFile(storageKey, file, accountId())),
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
    listAssessments,
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

function hasUserData(
  snapshot: StorageSnapshot,
  files: readonly ResumeBlobRecord[],
) {
  return files.length > 0 ||
    [
      snapshot.activities,
      snapshot.applications,
      snapshot.contacts,
      snapshot.coverLetters ?? [],
      snapshot.assessments ?? [],
      snapshot.interviews,
      snapshot.resumes,
    ].some((records) => records.length > 0) ||
    JSON.stringify(snapshot.settings) !== JSON.stringify(DEFAULT_USER_SETTINGS) ||
    snapshot.tablePreferences !== null ||
    JSON.stringify(snapshot.notificationState) !==
      JSON.stringify(DEFAULT_NOTIFICATION_STATE) ||
    JSON.stringify(snapshot.analyticsSettings) !==
      JSON.stringify(DEFAULT_ANALYTICS_SETTINGS);
}

function normalizeCloudState(state: CloudStateEnvelope): CloudStateEnvelope {
  return {
    ...state,
    snapshot: normalizeSnapshot(state.snapshot),
  };
}

function normalizeSnapshot(snapshot: StorageSnapshot): StorageSnapshot {
  if ((snapshot.dataVersion ?? 1) > TRACKER_DATA_VERSION)
    throw new Error(
      "This workspace uses a newer data format. Update the tracker before opening it.",
    );
  const hasLegacyOfferSemantics = (snapshot.dataVersion ?? 1) < 2;
  const defaultFollowUpPromptDays = snapshot.settings.defaultFollowUpPromptDays;

  return migrateStageSnapshot({
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
  });
}
