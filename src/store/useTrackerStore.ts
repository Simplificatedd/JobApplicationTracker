import { useEffect, useRef, useState } from "react";
import type { AnalyticsSettings } from "../types/analytics";
import type {
  Activity,
  Application,
  ApplicationContact,
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
import {
  buildInterviewRecord,
  reconcileCanonicalInterviews,
  upsertInterviewHistory,
} from "../lib/interviews";
import { createMutationQueue } from "../lib/mutationQueue";
import { cloudStorageAdapter } from "../storage/cloudStorageAdapter";
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
  cloudAccountEmail: string | null;
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
  const [cloudAccountEmail, setCloudAccountEmail] = useState<string | null>(null);
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
  const analyticsMutationQueue = useRef(createMutationQueue()).current;
  const [applicationMutationQueue] = useState(createMutationQueue);
  const notificationMutationQueue = useRef(createMutationQueue()).current;
  const settingsMutationQueue = useRef(createMutationQueue()).current;
  const tablePreferencesMutationQueue = useRef(createMutationQueue()).current;

  useEffect(() => {
    let isActive = true;

    setIsStorageLoading(true);
    setStorageError(null);

    cloudStorageAdapter
      .initialize()
      .then(async (snapshot) => {
        if (!isActive) {
          return;
        }

        const interviewReconciliation = reconcileCanonicalInterviews(
          snapshot.applications,
          snapshot.interviews,
        );

        if (
          interviewReconciliation.applicationWrites.length > 0 ||
          interviewReconciliation.interviewWrites.length > 0
        ) {
          await cloudStorageAdapter.commitMutation({
            applications: interviewReconciliation.applicationWrites,
            interviews: interviewReconciliation.interviewWrites,
          });
        }

        if (!isActive) {
          return;
        }

        setActivities(sortActivities(snapshot.activities));
        setAnalyticsSettings(snapshot.analyticsSettings);
        setApplications(
          withContactCounts(
            interviewReconciliation.applications,
            snapshot.contacts,
          ),
        );
        setContacts(snapshot.contacts);
        setInterviews(interviewReconciliation.interviews);
        setNotificationState(snapshot.notificationState);
        setResumes(snapshot.resumes);
        setSettings(snapshot.settings);
        setTablePreferences(snapshot.tablePreferences);
        setCloudAccountEmail(cloudStorageAdapter.getAccount()?.email ?? null);
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

  function retryStorage() {
    setStorageRetryKey((current) => current + 1);
  }

  function runApplicationMutation<Value>(
    operation: () => Promise<MutationResult<Value>>,
  ) {
    return applicationMutationQueue.run(async () => {
      try {
        return await operation();
      } catch (error) {
        const message = getStorageErrorMessage(error);

        setStorageError(message);
        return failure(message);
      }
    });
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
    return runApplicationMutation(() =>
      createApplicationNow(input, pendingResume),
    );
  }

  async function createApplicationNow(
    input: ApplicationInput,
    pendingResume?: PendingResumeUpload,
  ): Promise<MutationResult<Application>> {
    const createdAt = createTimestamp();
    const currentResumes = await cloudStorageAdapter.listResumeMetadata();
    let resumeUpload: ResumeUploadResult | undefined;

    if (pendingResume) {
      try {
        resumeUpload = await createResumeUploadResult({
          existingResumes: currentResumes,
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
      : getMarkedResume(application.resumeId, createdAt, currentResumes);
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

  function getMarkedResume(
    resumeId: string | undefined,
    timestamp: string,
    availableResumes = resumes,
  ) {
    if (!resumeId) {
      return undefined;
    }

    const currentResume = availableResumes.find(
      (resume) => resume.id === resumeId,
    );

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
    return runApplicationMutation(() =>
      updateApplicationNow(id, input, pendingResume),
    );
  }

  async function updateApplicationNow(
    id: string,
    input: ApplicationUpdate,
    pendingResume?: PendingResumeUpload,
  ): Promise<MutationResult> {
    const [currentApplication, currentInterviews, currentResumes] =
      await Promise.all([
        cloudStorageAdapter.getApplication(id),
        cloudStorageAdapter.listInterviews(id),
        cloudStorageAdapter.listResumeMetadata(),
      ]);

    if (!currentApplication) {
      return failure("Application could not be found.");
    }

    let resumeUpload: ResumeUploadResult | undefined;

    if (pendingResume) {
      try {
        resumeUpload = await createResumeUploadResult({
          existingResumes: currentResumes,
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
      ? buildInterviewRecord(updatedApplication, currentInterviews, updatedAt)
      : undefined;
    const markedResume = resumeUpload
      ? resumeUpload.resume
      : shouldMarkResumeUsed(currentApplication.resumeId, updatedApplication.resumeId)
        ? getMarkedResume(
            updatedApplication.resumeId,
            updatedAt,
            currentResumes,
          )
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
    return runApplicationMutation(async () => {
      const application = await cloudStorageAdapter.getApplication(id);

      if (!application) {
        return failure("Application could not be found.");
      }

      const updatedAt = createTimestamp();
      const archivedApplication = {
        ...application,
        archivedAt: updatedAt,
        updatedAt,
      };
      const activity = createActivity(
        id,
        "archived",
        "Archived application.",
        updatedAt,
      );
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
    });
  }

  async function restoreApplication(id: string): Promise<MutationResult> {
    return runApplicationMutation(async () => {
      const application = await cloudStorageAdapter.getApplication(id);

      if (!application) {
        return failure("Application could not be found.");
      }

      const updatedAt = createTimestamp();
      const restoredApplication = {
        ...application,
        archivedAt: undefined,
        updatedAt,
      };
      const activity = createActivity(
        id,
        "restored",
        "Restored application.",
        updatedAt,
      );
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
    });
  }

  async function deleteApplication(id: string): Promise<MutationResult> {
    return runApplicationMutation(async () => {
      await cloudStorageAdapter.deleteApplication(id);
      setStorageError(null);

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
    });
  }

  async function addContact(
    input: ContactInput,
  ): Promise<MutationResult<ApplicationContact>> {
    return runApplicationMutation(async () => {
      const [application, currentContacts] = await Promise.all([
        cloudStorageAdapter.getApplication(input.applicationId),
        cloudStorageAdapter.listContacts(input.applicationId),
      ]);

      if (!application) {
        return failure("Application could not be found.");
      }

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
      const updatedApplication = {
        ...application,
        contactsCount: currentContacts.length + 1,
        updatedAt: createdAt,
      };
      const result = await commitMutation({
        activities: [activity],
        applications: [updatedApplication],
        contacts: [contact],
      });

      if (!result.ok) {
        return result;
      }

      setContacts((current) => [contact, ...current]);
      setApplications((current) =>
        current.map((candidate) =>
          candidate.id === updatedApplication.id
            ? updatedApplication
            : candidate,
        ),
      );
      setActivities((current) => sortActivities([activity, ...current]));

      return success(contact);
    });
  }

  async function updateContact(
    id: string,
    input: Partial<ContactInput>,
  ): Promise<MutationResult> {
    return runApplicationMutation(async () => {
      const contact = (await cloudStorageAdapter.listContacts()).find(
        (candidate) => candidate.id === id,
      );

      if (!contact) {
        return failure("Contact could not be found.");
      }

      if (!(await cloudStorageAdapter.getApplication(contact.applicationId))) {
        return failure("Application could not be found.");
      }

      const updatedAt = createTimestamp();
      const updatedContact = {
        ...contact,
        ...input,
        applicationId: contact.applicationId,
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
        current.map((candidate) =>
          candidate.id === id ? updatedContact : candidate,
        ),
      );
      setActivities((current) => sortActivities([activity, ...current]));
      return success();
    });
  }

  async function deleteContact(id: string): Promise<MutationResult> {
    return runApplicationMutation(async () => {
      const currentContacts = await cloudStorageAdapter.listContacts();
      const contact = currentContacts.find((candidate) => candidate.id === id);

      if (!contact) {
        return failure("Contact could not be found.");
      }

      const application = await cloudStorageAdapter.getApplication(
        contact.applicationId,
      );

      if (!application) {
        return failure("Application could not be found.");
      }

      const updatedAt = createTimestamp();
      const activity = createActivity(
        contact.applicationId,
        "contact_deleted",
        `Deleted contact ${contact.name}.`,
        updatedAt,
      );
      const updatedApplication = {
        ...application,
        contactsCount: currentContacts.filter(
          (candidate) =>
            candidate.applicationId === contact.applicationId &&
            candidate.id !== id,
        ).length,
        updatedAt,
      };
      const result = await commitMutation({
        activities: [activity],
        applications: [updatedApplication],
        deleteContactIds: [id],
      });

      if (!result.ok) {
        return result;
      }

      setContacts((current) =>
        current.filter((candidate) => candidate.id !== id),
      );
      setApplications((current) =>
        current.map((candidate) =>
          candidate.id === updatedApplication.id
            ? updatedApplication
            : candidate,
        ),
      );
      setActivities((current) => sortActivities([activity, ...current]));
      return success();
    });
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
      await cloudStorageAdapter.saveResume(result.resume, file);
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
    return runApplicationMutation(async () => {
      const [currentResumes, currentApplications] = await Promise.all([
        cloudStorageAdapter.listResumeMetadata(),
        cloudStorageAdapter.listApplications(),
      ]);
      const currentResume = currentResumes.find((resume) => resume.id === id);

      if (!currentResume) {
        return failure("Resume metadata could not be found.");
      }

      const updatedAt = createTimestamp();
      const linkedApplications = currentApplications.filter(
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
    });
  }

  async function getResumeFile(id: string) {
    const resume = resumes.find((candidate) => candidate.id === id);

    if (!resume) {
      throw new Error("Resume metadata could not be found.");
    }

    const file = await cloudStorageAdapter.getResumeFile(resume.storageKey);

    if (!file) {
      throw new Error("The resume file is missing from local storage.");
    }

    return file;
  }

  async function exportFullBackup() {
    const snapshot = await cloudStorageAdapter.exportSnapshot();
    const resumeFileBackups = await Promise.all(
      snapshot.resumes.map(async (resume) => {
        const file = await cloudStorageAdapter.getResumeFile(resume.storageKey);

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
    await applicationMutationQueue.run(() => importFullBackupNow(file));
  }

  async function importFullBackupNow(file: File) {
    const backup = await parseBackupFile(file);
    const applications = withContactCounts(
      backup.snapshot.applications,
      backup.snapshot.contacts,
    );
    const interviewReconciliation = reconcileCanonicalInterviews(
      applications,
      backup.snapshot.interviews,
    );
    const snapshot = {
      ...backup.snapshot,
      applications: interviewReconciliation.applications,
      interviews: interviewReconciliation.interviews,
    };
    const resumeFiles: ResumeBlobRecord[] = backup.resumeFiles.map(
      (resumeFile) => ({
        file: base64ToBlob(resumeFile.dataBase64, resumeFile.mimeType),
        storageKey: resumeFile.storageKey,
      }),
    );

    await cloudStorageAdapter.importSnapshot(snapshot, resumeFiles);

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
    return notificationMutationQueue.run(async () => {
      try {
        const currentState = await cloudStorageAdapter.getNotificationState();
        const dismissedNotificationIds = Array.from(
          new Set([...currentState.dismissedNotificationIds, id]),
        );
        const updatedState = {
          ...currentState,
          dismissedNotificationIds,
        };

        return persistThenUpdate(
          cloudStorageAdapter.saveNotificationState(updatedState),
          () => setNotificationState(updatedState),
        );
      } catch (error) {
        setStorageError(getStorageErrorMessage(error));
        return false;
      }
    });
  }

  async function markNotificationsOpened() {
    return notificationMutationQueue.run(async () => {
      try {
        const currentState = await cloudStorageAdapter.getNotificationState();
        const updatedState = {
          ...currentState,
          lastOpenedAt: createTimestamp(),
        };

        return persistThenUpdate(
          cloudStorageAdapter.saveNotificationState(updatedState),
          () => setNotificationState(updatedState),
        );
      } catch (error) {
        setStorageError(getStorageErrorMessage(error));
        return false;
      }
    });
  }

  async function updateSettings(input: Partial<UserSettings>) {
    return settingsMutationQueue.run(async () => {
      try {
        const currentSettings = await cloudStorageAdapter.getSettings();
        const updatedSettings = {
          ...currentSettings,
          ...input,
        };

        return persistThenUpdate(
          cloudStorageAdapter.saveSettings(updatedSettings),
          () => setSettings(updatedSettings),
        );
      } catch (error) {
        setStorageError(getStorageErrorMessage(error));
        return false;
      }
    });
  }

  async function updateAnalyticsSettings(input: Partial<AnalyticsSettings>) {
    return analyticsMutationQueue.run(async () => {
      try {
        const currentSettings =
          await cloudStorageAdapter.getAnalyticsSettings();
        const updatedSettings = {
          ...currentSettings,
          ...input,
        };

        return persistThenUpdate(
          cloudStorageAdapter.saveAnalyticsSettings(updatedSettings),
          () => setAnalyticsSettings(updatedSettings),
        );
      } catch (error) {
        setStorageError(getStorageErrorMessage(error));
        return false;
      }
    });
  }

  async function resetSettings() {
    return settingsMutationQueue.run(() =>
      persistThenUpdate(cloudStorageAdapter.resetSettings(), () =>
        setSettings(DEFAULT_USER_SETTINGS),
      ),
    );
  }

  async function updateTablePreferences(input: Partial<TablePreferences>) {
    return tablePreferencesMutationQueue.run(async () => {
      try {
        const currentPreferences =
          await cloudStorageAdapter.getTablePreferences();
        const updatedTablePreferences = {
          ...currentPreferences,
          ...input,
        } as TablePreferences;

        return persistThenUpdate(
          cloudStorageAdapter.saveTablePreferences(updatedTablePreferences),
          () => setTablePreferences(updatedTablePreferences),
        );
      } catch (error) {
        setStorageError(getStorageErrorMessage(error));
        return false;
      }
    });
  }

  async function resetTablePreferences() {
    return tablePreferencesMutationQueue.run(() =>
      persistThenUpdate(
        cloudStorageAdapter.resetTablePreferences(),
        () => setTablePreferences(null),
      ),
    );
  }

  async function commitMutation(
    mutation: StorageMutation,
  ): Promise<MutationResult> {
    try {
      await cloudStorageAdapter.commitMutation(mutation);
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
    cloudAccountEmail,
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
