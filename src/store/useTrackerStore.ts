import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { AnalyticsSettings } from "../types/analytics";
import type {
  Activity,
  Assessment,
  AssessmentInput,
  AssessmentUpdate,
  Application,
  ApplicationContact,
  CoverLetterMetadata,
  Interview,
  InterviewInput,
  InterviewUpdate,
  ResumeMetadata,
} from "../types/application";
import type { NotificationState, UserSettings } from "../types/settings";
import type { TablePreferences } from "../types/tablePreferences";
import {
  base64ToBlob,
  blobToBase64,
  createApplicationsCsv,
  createBackupFile,
  createFullBackupFile,
  getBackupImportPreview,
  parseBackupFile,
  type BackupImportPreview,
} from "../lib/backups";
import {
  createDateStamp,
  createId,
  createTimestamp,
  DEFAULT_ANALYTICS_SETTINGS,
  DEFAULT_APPLICATION_STATUS,
  DEFAULT_NOTIFICATION_STATE,
  DEFAULT_USER_SETTINGS,
  normalizeUserSettings,
} from "../lib/domain";
import {
  createResumeUploadResult,
  createCoverLetterUploadResult,
  markCoverLetterUsed,
  markResumeUsed,
  requiresDuplicateConfirmation,
  shouldMarkResumeUsed,
  type ResumeUploadOptions,
  type ResumeUploadResult,
  updateResumeMetadata,
  updateCoverLetterMetadata,
} from "../lib/resumeFiles";
import {
  applyInterviewProjection,
  buildInterviewRecord,
  createInterviewRecord,
  isValidInterviewRound,
  isUpcomingInterview,
  selectCurrentInterview,
  updateInterviewRecord,
} from "../lib/interviews";
import {
  assessmentFromInterview,
  createAssessment,
  getNextAssessmentNumber,
  validateAssessment,
  type AssessmentActions,
} from "../lib/assessments";
import { createMutationQueue } from "../lib/mutationQueue";
import { cloudStorageAdapter } from "../storage/cloudStorageAdapter";
import { CloudApiError } from "../storage/cloudApi";
import { assertRecordIdentity, equalStoredValue, StorageConflictError } from "../storage/mutationRebase";
import type {
  ResumeBlobRecord,
  StorageMutation,
  StorageSnapshot,
} from "../storage/StorageAdapter";

export type ApplicationInput = Omit<
  Application,
  "id" | "contactsCount" | "createdAt" | "updatedAt" | "archivedAt"
>;

export type ApplicationUpdate = Partial<
  Omit<Application, "id" | "contactsCount" | "createdAt" | "updatedAt">
>;

export interface ResumeUploadAttempt extends ResumeUploadResult {
  saved: boolean;
}

export interface CoverLetterUploadAttempt {
  coverLetter: CoverLetterMetadata;
  duplicateOf?: CoverLetterMetadata;
  saved: boolean;
}

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

export type PendingCoverLetterUpload = PendingResumeUpload;

export type MutationResult<Value = void> =
  { ok: true; value: Value } | { error: string; ok: false };

export interface TrackerStore extends AssessmentActions {
  assessments: Assessment[];
  activities: Activity[];
  analyticsSettings: AnalyticsSettings;
  applications: Application[];
  cloudAccountEmail: string | null;
  cacheWarning: string | null;
  contacts: ApplicationContact[];
  coverLetters: CoverLetterMetadata[];
  interviews: Interview[];
  isStorageLoading: boolean;
  notificationState: NotificationState;
  resumes: ResumeMetadata[];
  retryStorage: () => void;
  repairCache: () => Promise<void>;
  settings: UserSettings;
  storageError: string | null;
  tablePreferences: TablePreferences | null;
  addContact: (input: ContactInput) => Promise<MutationResult<ApplicationContact>>;
  addInterview: (input: InterviewInput) => Promise<MutationResult<Interview>>;
  appendActivity: (
    applicationId: string,
    type: Activity["type"],
    message: string,
  ) => Promise<MutationResult>;
  archiveApplication: (id: string) => Promise<MutationResult>;
  createApplication: (
    input: ApplicationInput,
    pendingResume?: PendingResumeUpload,
    pendingCoverLetter?: PendingCoverLetterUpload,
  ) => Promise<MutationResult<Application>>;
  deleteApplication: (id: string) => Promise<MutationResult>;
  deleteContact: (id: string) => Promise<MutationResult>;
  deleteCoverLetter: (id: string) => Promise<MutationResult>;
  deleteInterview: (id: string) => Promise<MutationResult>;
  deleteResume: (id: string) => Promise<MutationResult>;
  dismissNotification: (id: string) => Promise<boolean>;
  exportApplicationsCsv: () => Blob;
  exportFullBackup: () => Promise<Blob>;
  exportRecoveryBackup: () => Promise<Blob>;
  getResumeFile: (id: string) => Promise<Blob>;
  getCoverLetterFile: (id: string) => Promise<Blob>;
  importFullBackup: (file: File) => Promise<void>;
  previewBackupImport: (file: File) => Promise<BackupImportPreview>;
  resetSettings: () => Promise<boolean>;
  resetTablePreferences: () => Promise<boolean>;
  restoreApplication: (id: string) => Promise<MutationResult>;
  markNotificationsOpened: () => Promise<boolean>;
  updateResume: (
    id: string,
    input: ResumeMetadataUpdate,
    expectedDocument?: ResumeMetadata,
  ) => Promise<MutationResult>;
  updateCoverLetter: (
    id: string,
    input: ResumeMetadataUpdate,
    expectedDocument?: ResumeMetadata,
  ) => Promise<MutationResult>;
  uploadResume: (
    file: File,
    options?: ResumeUploadOptions,
    allowDuplicate?: boolean,
  ) => Promise<ResumeUploadAttempt>;
  uploadCoverLetter: (
    file: File,
    options?: ResumeUploadOptions,
    allowDuplicate?: boolean,
  ) => Promise<CoverLetterUploadAttempt>;
  updateApplication: (
    id: string,
    input: ApplicationUpdate,
    pendingResume?: PendingResumeUpload,
    pendingCoverLetter?: PendingCoverLetterUpload,
    expectedApplication?: Application,
  ) => Promise<MutationResult>;
  updateAnalyticsSettings: (input: Partial<AnalyticsSettings>) => Promise<boolean>;
  updateContact: (
    id: string,
    input: Partial<ContactInput>,
    expectedContact?: ApplicationContact,
  ) => Promise<MutationResult>;
  updateInterview: (
    id: string,
    input: InterviewUpdate,
    expectedInterview?: Interview,
  ) => Promise<MutationResult<Interview>>;
  updateSettings: (input: Partial<UserSettings>) => Promise<boolean>;
  updateTablePreferences: (input: Partial<TablePreferences>) => Promise<boolean>;
}

