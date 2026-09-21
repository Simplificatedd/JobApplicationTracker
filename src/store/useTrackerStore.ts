import { useEffect, useState } from "react";
import type { AnalyticsSettings } from "../types/analytics";
import type {
  Activity,
  Application,
  ApplicationContact,
  ApplicationStatus,
  Interview,
  ResumeMetadata,
} from "../types/application";
import type { NotificationState, UserSettings } from "../types/settings";
import type { TablePreferences } from "../types/tablePreferences";
import {
  base64ToBlob,
  blobToBase64,
  createApplicationsCsv,
  createBackupFile,
  getBackupImportPreview,
  parseBackupFile,
  type BackupImportPreview,
} from "../lib/backups";
import {
  createDateStamp,
  createId,
  createTimestamp,
  DEFAULT_ANALYTICS_SETTINGS,
  DEFAULT_NOTIFICATION_STATE,
  DEFAULT_USER_SETTINGS,
} from "../lib/domain";
import {
  createResumeUploadResult,
  markResumeUsed,
  shouldMarkResumeUsed,
  type ResumeUploadOptions,
  type ResumeUploadResult,
  updateResumeMetadata,
} from "../lib/resumeFiles";
import { buildInterviewRecord, upsertInterviewHistory } from "../lib/interviews";
import { indexedDbStorageAdapter } from "../storage/indexedDbAdapter";
import type {
  ResumeBlobRecord,
  StorageMutation,
} from "../storage/StorageAdapter";

export type ApplicationInput = Omit<
  Application,
  "id" | "contactsCount" | "createdAt" | "updatedAt" | "archivedAt"
>;

export type ApplicationUpdate = Partial<
  Omit<Application, "id" | "contactsCount" | "createdAt" | "updatedAt">
>;

export type ContactInput = Omit<
  ApplicationContact,
  "id" | "createdAt" | "updatedAt"
>;

export type ResumeMetadataUpdate = Partial<
  Pick<ResumeMetadata, "displayName" | "downloadFileName" | "notes" | "versionLabel">
>;

export interface PendingResumeUpload {
  file: File;
  options?: ResumeUploadOptions;
}

export type MutationResult<Value = void> =
  | { ok: true; value: Value }
  | { error: string; ok: false };

export interface TrackerStore {
  activities: Activity[];
  analyticsSettings: AnalyticsSettings;
  applications: Application[];
  contacts: ApplicationContact[];
  interviews: Interview[];
  isStorageLoading: boolean;
  notificationState: NotificationState;
  resumes: ResumeMetadata[];
  retryStorage: () => void;
  settings: UserSettings;
  storageError: string | null;
  tablePreferences: TablePreferences | null;
  addContact: (input: ContactInput) => Promise<MutationResult<ApplicationContact>>;
  appendActivity: (
    applicationId: string,
    type: Activity["type"],
    message: string,
  ) => Promise<MutationResult>;
  archiveApplication: (id: string) => Promise<MutationResult>;
  createApplication: (
    input: ApplicationInput,
    pendingResume?: PendingResumeUpload,
  ) => Promise<MutationResult<Application>>;
  deleteApplication: (id: string) => Promise<MutationResult>;
  deleteContact: (id: string) => Promise<MutationResult>;
  deleteResume: (id: string) => Promise<MutationResult>;
  dismissNotification: (id: string) => Promise<boolean>;
  exportApplicationsCsv: () => Blob;
  exportFullBackup: () => Promise<Blob>;
  getResumeFile: (id: string) => Promise<Blob>;
  importFullBackup: (file: File) => Promise<void>;
  previewBackupImport: (file: File) => Promise<BackupImportPreview>;
  resetSettings: () => Promise<boolean>;
  resetTablePreferences: () => Promise<boolean>;
  restoreApplication: (id: string) => Promise<MutationResult>;
  markNotificationsOpened: () => Promise<boolean>;
  updateResume: (
    id: string,
    input: ResumeMetadataUpdate,
  ) => Promise<MutationResult>;
  uploadResume: (
    file: File,
    options?: ResumeUploadOptions,
  ) => Promise<ResumeUploadResult>;
  updateApplication: (
    id: string,
    input: ApplicationUpdate,
    pendingResume?: PendingResumeUpload,
  ) => Promise<MutationResult>;
  updateAnalyticsSettings: (input: Partial<AnalyticsSettings>) => Promise<boolean>;
  updateContact: (
    id: string,
    input: Partial<ContactInput>,
  ) => Promise<MutationResult>;
  updateSettings: (input: Partial<UserSettings>) => Promise<boolean>;
  updateTablePreferences: (input: Partial<TablePreferences>) => Promise<boolean>;
}

export function useTrackerStore(): TrackerStore {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [contacts, setContacts] = useState<ApplicationContact[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [isStorageLoading, setIsStorageLoading] = useState(true);
  const [resumes, setResumes] = useState<ResumeMetadata[]>([]);
  const [settings, setSettings] =
    useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [analyticsSettings, setAnalyticsSettings] = useState<AnalyticsSettings>(
    DEFAULT_ANALYTICS_SETTINGS,
  );
  const [notificationState, setNotificationState] = useState<NotificationState>(
    DEFAULT_NOTIFICATION_STATE,
  );
  const [storageError, setStorageError] = useState<string | null>(null);
  const [storageRetryKey, setStorageRetryKey] = useState(0);
  const [tablePreferences, setTablePreferences] =
    useState<TablePreferences | null>(null);

  useEffect(() => {
    let isActive = true;

    setIsStorageLoading(true);
    setStorageError(null);

    indexedDbStorageAdapter
      .initialize()
      .then((snapshot) => {
        if (!isActive) {
          return;
        }

        setActivities(sortActivities(snapshot.activities));
        setAnalyticsSettings(snapshot.analyticsSettings);
        setApplications(
          withContactCounts(snapshot.applications, snapshot.contacts),
        );
        setContacts(snapshot.contacts);
        setInterviews(snapshot.interviews);
        setNotificationState(snapshot.notificationState);
        setResumes(snapshot.resumes);
        setSettings(snapshot.settings);
        setTablePreferences(snapshot.tablePreferences);
        setIsStorageLoading(false);
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        setStorageError(getStorageErrorMessage(error));
        setIsStorageLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [storageRetryKey]);

  useEffect(() => {
    if (isStorageLoading || storageError) {
      return;
    }

    const now = new Date();
    const transitionedApplications = applications.filter(
      (application) =>
        application.status === "Just Applied" &&
        application.dateApplied &&
        daysSince(application.dateApplied, now) >=
          (application.followUpPromptDays ?? settings.defaultFollowUpPromptDays),
    );

    if (transitionedApplications.length === 0) {
      return;
    }

    const updatedAt = createTimestamp(now);
    const transitionedIds = new Set(
      transitionedApplications.map((application) => application.id),
    );
    const updatedApplications = applications.map((application) =>
      transitionedIds.has(application.id)
        ? {
            ...application,
            status: "Awaiting Response" as ApplicationStatus,
            updatedAt,
          }
        : application,
    );
    const newActivities = transitionedApplications.map((application) =>
      createActivity(
        application.id,
        "status_changed",
        "Status changed to Awaiting Response after the follow-up window elapsed.",
        updatedAt,
      ),
    );

    void indexedDbStorageAdapter
      .commitMutation({
        activities: newActivities,
        applications: updatedApplications.filter((application) =>
          transitionedIds.has(application.id),
        ),
      })
      .then(() => {
        setApplications(updatedApplications);
        setActivities((current) => sortActivities([...newActivities, ...current]));
        setStorageError(null);
      })
      .catch((error: unknown) => {
        setStorageError(getStorageErrorMessage(error));
      });
  }, [
    applications,
    isStorageLoading,
    settings.defaultFollowUpPromptDays,
    storageError,
  ]);

  function retryStorage() {
    setStorageRetryKey((current) => current + 1);
  }

  async function appendActivity(
    applicationId: string,
    type: Activity["type"],
    message: string,
  ) {
    const activity = createActivity(applicationId, type, message);
    const result = await commitMutation({ activities: [activity] });

    if (!result.ok) {
      return result;
    }

    setActivities((current) => sortActivities([activity, ...current]));
    return success();
  }

  async function createApplication(
    input: ApplicationInput,
    pendingResume?: PendingResumeUpload,
  ): Promise<MutationResult<Application>> {
    const createdAt = createTimestamp();
    let resumeUpload: ResumeUploadResult | undefined;

    if (pendingResume) {
      try {
        resumeUpload = await createResumeUploadResult({
          existingResumes: resumes,
          file: pendingResume.file,
          options: pendingResume.options ?? {},
        });
      } catch (error) {
        return failure(error);
      }
    }

    const application: Application = {
      ...input,
      id: createId("app"),
      dateApplied: input.dateApplied || createDateStamp(),
      resumeId: resumeUpload?.resume.id ?? input.resumeId,
      status: input.status || "Just Applied",
      contactsCount: 0,
      createdAt,
      updatedAt: createdAt,
    };
    const createdActivity = createActivity(
      application.id,
      "created",
      `Created application for ${application.jobTitle}.`,
      createdAt,
    );
    const interview = buildInterviewRecord(application, [], createdAt);
    const markedResume = resumeUpload
      ? resumeUpload.resume
      : getMarkedResume(application.resumeId, createdAt);
    const result = await commitMutation({
      activities: [createdActivity],
      applications: [application],
      interviews: interview ? [interview] : undefined,
      resumes: markedResume ? [markedResume] : undefined,
      resumeFiles: resumeUpload
        ? [{ storageKey: resumeUpload.resume.storageKey, file: pendingResume!.file }]
        : undefined,
    });

    if (!result.ok) {
      return result;
    }

    setApplications((current) => [application, ...current]);
    setActivities((current) => sortActivities([createdActivity, ...current]));

    if (interview) {
      setInterviews((current) => [interview, ...current]);
    }

    if (markedResume) {
      setResumes((current) =>
        sortResumes([
          markedResume,
          ...current.filter((resume) => resume.id !== markedResume.id),
        ]),
      );
    }

    return success(application);
  }

  function getMarkedResume(resumeId: string | undefined, timestamp: string) {
    if (!resumeId) {
      return undefined;
    }

    const currentResume = resumes.find((resume) => resume.id === resumeId);

    if (!currentResume) {
      return undefined;
    }

    return markResumeUsed(currentResume, timestamp);
  }

  async function updateApplication(
    id: string,
    input: ApplicationUpdate,
    pendingResume?: PendingResumeUpload,
  ): Promise<MutationResult> {
    const currentApplication = applications.find(
      (application) => application.id === id,
    );

    if (!currentApplication) {
      return failure("Application could not be found.");
    }

    let resumeUpload: ResumeUploadResult | undefined;

    if (pendingResume) {
      try {
        resumeUpload = await createResumeUploadResult({
          existingResumes: resumes,
          file: pendingResume.file,
          options: pendingResume.options ?? {},
        });
      } catch (error) {
        return failure(error);
      }
    }

    const updatedAt = createTimestamp();
    const updatedApplication: Application = {
      ...currentApplication,
      ...input,
      resumeId:
        resumeUpload?.resume.id ??
        ("resumeId" in input ? input.resumeId : currentApplication.resumeId),
      updatedAt,
    };
    const newActivities = buildApplicationUpdateActivities(
      currentApplication,
      updatedApplication,
      input,
      updatedAt,
    );
    const updatedInterview = shouldPersistInterviewUpdate(
      currentApplication,
      input,
    )
      ? buildInterviewRecord(updatedApplication, interviews, updatedAt)
      : undefined;
    const markedResume = resumeUpload
      ? resumeUpload.resume
      : shouldMarkResumeUsed(currentApplication.resumeId, updatedApplication.resumeId)
        ? getMarkedResume(updatedApplication.resumeId, updatedAt)
        : undefined;
    const result = await commitMutation({
      activities: newActivities,
      applications: [updatedApplication],
      interviews: updatedInterview ? [updatedInterview] : undefined,
      resumes: markedResume ? [markedResume] : undefined,
      resumeFiles: resumeUpload
        ? [{ storageKey: resumeUpload.resume.storageKey, file: pendingResume!.file }]
        : undefined,
    });

    if (!result.ok) {
      return result;
    }

    setApplications((current) =>
      current.map((application) =>
        application.id === id ? updatedApplication : application,
      ),
    );

    if (updatedInterview) {
      setInterviews((current) =>
        upsertInterviewHistory(current, updatedInterview),
      );
    }

    if (newActivities.length > 0) {
      setActivities((current) => sortActivities([...newActivities, ...current]));
    }

    if (markedResume) {
      setResumes((current) =>
        sortResumes([
          markedResume,
          ...current.filter((resume) => resume.id !== markedResume.id),
        ]),
      );
    }

    return success();
  }

  async function archiveApplication(id: string): Promise<MutationResult> {
    const application = applications.find((candidate) => candidate.id === id);

    if (!application) {
      return failure("Application could not be found.");
    }

    const updatedAt = createTimestamp();
    const archivedApplication = {
      ...application,
      archivedAt: updatedAt,
      updatedAt,
    };
    const activity = createActivity(id, "archived", "Archived application.", updatedAt);
    const result = await commitMutation({
      activities: [activity],
      applications: [archivedApplication],
    });

    if (!result.ok) {
      return result;
    }

    setApplications((current) =>
      current.map((candidate) =>
        candidate.id === id ? archivedApplication : candidate,
      ),
    );
    setActivities((current) => sortActivities([activity, ...current]));
    return success();
  }

  async function restoreApplication(id: string): Promise<MutationResult> {
    const application = applications.find((candidate) => candidate.id === id);

    if (!application) {
      return failure("Application could not be found.");
    }

    const updatedAt = createTimestamp();
    const restoredApplication = {
      ...application,
      archivedAt: undefined,
      updatedAt,
    };
    const activity = createActivity(id, "restored", "Restored application.", updatedAt);
    const result = await commitMutation({
      activities: [activity],
      applications: [restoredApplication],
    });

    if (!result.ok) {
      return result;
    }

    setApplications((current) =>
      current.map((candidate) =>
        candidate.id === id ? restoredApplication : candidate,
      ),
    );
    setActivities((current) => sortActivities([activity, ...current]));
    return success();
  }

  async function deleteApplication(id: string): Promise<MutationResult> {
    try {
      await indexedDbStorageAdapter.deleteApplication(id);
      setStorageError(null);
    } catch (error) {
      const message = getStorageErrorMessage(error);
      setStorageError(message);
      return failure(message);
    }

    setApplications((current) =>
      current.filter((application) => application.id !== id),
    );
    setContacts((current) =>
      current.filter((contact) => contact.applicationId !== id),
    );
    setActivities((current) =>
      current.filter((activity) => activity.applicationId !== id),
    );
    setInterviews((current) =>
      current.filter((interview) => interview.applicationId !== id),
    );
    return success();
  }

  async function addContact(
    input: ContactInput,
  ): Promise<MutationResult<ApplicationContact>> {
    const createdAt = createTimestamp();
    const contact: ApplicationContact = {
      ...input,
      id: createId("contact"),
      createdAt,
      updatedAt: createdAt,
    };
    const activity = createActivity(
      input.applicationId,
      "contact_created",
      `Added contact ${contact.name}.`,
      createdAt,
    );
    const updatedApplications = applications.map((application) =>
      application.id === input.applicationId
        ? {
            ...application,
            contactsCount: application.contactsCount + 1,
            updatedAt: createdAt,
          }
        : application,
    );
    const updatedApplication = updatedApplications.find(
      (application) => application.id === input.applicationId,
    );
    const result = await commitMutation({
      activities: [activity],
      applications: updatedApplication ? [updatedApplication] : undefined,
      contacts: [contact],
    });

    if (!result.ok) {
      return result;
    }

    setContacts((current) => [contact, ...current]);
    setApplications(updatedApplications);
    setActivities((current) => sortActivities([activity, ...current]));

    return success(contact);
  }

  async function updateContact(
    id: string,
    input: Partial<ContactInput>,
  ): Promise<MutationResult> {
    const contact = contacts.find((candidate) => candidate.id === id);

    if (!contact) {
      return failure("Contact could not be found.");
    }

    const updatedAt = createTimestamp();
    const updatedContact = {
      ...contact,
      ...input,
      updatedAt,
    };
    const activity = createActivity(
      contact.applicationId,
      "contact_updated",
      `Updated contact ${updatedContact.name}.`,
      updatedAt,
    );
    const result = await commitMutation({
      activities: [activity],
      contacts: [updatedContact],
    });

    if (!result.ok) {
      return result;
    }

    setContacts((current) =>
      current.map((candidate) => (candidate.id === id ? updatedContact : candidate)),
    );
    setActivities((current) => sortActivities([activity, ...current]));
    return success();
  }

  async function deleteContact(id: string): Promise<MutationResult> {
    const contact = contacts.find((candidate) => candidate.id === id);

    if (!contact) {
      return failure("Contact could not be found.");
    }

    const updatedAt = createTimestamp();
    const activity = createActivity(
      contact.applicationId,
      "contact_deleted",
      `Deleted contact ${contact.name}.`,
      updatedAt,
    );
    const updatedApplications = applications.map((application) =>
      application.id === contact.applicationId
        ? {
            ...application,
            contactsCount: Math.max(0, application.contactsCount - 1),
            updatedAt,
          }
        : application,
    );
    const updatedApplication = updatedApplications.find(
      (application) => application.id === contact.applicationId,
    );
    const result = await commitMutation({
      activities: [activity],
      applications: updatedApplication ? [updatedApplication] : undefined,
      deleteContactIds: [id],
    });

    if (!result.ok) {
      return result;
    }

    setContacts((current) => current.filter((candidate) => candidate.id !== id));
    setApplications(updatedApplications);
    setActivities((current) => sortActivities([activity, ...current]));
    return success();
  }

  async function uploadResume(
    file: File,
    options: ResumeUploadOptions = {},
  ): Promise<ResumeUploadResult> {
    const result = await createResumeUploadResult({
      existingResumes: resumes,
      file,
      options,
    });

    try {
      await indexedDbStorageAdapter.saveResume(result.resume, file);
      setStorageError(null);
      setResumes((current) => sortResumes([result.resume, ...current]));
    } catch (error) {
      setStorageError(getStorageErrorMessage(error));
      throw error;
    }

    return result;
  }

  async function updateResume(
    id: string,
    input: ResumeMetadataUpdate,
  ): Promise<MutationResult> {
    const currentResume = resumes.find((resume) => resume.id === id);

    if (!currentResume) {
      return failure("Resume metadata could not be found.");
    }

    const updatedResume = updateResumeMetadata(currentResume, input);
    const result = await commitMutation({ resumes: [updatedResume] });

    if (!result.ok) {
      return result;
    }

    setResumes((current) =>
      sortResumes(
        current.map((resume) => (resume.id === id ? updatedResume : resume)),
      ),
    );
    return success();
  }

  async function deleteResume(id: string): Promise<MutationResult> {
    const currentResume = resumes.find((resume) => resume.id === id);

    if (!currentResume) {
      return failure("Resume metadata could not be found.");
    }

    const updatedAt = createTimestamp();
    const linkedApplications = applications.filter(
      (application) => application.resumeId === id,
    );
    const updatedApplications = linkedApplications.map((application) => ({
      ...application,
      resumeId: undefined,
      updatedAt,
    }));
    const result = await commitMutation({
      applications: updatedApplications,
      deleteResumeIds: [id],
      deleteResumeFileKeys: [currentResume.storageKey],
    });

    if (!result.ok) {
      return result;
    }

    setResumes((current) => current.filter((resume) => resume.id !== id));
    setApplications((current) =>
      current.map((application) =>
        application.resumeId === id
          ? { ...application, resumeId: undefined, updatedAt }
          : application,
      ),
    );
    return success();
  }

  async function getResumeFile(id: string) {
    const resume = resumes.find((candidate) => candidate.id === id);

    if (!resume) {
      throw new Error("Resume metadata could not be found.");
    }

    const file = await indexedDbStorageAdapter.getResumeFile(resume.storageKey);

    if (!file) {
      throw new Error("The resume file is missing from local storage.");
    }

    return file;
  }

  async function exportFullBackup() {
    const snapshot = await indexedDbStorageAdapter.exportSnapshot();
    const resumeFileBackups = await Promise.all(
      snapshot.resumes.map(async (resume) => {
        const file = await indexedDbStorageAdapter.getResumeFile(resume.storageKey);

        if (!file) {
          if (resume.fileSize <= 0) {
            return null;
          }

          throw new Error(
            `The stored file for "${resume.displayName}" is missing.`,
          );
        }

        return {
          dataBase64: await blobToBase64(file),
          mimeType: file.type || resume.mimeType,
          storageKey: resume.storageKey,
        };
      }),
    );
    const resumeFiles = resumeFileBackups.filter(
      (resumeFile) => resumeFile !== null,
    );

    return createBackupFile({ resumeFiles, snapshot });
  }

  async function previewBackupImport(file: File) {
    return getBackupImportPreview(await parseBackupFile(file));
  }

  async function importFullBackup(file: File) {
    const backup = await parseBackupFile(file);
    const applications = withContactCounts(
      backup.snapshot.applications,
      backup.snapshot.contacts,
    );
    const snapshot = { ...backup.snapshot, applications };
    const resumeFiles: ResumeBlobRecord[] = backup.resumeFiles.map(
      (resumeFile) => ({
        file: base64ToBlob(resumeFile.dataBase64, resumeFile.mimeType),
        storageKey: resumeFile.storageKey,
      }),
    );

    await indexedDbStorageAdapter.importSnapshot(snapshot, resumeFiles);

    setActivities(sortActivities(snapshot.activities));
    setAnalyticsSettings(snapshot.analyticsSettings);
    setApplications(snapshot.applications);
    setContacts(snapshot.contacts);
    setInterviews(snapshot.interviews);
    setNotificationState(snapshot.notificationState);
    setResumes(sortResumes(snapshot.resumes));
    setSettings(snapshot.settings);
    setTablePreferences(snapshot.tablePreferences);
  }

  function exportApplicationsCsv() {
    return createApplicationsCsv({ applications, resumes });
  }

  async function dismissNotification(id: string) {
    const dismissedNotificationIds = Array.from(
      new Set([...notificationState.dismissedNotificationIds, id]),
    );
    const updatedState = {
      ...notificationState,
      dismissedNotificationIds,
    };

    return persistThenUpdate(
      indexedDbStorageAdapter.saveNotificationState(updatedState),
      () => setNotificationState(updatedState),
    );
  }

  async function markNotificationsOpened() {
    const updatedState = {
      ...notificationState,
      lastOpenedAt: createTimestamp(),
    };

    return persistThenUpdate(
      indexedDbStorageAdapter.saveNotificationState(updatedState),
      () => setNotificationState(updatedState),
    );
  }

  async function updateSettings(input: Partial<UserSettings>) {
    const updatedSettings = {
      ...settings,
      ...input,
    };

    return persistThenUpdate(
      indexedDbStorageAdapter.saveSettings(updatedSettings),
      () => setSettings(updatedSettings),
    );
  }

  async function updateAnalyticsSettings(input: Partial<AnalyticsSettings>) {
    const updatedSettings = {
      ...analyticsSettings,
      ...input,
    };

    return persistThenUpdate(
      indexedDbStorageAdapter.saveAnalyticsSettings(updatedSettings),
      () => setAnalyticsSettings(updatedSettings),
    );
  }

  async function resetSettings() {
    return persistThenUpdate(indexedDbStorageAdapter.resetSettings(), () =>
      setSettings(DEFAULT_USER_SETTINGS),
    );
  }

  async function updateTablePreferences(input: Partial<TablePreferences>) {
    const updatedTablePreferences = {
      ...tablePreferences,
      ...input,
    } as TablePreferences;

    return persistThenUpdate(
      indexedDbStorageAdapter.saveTablePreferences(updatedTablePreferences),
      () => setTablePreferences(updatedTablePreferences),
    );
  }

  async function resetTablePreferences() {
    return persistThenUpdate(indexedDbStorageAdapter.resetTablePreferences(), () =>
      setTablePreferences(null),
    );
  }

  async function commitMutation(
    mutation: StorageMutation,
  ): Promise<MutationResult> {
    try {
      await indexedDbStorageAdapter.commitMutation(mutation);
      setStorageError(null);
      return success();
    } catch (error) {
      const message = getStorageErrorMessage(error);
      setStorageError(message);
      return failure(message);
    }
  }

  async function persistThenUpdate(
    promise: Promise<unknown>,
    updateState: () => void,
  ) {
    try {
      await promise;
      updateState();
      setStorageError(null);
      return true;
    } catch (error) {
      setStorageError(getStorageErrorMessage(error));
      return false;
    }
  }

  return {
    activities,
    analyticsSettings,
    applications,
    contacts,
    interviews,
    isStorageLoading,
    notificationState,
    resumes,
    retryStorage,
    settings,
    storageError,
    tablePreferences,
    addContact,
    appendActivity,
    archiveApplication,
    createApplication,
    deleteApplication,
    deleteContact,
    deleteResume,
    dismissNotification,
    exportApplicationsCsv,
    exportFullBackup,
    getResumeFile,
    importFullBackup,
    previewBackupImport,
    resetSettings,
    resetTablePreferences,
    restoreApplication,
    markNotificationsOpened,
    updateResume,
    uploadResume,
    updateApplication,
    updateAnalyticsSettings,
    updateContact,
    updateSettings,
    updateTablePreferences,
  };
}

function createActivity(
  applicationId: string,
  type: Activity["type"],
  message: string,
  createdAt = createTimestamp(),
): Activity {
  return {
    id: createId("activity"),
    applicationId,
    type,
    message,
    createdAt,
  };
}

function sortActivities(activities: Activity[]) {
  return [...activities].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

function sortResumes(resumes: ResumeMetadata[]) {
  return [...resumes].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

function withContactCounts(
  applications: Application[],
  contacts: ApplicationContact[],
) {
  return applications.map((application) => ({
    ...application,
    contactsCount: contacts.filter(
      (contact) => contact.applicationId === application.id,
    ).length,
  }));
}

function buildApplicationUpdateActivities(
  previous: Application,
  next: Application,
  input: ApplicationUpdate,
  createdAt: string,
) {
  const activities: Activity[] = [];

  if (previous.status !== next.status) {
    activities.push(
      createActivity(
        next.id,
        "status_changed",
        `Status changed to ${next.status}.`,
        createdAt,
      ),
    );
  }

  if (
    previous.followUpDate !== next.followUpDate ||
    previous.followUpNeeded !== next.followUpNeeded ||
    previous.followUpPromptDays !== next.followUpPromptDays
  ) {
    activities.push(
      createActivity(next.id, "updated", "Updated follow-up details.", createdAt),
    );
  }

  if (hasInterviewChange(input)) {
    activities.push(
      createActivity(next.id, "updated", "Updated interview details.", createdAt),
    );
  }

  return activities;
}

function hasInterviewChange(input: ApplicationUpdate) {
  return [
    "interviewDateTime",
    "interviewDeadline",
    "interviewLocation",
    "interviewMeetingUrl",
    "interviewMode",
    "interviewPlatform",
    "interviewProctored",
    "interviewRound",
    "interviewType",
  ].some((key) => key in input);
}

function shouldPersistInterviewUpdate(
  application: Application,
  input: ApplicationUpdate,
) {
  return (
    hasInterviewChange(input) ||
    (input.status === "Interviewing" && application.status !== "Interviewing")
  );
}

function getStorageErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Local storage is unavailable right now.";
}

function success(): MutationResult;
function success<Value>(value: Value): MutationResult<Value>;
function success<Value>(value?: Value): MutationResult<Value | void> {
  return { ok: true, value };
}

function failure(error: unknown): { error: string; ok: false } {
  return {
    error:
      typeof error === "string" ? error : getStorageErrorMessage(error),
    ok: false,
  };
}

function daysSince(dateStamp: string, now: Date) {
  const date = new Date(dateStamp);
  const millisecondsPerDay = 24 * 60 * 60 * 1000;

  return Math.floor((now.getTime() - date.getTime()) / millisecondsPerDay);
}