export function useTrackerStore(): TrackerStore {
  const accountInvalidated = useRef(false);
  const hasHydrated = useRef(false);
  const pendingActions = useRef(new Set<Promise<unknown>>());
  const [activities, setActivities] = useAccountState<Activity[]>([], accountInvalidated);
  const [applications, setApplications] = useAccountState<Application[]>([], accountInvalidated);
  const [contacts, setContacts] = useAccountState<ApplicationContact[]>([], accountInvalidated);
  const [coverLetters, setCoverLetters] = useAccountState<CoverLetterMetadata[]>([], accountInvalidated);
  const [cloudAccountEmail, setCloudAccountEmail] = useAccountState<string | null>(
    null, accountInvalidated,
  );
  const [assessments, setAssessments] = useAccountState<Assessment[]>([], accountInvalidated);
  const [interviews, setInterviews] = useAccountState<Interview[]>([], accountInvalidated);
  const [isStorageLoading, setIsStorageLoading] = useAccountState(true, accountInvalidated);
  const [resumes, setResumes] = useAccountState<ResumeMetadata[]>([], accountInvalidated);
  const [settings, setSettings] =
    useAccountState<UserSettings>(DEFAULT_USER_SETTINGS, accountInvalidated);
  const [analyticsSettings, setAnalyticsSettings] = useAccountState<AnalyticsSettings>(
    DEFAULT_ANALYTICS_SETTINGS, accountInvalidated,
  );
  const [notificationState, setNotificationState] = useAccountState<NotificationState>(
    DEFAULT_NOTIFICATION_STATE, accountInvalidated,
  );
  const [storageError, setStorageError] = useAccountState<string | null>(null, accountInvalidated);
  const [cacheWarning, setCacheWarning] = useAccountState<string | null>(null, accountInvalidated);
  const [storageRetryKey, setStorageRetryKey] = useState(0);
  const [tablePreferences, setTablePreferences] =
    useAccountState<TablePreferences | null>(null, accountInvalidated);
  const analyticsMutationQueue = useRef(createMutationQueue()).current;
  const [applicationMutationQueue] = useState(createMutationQueue);
  const notificationMutationQueue = useRef(createMutationQueue()).current;
  const settingsMutationQueue = useRef(createMutationQueue()).current;
  const tablePreferencesMutationQueue = useRef(createMutationQueue()).current;

  useEffect(() => {
    let isActive = true;

    const handleAccountChanged = () => {
      if (accountInvalidated.current) return;
      isActive = false;
      setActivities([]);
      setAnalyticsSettings(DEFAULT_ANALYTICS_SETTINGS);
      setApplications([]);
      setAssessments([]);
      setCloudAccountEmail(null);
      setContacts([]);
      setCoverLetters([]);
      setInterviews([]);
      setNotificationState(DEFAULT_NOTIFICATION_STATE);
      setResumes([]);
      setSettings(DEFAULT_USER_SETTINGS);
      setTablePreferences(null);
      setStorageError("Signed-in account changed. Reload the tracker.");
      setCacheWarning(null);
      setIsStorageLoading(false);
      // Clear first, then permanently block publishers from this store instance.
      accountInvalidated.current = true;
    };
    window.addEventListener("tracker-account-changed", handleAccountChanged);
    const unsubscribeCacheWarning = cloudStorageAdapter.subscribeCacheWarning(setCacheWarning);
    setCacheWarning(cloudStorageAdapter.getCacheWarning());

    // Keep loaded editors mounted so retry cannot discard their unsaved drafts.
    if (!hasHydrated.current) setIsStorageLoading(true);

    const load = storageRetryKey === 0
      ? cloudStorageAdapter.initialize()
      : Promise.allSettled([...pendingActions.current]).then(() => {
        if (!isActive || accountInvalidated.current) {
          throw new Error("Signed-in account changed. Reload the tracker.");
        }
        return cloudStorageAdapter.refresh();
      });
    load
      .then(() => {
        if (!isActive) {
          return;
        }

        // A save can finish between the load result and this continuation.
        // Publish the adapter's current acknowledgement, not a captured result.
        const snapshot = cloudStorageAdapter.getCurrentSnapshot();
        hasHydrated.current = true;
        setStorageError(null);
        setActivities(sortActivities(snapshot.activities));
        setAnalyticsSettings(snapshot.analyticsSettings);
        setApplications(
          withContactCounts(snapshot.applications, snapshot.contacts),
        );
        setContacts(snapshot.contacts);
        setCoverLetters(sortResumes(snapshot.coverLetters));
        setInterviews(snapshot.interviews);
        setAssessments(snapshot.assessments ?? []);
        setNotificationState(snapshot.notificationState);
        setResumes(snapshot.resumes);
        setSettings(normalizeUserSettings(snapshot.settings));
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
      window.removeEventListener("tracker-account-changed", handleAccountChanged);
      unsubscribeCacheWarning();
    };
  }, [
    storageRetryKey, setActivities, setAnalyticsSettings, setApplications,
    setAssessments, setCloudAccountEmail, setContacts, setCoverLetters,
    setInterviews, setNotificationState, setResumes, setSettings,
    setTablePreferences, setStorageError, setIsStorageLoading, setCacheWarning,
  ]);

  function assertAccountActive() {
    if (accountInvalidated.current) {
      throw new Error("Signed-in account changed. Reload the tracker.");
    }
  }

  // Track the whole public action, including work before it enters an adapter
  // queue (editor reads, hashing, uploads). Retry waits for already issued edits.
  function trackAction<Args extends unknown[], Result>(
    operation: (...args: Args) => Promise<Result>,
    ...args: Args
  ): Promise<Result> {
    const pending = operation(...args);
    pendingActions.current.add(pending);
    const settled = () => { pendingActions.current.delete(pending); };
    void pending.then(settled, settled);
    return pending;
  }

  function retryStorage() {
    if (accountInvalidated.current) return;
    setStorageRetryKey((current) => current + 1);
  }

  async function repairCache() {
    if (accountInvalidated.current) return;
    try {
      await cloudStorageAdapter.repairCache();
    } catch (error) {
      // Cache I/O is best-effort in the adapter. Rejections here are authoritative
      // failures such as account invalidation; keep the cloud error visible.
      setStorageError(getStorageErrorMessage(error));
    }
  }

  function runApplicationMutation<Value>(
    operation: () => Promise<MutationResult<Value>>,
  ) {
    return applicationMutationQueue.run(async () => {
      try {
        assertAccountActive();
        return await operation();
      } catch (error) {
        return mutationFailure(error);
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

    return success();
  }

  async function createApplication(
    input: ApplicationInput,
    pendingResume?: PendingResumeUpload,
    pendingCoverLetter?: PendingCoverLetterUpload,
  ): Promise<MutationResult<Application>> {
    return runApplicationMutation(() =>
      createApplicationNow(input, pendingResume, pendingCoverLetter),
    );
  }

  async function createApplicationNow(
    input: ApplicationInput,
    pendingResume?: PendingResumeUpload,
    pendingCoverLetter?: PendingCoverLetterUpload,
  ): Promise<MutationResult<Application>> {
    const createdAt = createTimestamp();
    const [currentResumes, currentCoverLetters] = await Promise.all([
      cloudStorageAdapter.listResumeMetadata(),
      cloudStorageAdapter.listCoverLetterMetadata(),
    ]);
    let resumeUpload: ResumeUploadResult | undefined;
    let coverLetterUpload: Awaited<
      ReturnType<typeof createCoverLetterUploadResult>
    > | undefined;

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

    if (pendingCoverLetter) {
      try {
        coverLetterUpload = await createCoverLetterUploadResult({
          existingCoverLetters: currentCoverLetters,
          file: pendingCoverLetter.file,
          options: pendingCoverLetter.options ?? {},
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
      coverLetterId:
        coverLetterUpload?.coverLetter.id ?? input.coverLetterId,
      status: input.status || DEFAULT_APPLICATION_STATUS,
      stageMigrationVersion: 1,
      contactsCount: 0,
      createdAt,
      updatedAt: createdAt,
    };
    const createdActivity = createActivity(
      application.id,
      "created",
      `Created application for ${application.jobTitle}.`,
      createdAt,
      { statusTo: application.status },
    );
    const interview = buildInterviewRecord(application, [], createdAt);
    const markedResume = resumeUpload
      ? resumeUpload.resume
      : getMarkedResume(application.resumeId, createdAt, currentResumes);
    const markedCoverLetter = coverLetterUpload
      ? coverLetterUpload.coverLetter
      : getMarkedCoverLetter(
          application.coverLetterId,
          createdAt,
          currentCoverLetters,
        );
    const result = await commitMutation({
      expected: { resumes: currentResumes, coverLetters: currentCoverLetters },
      creates: {
        applications: [application.id],
        interviews: interview ? [interview.id] : [],
        resumes: resumeUpload ? [resumeUpload.resume.id] : [],
        coverLetters: coverLetterUpload ? [coverLetterUpload.coverLetter.id] : [],
      },
      activities: [createdActivity],
      applications: [application],
      interviews: interview ? [interview] : undefined,
      resumes: markedResume ? [markedResume] : undefined,
      coverLetters: markedCoverLetter ? [markedCoverLetter] : undefined,
      resumeFiles: [
        ...(resumeUpload
          ? [{ storageKey: resumeUpload.resume.storageKey, file: pendingResume!.file }]
          : []),
        ...(coverLetterUpload
          ? [{
              storageKey: coverLetterUpload.coverLetter.storageKey,
              file: pendingCoverLetter!.file,
            }]
          : []),
      ],
    });

    if (!result.ok) {
      return result;
    }

    return success(result.value.applications.find((item) => item.id === application.id)!);
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

  function getMarkedCoverLetter(
    coverLetterId: string | undefined,
    timestamp: string,
    availableCoverLetters = coverLetters,
  ) {
    if (!coverLetterId) {
      return undefined;
    }

    const coverLetter = availableCoverLetters.find(
      (candidate) => candidate.id === coverLetterId,
    );

    return coverLetter ? markCoverLetterUsed(coverLetter, timestamp) : undefined;
  }

  async function updateApplication(
    id: string,
    input: ApplicationUpdate,
    pendingResume?: PendingResumeUpload,
    pendingCoverLetter?: PendingCoverLetterUpload,
    expectedApplication?: Application,
  ): Promise<MutationResult> {
    return runApplicationMutation(() =>
      updateApplicationNow(id, input, pendingResume, pendingCoverLetter, expectedApplication),
    );
  }

  async function updateApplicationNow(
    id: string,
    input: ApplicationUpdate,
    pendingResume?: PendingResumeUpload,
    pendingCoverLetter?: PendingCoverLetterUpload,
    expectedApplication?: Application,
  ): Promise<MutationResult> {
    const [
      currentApplication,
      currentInterviews,
      currentResumes,
      currentCoverLetters,
    ] =
      await Promise.all([
        cloudStorageAdapter.getApplication(id),
        cloudStorageAdapter.listInterviews(id),
        cloudStorageAdapter.listResumeMetadata(),
        cloudStorageAdapter.listCoverLetterMetadata(),
      ]);

    if (!currentApplication) {
      return failure("Application could not be found.");
    }

    const editBase = expectedApplication ?? applications.find((item) => item.id === id);
    if (editBase && editBase.id !== id) {
      return failure("The edit baseline belongs to a different application.");
    }
    if (editBase) assertRecordIdentity(editBase, currentApplication, "Application");
    const beforeApplication = { ...currentApplication };
    if (editBase) {
      for (const key of Object.keys(input) as (keyof ApplicationUpdate)[]) {
        Object.assign(beforeApplication, { [key]: editBase[key] });
      }
      if (pendingResume) beforeApplication.resumeId = editBase.resumeId;
      if (pendingCoverLetter) beforeApplication.coverLetterId = editBase.coverLetterId;
    }

    let resumeUpload: ResumeUploadResult | undefined;
    let coverLetterUpload: Awaited<
      ReturnType<typeof createCoverLetterUploadResult>
    > | undefined;

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

    if (pendingCoverLetter) {
      try {
        coverLetterUpload = await createCoverLetterUploadResult({
          existingCoverLetters: currentCoverLetters,
          file: pendingCoverLetter.file,
          options: pendingCoverLetter.options ?? {},
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
      coverLetterId:
        coverLetterUpload?.coverLetter.id ??
        ("coverLetterId" in input
          ? input.coverLetterId
          : currentApplication.coverLetterId),
      updatedAt,
    };
    const newActivities = buildApplicationUpdateActivities(
      currentApplication,
      updatedApplication,
      input,
      updatedAt,
    );
    const currentInterview = selectCurrentInterview(currentInterviews, new Date(updatedAt));
    const displayedInterview = selectCurrentInterview(
      interviews.filter((item) => item.applicationId === id), new Date(updatedAt),
    );
    if (shouldPersistInterviewUpdate(input) && editBase &&
      displayedInterview?.id !== currentInterview?.id) {
      throw new StorageConflictError("The current interview changed while this table edit was open.");
    }
    const updatedInterview = shouldPersistInterviewUpdate(input)
      ? buildInterviewRecord(
          updatedApplication,
          currentInterviews,
          updatedAt,
          currentInterview?.id,
        )
      : undefined;
    // Application interview fields are projections. Carry their displayed values
    // into the canonical interview baseline, where conflict checks actually run.
    const expectedInterview = updatedInterview && currentInterview
      ? buildInterviewRecord(
          { ...beforeApplication, status: "Interviewing" },
          currentInterviews, updatedAt, currentInterview.id,
        )
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
    const markedCoverLetter = coverLetterUpload
      ? coverLetterUpload.coverLetter
      : shouldMarkResumeUsed(
            currentApplication.coverLetterId,
            updatedApplication.coverLetterId,
          )
        ? getMarkedCoverLetter(
            updatedApplication.coverLetterId,
            updatedAt,
            currentCoverLetters,
          )
        : undefined;
    const result = await commitMutation({
      expected: {
        applications: [beforeApplication],
        interviews: expectedInterview ? [expectedInterview] : currentInterviews,
        resumes: currentResumes, coverLetters: currentCoverLetters,
      },
      creates: {
        interviews: updatedInterview && !currentInterviews.some((item) => item.id === updatedInterview.id) ? [updatedInterview.id] : [],
        resumes: resumeUpload ? [resumeUpload.resume.id] : [],
        coverLetters: coverLetterUpload ? [coverLetterUpload.coverLetter.id] : [],
      },
      activities: newActivities,
      applications: [updatedApplication],
      interviews: updatedInterview ? [updatedInterview] : undefined,
      resumes: markedResume ? [markedResume] : undefined,
      coverLetters: markedCoverLetter ? [markedCoverLetter] : undefined,
      resumeFiles: [
        ...(resumeUpload
          ? [{ storageKey: resumeUpload.resume.storageKey, file: pendingResume!.file }]
          : []),
        ...(coverLetterUpload
          ? [{
              storageKey: coverLetterUpload.coverLetter.storageKey,
              file: pendingCoverLetter!.file,
            }]
          : []),
      ],
    });

    if (!result.ok) {
      return result;
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
        expected: { applications: [application] },
        activities: [activity],
        applications: [archivedApplication],
      });

      if (!result.ok) {
        return result;
      }

      return success();
    });
  }

  function publishSnapshot(snapshot: StorageSnapshot) {
    assertAccountActive();
    setApplications(withContactCounts(snapshot.applications, snapshot.contacts));
    setContacts(snapshot.contacts);
    setInterviews(snapshot.interviews);
    setAssessments(snapshot.assessments ?? []);
    setActivities(sortActivities(snapshot.activities));
    setResumes(sortResumes(snapshot.resumes));
    setCoverLetters(sortResumes(snapshot.coverLetters));
    setSettings(normalizeUserSettings(snapshot.settings));
    setNotificationState(snapshot.notificationState);
    setAnalyticsSettings(snapshot.analyticsSettings);
    setTablePreferences(snapshot.tablePreferences);
  }

  function publishCommittedSnapshot() {
    const saved = cloudStorageAdapter.getCurrentSnapshot();
    publishSnapshot(saved);
    return saved;
  }

  async function mutationFailure(error: unknown) {
    if (error instanceof StorageConflictError && !accountInvalidated.current) {
      // The adapter already received the authoritative conflict snapshot. This
      // hydrates that result; it neither retries the write nor reruns startup.
      try { publishCommittedSnapshot(); } catch { /* Preserve the original conflict. */ }
    }
    const message = getStorageErrorMessage(error);
    setStorageError(message);
    return failure(message);
  }

  async function addAssessment(
    input: AssessmentInput,
  ): Promise<MutationResult<Assessment>> {
    return runApplicationMutation(async () => {
      const error = validateAssessment(input);
      if (error) return failure(error);
      const application = await cloudStorageAdapter.getApplication(
        input.applicationId,
      );
      if (!application || application.archivedAt)
        return failure("Active application could not be found.");
      const timestamp = createTimestamp();
      const assessment = createAssessment(
        input,
        await cloudStorageAdapter.listAssessments(input.applicationId),
        timestamp,
      );
      const result = await commitMutation({
        creates: { assessments: [assessment.id] },
        assessments: [assessment],
        applications: [{ ...application, updatedAt: timestamp }],
        activities: [
          createActivity(
            application.id,
            "updated",
            `Added assessment ${assessment.number}.`,
            timestamp,
          ),
        ],
      });
      if (!result.ok) return result;
      const saved = result.value;
      return success(
        saved.assessments?.find((item) => item.id === assessment.id) ??
          assessment,
      );
    });
  }

  async function updateAssessment(
    id: string,
    input: AssessmentUpdate,
    expectedAssessment?: Assessment,
  ): Promise<MutationResult<Assessment>> {
    return runApplicationMutation(async () => {
      const error = validateAssessment(input);
      if (error) return failure(error);
      const assessment = (await cloudStorageAdapter.listAssessments()).find(
        (item) => item.id === id,
      );
      if (!assessment) return failure("Assessment could not be found.");
      const application = await cloudStorageAdapter.getApplication(
        assessment.applicationId,
      );
      if (!application || application.archivedAt)
        return failure("Active application could not be found.");
      const timestamp = createTimestamp();
      const result = await commitMutation({
        expected: { assessments: [expectedRecord(assessment, expectedAssessment ?? assessments.find((item) => item.id === id), input)] },
        assessmentUpdates: [{ id, changes: input, updatedAt: timestamp }],
        applications: [{ ...application, updatedAt: timestamp }],
        activities: [
          createActivity(
            application.id,
            "updated",
            `Updated assessment ${assessment.number}.`,
            timestamp,
          ),
        ],
      });
      if (!result.ok) return result;
      const saved = result.value;
      const updated = saved.assessments?.find((item) => item.id === id);
      return updated
        ? success(updated)
        : failure("Assessment could not be found after saving. Refresh the tracker.");
    });
  }

  async function deleteAssessment(id: string): Promise<MutationResult> {
    return runApplicationMutation(async () => {
      const assessment = (await cloudStorageAdapter.listAssessments()).find(
        (item) => item.id === id,
      );
      if (!assessment) return failure("Assessment could not be found.");
      const application = await cloudStorageAdapter.getApplication(
        assessment.applicationId,
      );
      if (!application || application.archivedAt)
        return failure("Active application could not be found.");
      const timestamp = createTimestamp();
      const result = await commitMutation({
        deleteAssessmentIds: [id],
        applications: [{ ...application, updatedAt: timestamp }],
        activities: [
          createActivity(
            application.id,
            "updated",
            `Deleted assessment ${assessment.number}.`,
            timestamp,
          ),
        ],
      });
      if (!result.ok) return result;
      return success();
    });
  }

  async function convertInterviewToAssessment(
    id: string,
  ): Promise<MutationResult<Assessment>> {
    return runApplicationMutation(async () => {
      const snapshot = await cloudStorageAdapter.exportSnapshot();
      const interview = snapshot.interviews.find((item) => item.id === id);
      if (!interview) {
        const existing = (snapshot.assessments ?? []).find(
          (item) => item.id === id,
        );
        return existing
          ? success(existing)
          : failure("Interview could not be found.");
      }
      const application = snapshot.applications.find(
        (item) => item.id === interview.applicationId,
      );
      if (!application || application.archivedAt)
        return failure("Active application could not be found.");
      const assessment = assessmentFromInterview(
        interview,
        getNextAssessmentNumber(
          (snapshot.assessments ?? []).filter(
            (item) => item.applicationId === application.id,
          ),
        ),
      );
      const remaining = snapshot.interviews.filter(
        (item) => item.applicationId === application.id && item.id !== id,
      );
      const timestamp = createTimestamp();
      const projected = applyInterviewProjection(
        application,
        selectCurrentInterview(remaining),
      );
      const result = await commitMutation({
        assessments: [assessment],
        deleteInterviewIds: [id],
        applications: [
          { ...projected, stageMigrationVersion: 1, updatedAt: timestamp },
        ],
        activities: [
          createActivity(
            application.id,
            "updated",
            `Converted ${formatInterviewActivityLabel(interview)} to assessment ${assessment.number}.`,
            timestamp,
          ),
        ],
      });
      if (!result.ok) return result;
      const saved = result.value;
      return success(
        saved.assessments?.find((item) => item.id === assessment.id) ??
          assessment,
      );
    });
  }

  async function addInterview(
    input: InterviewInput,
  ): Promise<MutationResult<Interview>> {
    return runApplicationMutation(async () => {
      if (!isValidInterviewRound(input.round)) {
        return failure(
          "Round must be a positive whole number or left blank.",
        );
      }

      const [application, currentInterviews] = await Promise.all([
        cloudStorageAdapter.getApplication(input.applicationId),
        cloudStorageAdapter.listInterviews(input.applicationId),
      ]);

      if (!application) {
        return failure("Application could not be found.");
      }

      const timestamp = createTimestamp();
      const interview = createInterviewRecord(input, timestamp);
      const applicationInterviews = [interview, ...currentInterviews];
      const status =
        isUpcomingInterview(interview, new Date(timestamp)) &&
        !INTERVIEW_STATUS_LOCKED_STATUSES.has(application.status)
          ? "Interviewing"
          : application.status;
      const updatedApplication = applyInterviewProjection(
        { ...application, status, updatedAt: timestamp },
        selectCurrentInterview(applicationInterviews, new Date(timestamp)),
      );
      const activities = [
        ...(status !== application.status
          ? [
              createActivity(
                application.id,
                "status_changed",
                `Status changed to ${status}.`,
                timestamp,
                { statusFrom: application.status, statusTo: status },
              ),
            ]
          : []),
        createActivity(
          application.id,
          "updated",
          `Added ${formatInterviewActivityLabel(interview)}.`,
          timestamp,
        ),
      ];
      const result = await commitMutation({
        expected: { applications: [application], interviews: currentInterviews },
        creates: { interviews: [interview.id] },
        activities,
        applications: [updatedApplication],
        interviews: [interview],
      });

      if (!result.ok) {
        return result;
      }

      return success(result.value.interviews.find((item) => item.id === interview.id)!);
    });
  }

  async function updateInterview(
    id: string,
    input: InterviewUpdate,
    expectedInterview?: Interview,
  ): Promise<MutationResult<Interview>> {
    return runApplicationMutation(async () => {
      if (!isValidInterviewRound(input.round)) {
        return failure(
          "Round must be a positive whole number or left blank.",
        );
      }

      const allInterviews = await cloudStorageAdapter.listInterviews();
      const interview = allInterviews.find((candidate) => candidate.id === id);

      if (!interview) {
        return failure("Interview could not be found.");
      }

      const application = await cloudStorageAdapter.getApplication(
        interview.applicationId,
      );

      if (!application) {
        return failure("Application could not be found.");
      }

      const timestamp = createTimestamp();
      const updatedInterview = updateInterviewRecord(interview, input, timestamp);
      const applicationInterviews = allInterviews
        .filter((candidate) => candidate.applicationId === interview.applicationId)
        .map((candidate) =>
          candidate.id === id ? updatedInterview : candidate,
        );
      const updatedApplication = applyInterviewProjection(
        { ...application, updatedAt: timestamp },
        selectCurrentInterview(applicationInterviews, new Date(timestamp)),
      );
      const activity = createActivity(
        application.id,
        "updated",
        `Updated ${formatInterviewActivityLabel(updatedInterview)}.`,
        timestamp,
      );
      const result = await commitMutation({
        expected: { applications: [application], interviews: [expectedRecord(interview, expectedInterview ?? interviews.find((item) => item.id === id), input)] },
        activities: [activity],
        applications: [updatedApplication],
        interviews: [updatedInterview],
      });

      if (!result.ok) {
        return result;
      }

      return success(result.value.interviews.find((item) => item.id === updatedInterview.id)!);
    });
  }

  async function deleteInterview(id: string): Promise<MutationResult> {
    return runApplicationMutation(async () => {
      const allInterviews = await cloudStorageAdapter.listInterviews();
      const interview = allInterviews.find((candidate) => candidate.id === id);

      if (!interview) {
        return failure("Interview could not be found.");
      }

      const application = await cloudStorageAdapter.getApplication(
        interview.applicationId,
      );

      if (!application) {
        return failure("Application could not be found.");
      }

      const timestamp = createTimestamp();
      const remainingInterviews = allInterviews.filter(
        (candidate) =>
          candidate.applicationId === interview.applicationId &&
          candidate.id !== id,
      );
      const updatedApplication = applyInterviewProjection(
        { ...application, updatedAt: timestamp },
        selectCurrentInterview(remainingInterviews, new Date(timestamp)),
      );
      const activity = createActivity(
        application.id,
        "updated",
        `Deleted ${formatInterviewActivityLabel(interview)}.`,
        timestamp,
      );
      const result = await commitMutation({
        expected: { applications: [application], interviews: [interview] },
        activities: [activity],
        applications: [updatedApplication],
        deleteInterviewIds: [id],
      });

      if (!result.ok) {
        return result;
      }

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
        expected: { applications: [application] },
        activities: [activity],
        applications: [restoredApplication],
      });

      if (!result.ok) {
        return result;
      }

      return success();
    });
  }

  async function deleteApplication(id: string): Promise<MutationResult> {
    return runApplicationMutation(async () => {
      await cloudStorageAdapter.deleteApplication(id);
      publishCommittedSnapshot();
      setStorageError(null);
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
        expected: { applications: [application], contacts: currentContacts },
        creates: { contacts: [contact.id] },
        activities: [activity],
        applications: [updatedApplication],
        contacts: [contact],
      });

      if (!result.ok) {
        return result;
      }

      return success(result.value.contacts.find((item) => item.id === contact.id)!);
    });
  }

  async function updateContact(
    id: string,
    input: Partial<ContactInput>,
    expectedContact?: ApplicationContact,
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
        expected: { contacts: [expectedRecord(contact, expectedContact ?? contacts.find((item) => item.id === id), input)] },
        activities: [activity],
        contacts: [updatedContact],
      });

      if (!result.ok) {
        return result;
      }

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
        expected: { applications: [application], contacts: [contact] },
        activities: [activity],
        applications: [updatedApplication],
        deleteContactIds: [id],
      });

      if (!result.ok) {
        return result;
      }

      return success();
    });
  }

  async function uploadResume(
    file: File,
    options: ResumeUploadOptions = {},
    allowDuplicate = false,
  ): Promise<ResumeUploadAttempt> {
    const result = await createResumeUploadResult({
      existingResumes: resumes,
      file,
      options,
    });

    if (requiresDuplicateConfirmation(result, allowDuplicate)) {
      return { ...result, saved: false };
    }

    try {
      await cloudStorageAdapter.saveResume(result.resume, file);
      setStorageError(null);
      publishCommittedSnapshot();
    } catch (error) {
      setStorageError(getStorageErrorMessage(error));
      throw error;
    }

    return { ...result, saved: true };
  }

  async function uploadCoverLetter(
    file: File,
    options: ResumeUploadOptions = {},
    allowDuplicate = false,
  ): Promise<CoverLetterUploadAttempt> {
    const result = await createCoverLetterUploadResult({
      existingCoverLetters: coverLetters,
      file,
      options,
    });

    if (result.duplicateOf && !allowDuplicate) {
      return { ...result, saved: false };
    }

    try {
      await cloudStorageAdapter.saveCoverLetter(result.coverLetter, file);
      setStorageError(null);
      publishCommittedSnapshot();
    } catch (error) {
      setStorageError(getStorageErrorMessage(error));
      throw error;
    }

    return { ...result, saved: true };
  }

  async function updateResume(
    id: string,
    input: ResumeMetadataUpdate,
    expectedDocument?: ResumeMetadata,
  ): Promise<MutationResult> {
    const currentResume = resumes.find((resume) => resume.id === id);

    if (!currentResume) {
      return failure("Resume metadata could not be found.");
    }

    const updatedResume = updateResumeMetadata(currentResume, input);
    const result = await commitMutation({ resumes: [updatedResume], expected: { resumes: [expectedRecord(currentResume, expectedDocument, input)] } });

    if (!result.ok) {
      return result;
    }

    return success();
  }

  async function updateCoverLetter(
    id: string,
    input: ResumeMetadataUpdate,
    expectedDocument?: ResumeMetadata,
  ): Promise<MutationResult> {
    const currentCoverLetter = coverLetters.find(
      (coverLetter) => coverLetter.id === id,
    );

    if (!currentCoverLetter) {
      return failure("Cover letter metadata could not be found.");
    }

    const updatedCoverLetter = updateCoverLetterMetadata(
      currentCoverLetter,
      input,
    );
    const result = await commitMutation({ coverLetters: [updatedCoverLetter], expected: { coverLetters: [expectedRecord(currentCoverLetter, expectedDocument, input)] } });

    if (!result.ok) {
      return result;
    }

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
        expected: { applications: currentApplications, resumes: [currentResume] },
        applications: updatedApplications,
        deleteResumeIds: [id],
        deleteResumeFileKeys: [currentResume.storageKey],
      });

      if (!result.ok) {
        return result;
      }

      return success();
    });
  }

  async function deleteCoverLetter(id: string): Promise<MutationResult> {
    return runApplicationMutation(async () => {
      const [currentCoverLetters, currentApplications] = await Promise.all([
        cloudStorageAdapter.listCoverLetterMetadata(),
        cloudStorageAdapter.listApplications(),
      ]);
      const currentCoverLetter = currentCoverLetters.find(
        (coverLetter) => coverLetter.id === id,
      );

      if (!currentCoverLetter) {
        return failure("Cover letter metadata could not be found.");
      }

      const updatedAt = createTimestamp();
      const updatedApplications = currentApplications
        .filter((application) => application.coverLetterId === id)
        .map((application) => ({
          ...application,
          coverLetterId: undefined,
          updatedAt,
        }));
      const result = await commitMutation({
        expected: { applications: currentApplications, coverLetters: [currentCoverLetter] },
        applications: updatedApplications,
        deleteCoverLetterIds: [id],
        deleteResumeFileKeys: [currentCoverLetter.storageKey],
      });

      if (!result.ok) {
        return result;
      }

      return success();
    });
  }

  async function getResumeFile(id: string) {
    const resume = resumes.find((candidate) => candidate.id === id);

    if (!resume) {
      throw new Error("Resume metadata could not be found.");
    }

    if (resume.fileSize === 0) {
      throw new Error("This resume has metadata only; no file is attached.");
    }

    const file = await cloudStorageAdapter.getResumeFile(resume.storageKey);

    if (!file) {
      throw new Error("The resume file is missing from local storage.");
    }

    assertAccountActive();
    return file;
  }

  async function getCoverLetterFile(id: string) {
    const coverLetter = coverLetters.find((candidate) => candidate.id === id);

    if (!coverLetter) {
      throw new Error("Cover letter metadata could not be found.");
    }

    if (coverLetter.fileSize === 0) {
      throw new Error("This cover letter has metadata only; no file is attached.");
    }

    const file = await cloudStorageAdapter.getResumeFile(coverLetter.storageKey);

    if (!file) {
      throw new Error("The cover letter file is missing from storage.");
    }

    assertAccountActive();
    return file;
  }

  async function exportBackup(recovery: boolean) {
    const snapshot = await cloudStorageAdapter.exportSnapshot();
    async function readFile(storageKey: string) {
      try {
        return await cloudStorageAdapter.getResumeFile(storageKey);
      } catch (error) {
        // A recovery archive may preserve metadata for unavailable bytes, but
        // account/network failures must remain visible instead of hiding data.
        if (recovery && error instanceof CloudApiError && error.status === 404) return undefined;
        throw error;
      }
    }
    const resumeFileBackups = await Promise.all(
      snapshot.resumes.map(async (resume) => {
        if (resume.fileSize === 0) return null;
        const file = await readFile(resume.storageKey);

        if (!file) {
          if (recovery || resume.fileSize <= 0) {
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

    const coverLetterFileBackups = await Promise.all(
      snapshot.coverLetters.map(async (coverLetter) => {
        if (coverLetter.fileSize === 0) return null;
        const file = await readFile(
          coverLetter.storageKey,
        );

        if (!file) {
          if (recovery || coverLetter.fileSize <= 0) {
            return null;
          }

          throw new Error(
            `The stored file for "${coverLetter.displayName}" is missing.`,
          );
        }

        return {
          dataBase64: await blobToBase64(file),
          mimeType: file.type || coverLetter.mimeType,
          storageKey: coverLetter.storageKey,
        };
      }),
    );
    const coverLetterFiles = coverLetterFileBackups.filter(
      (coverLetterFile) => coverLetterFile !== null,
    );

    assertAccountActive();
    const serialize = recovery ? createBackupFile : createFullBackupFile;
    const file = await serialize({ coverLetterFiles, resumeFiles, snapshot });
    assertAccountActive();
    return file;
  }

  const exportFullBackup = () => exportBackup(false);
  const exportRecoveryBackup = () => exportBackup(true);

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
    const snapshot = {
      ...backup.snapshot,
      applications,
      settings: normalizeUserSettings(backup.snapshot.settings),
    };
    const resumeFiles: ResumeBlobRecord[] = [
      ...backup.resumeFiles,
      ...backup.coverLetterFiles,
    ].map(
      (resumeFile) => ({
        file: base64ToBlob(resumeFile.dataBase64, resumeFile.mimeType),
        storageKey: resumeFile.storageKey,
      }),
    );

    await cloudStorageAdapter.importSnapshot(snapshot, resumeFiles);

    publishCommittedSnapshot();
  }

  function exportApplicationsCsv() {
    assertAccountActive();
    return createApplicationsCsv({ applications, coverLetters, resumes });
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
          cloudStorageAdapter.saveNotificationState(updatedState, currentState),
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
          cloudStorageAdapter.saveNotificationState(updatedState, currentState),
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
        const updatedSettings = normalizeUserSettings({
          ...currentSettings,
          ...input,
        });

        return persistThenUpdate(
          cloudStorageAdapter.saveSettings(updatedSettings, currentSettings),
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
          cloudStorageAdapter.saveAnalyticsSettings(updatedSettings, currentSettings),
        );
      } catch (error) {
        setStorageError(getStorageErrorMessage(error));
        return false;
      }
    });
  }

  async function resetSettings() {
    return settingsMutationQueue.run(() =>
      persistThenUpdate(cloudStorageAdapter.resetSettings()),
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

        // The Applications page saves whenever its preference inputs change,
        // and every save republishes settings with fresh arrays (such as
        // visibleApplicationColumns), which re-runs that save. Skipping
        // unchanged preferences stops one save from triggering the next.
        if (
          currentPreferences &&
          equalStoredValue(updatedTablePreferences, currentPreferences)
        ) {
          return true;
        }

        return persistThenUpdate(
          cloudStorageAdapter.saveTablePreferences(updatedTablePreferences, currentPreferences),
        );
      } catch (error) {
        setStorageError(getStorageErrorMessage(error));
        return false;
      }
    });
  }

  async function resetTablePreferences() {
    return tablePreferencesMutationQueue.run(() =>
      persistThenUpdate(cloudStorageAdapter.resetTablePreferences()),
    );
  }

  async function commitMutation(
    mutation: StorageMutation,
  ): Promise<MutationResult<StorageSnapshot>> {
    try {
      assertAccountActive();
      const displayedRecords = {
        applications, contacts, interviews, assessments, activities, resumes, coverLetters,
      };
      for (const collection of ["applications", "contacts", "interviews", "assessments", "resumes", "coverLetters"] as const) {
        for (const write of mutation[collection] ?? []) {
          const displayed = displayedRecords[collection].find((item) => item.id === write.id);
          if (displayed) assertRecordIdentity(displayed, write, `${collection} record`);
        }
      }
      await cloudStorageAdapter.commitMutation({
        ...mutation,
        expected: {
          ...displayedRecords, ...mutation.expected,
        },
      });
      const saved = publishCommittedSnapshot();
      setStorageError(null);
      return success(saved);
    } catch (error) {
      return mutationFailure(error);
    }
  }

  async function persistThenUpdate(promise: Promise<unknown>) {
    try {
      await promise;
      publishCommittedSnapshot();
      setStorageError(null);
      return true;
    } catch (error) {
      setStorageError(getStorageErrorMessage(error));
      return false;
    }
  }

  return {
    assessments,
    addAssessment: (...args) => trackAction(addAssessment, ...args),
    updateAssessment: (...args) => trackAction(updateAssessment, ...args),
    deleteAssessment: (...args) => trackAction(deleteAssessment, ...args),
    convertInterviewToAssessment: (...args) => trackAction(convertInterviewToAssessment, ...args),
    activities,
    analyticsSettings,
    applications,
    cloudAccountEmail,
    cacheWarning,
    contacts,
    coverLetters,
    interviews,
    isStorageLoading,
    notificationState,
    resumes,
    retryStorage,
    repairCache,
    settings,
    storageError,
    tablePreferences,
    addContact: (...args) => trackAction(addContact, ...args),
    addInterview: (...args) => trackAction(addInterview, ...args),
    appendActivity: (...args) => trackAction(appendActivity, ...args),
    archiveApplication: (...args) => trackAction(archiveApplication, ...args),
    createApplication: (...args) => trackAction(createApplication, ...args),
    deleteApplication: (...args) => trackAction(deleteApplication, ...args),
    deleteContact: (...args) => trackAction(deleteContact, ...args),
    deleteCoverLetter: (...args) => trackAction(deleteCoverLetter, ...args),
    deleteInterview: (...args) => trackAction(deleteInterview, ...args),
    deleteResume: (...args) => trackAction(deleteResume, ...args),
    dismissNotification: (...args) => trackAction(dismissNotification, ...args),
    exportApplicationsCsv,
    exportFullBackup,
    exportRecoveryBackup,
    getCoverLetterFile,
    getResumeFile,
    importFullBackup: (...args) => trackAction(importFullBackup, ...args),
    previewBackupImport,
    resetSettings: (...args) => trackAction(resetSettings, ...args),
    resetTablePreferences: (...args) => trackAction(resetTablePreferences, ...args),
    restoreApplication: (...args) => trackAction(restoreApplication, ...args),
    markNotificationsOpened: (...args) => trackAction(markNotificationsOpened, ...args),
    updateCoverLetter: (...args) => trackAction(updateCoverLetter, ...args),
    updateResume: (...args) => trackAction(updateResume, ...args),
    uploadCoverLetter: (...args) => trackAction(uploadCoverLetter, ...args),
    uploadResume: (...args) => trackAction(uploadResume, ...args),
    updateApplication: (...args) => trackAction(updateApplication, ...args),
    updateAnalyticsSettings: (...args) => trackAction(updateAnalyticsSettings, ...args),
    updateContact: (...args) => trackAction(updateContact, ...args),
    updateInterview: (...args) => trackAction(updateInterview, ...args),
    updateSettings: (...args) => trackAction(updateSettings, ...args),
    updateTablePreferences: (...args) => trackAction(updateTablePreferences, ...args),
  };
}

// React preserves setter queue order: the account-change resets follow every
// already queued update; this gate prevents late continuations queuing new ones.
function useAccountState<Value>(
  initial: Value | (() => Value),
  invalidated: MutableRefObject<boolean>,
): [Value, Dispatch<SetStateAction<Value>>] {
  const [value, setValue] = useState(initial);
  const publish = useCallback<Dispatch<SetStateAction<Value>>>((next) => {
    if (!invalidated.current) setValue(next);
  }, [invalidated]);
  return [value, publish];
}

function expectedRecord<RecordType extends { id: string }>(
  current: RecordType,
  original: RecordType | undefined,
  changes: object,
): RecordType {
  if (!original) return current;
  if (original.id !== current.id) {
    throw new StorageConflictError("The edit baseline belongs to a different record.");
  }
  assertRecordIdentity(original, current, "The edited record");
  const expected = { ...current };
  for (const key of Object.keys(changes)) {
    Object.assign(expected, { [key]: Reflect.get(original, key) });
  }
  return expected;
}

function createActivity(
  applicationId: string,
  type: Activity["type"],
  message: string,
  createdAt = createTimestamp(),
  statusTransition: Pick<Activity, "statusFrom" | "statusTo"> = {},
): Activity {
  return {
    id: createId("activity"),
    applicationId,
    type,
    message,
    ...statusTransition,
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

const INTERVIEW_STATUS_LOCKED_STATUSES = new Set([
  "Offered",
  "Accepted",
  "Rejected",
  "Withdrawn",
]);

function formatInterviewActivityLabel(interview: Interview) {
  return interview.round ? `stage ${interview.round}` : "stage";
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
        { statusFrom: previous.status, statusTo: next.status },
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
      createActivity(next.id, "updated", "Updated stage details.", createdAt),
    );
  }

  return activities;
}

function hasInterviewChange(input: ApplicationUpdate) {
  return [
    "interviewDateTime",
    "interviewDeadline",
    "interviewDeadlineEntryMode",
    "interviewDeadlineReceivedAt",
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
  input: ApplicationUpdate,
) {
  return hasInterviewChange(input);
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
