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

export interface StorageSnapshot {
  activities: Activity[];
  analyticsSettings: AnalyticsSettings;
  applications: Application[];
  contacts: ApplicationContact[];
  coverLetters: CoverLetterMetadata[];
  interviews: Interview[];
  notificationState: NotificationState;
  resumes: ResumeMetadata[];
  settings: UserSettings;
  tablePreferences: TablePreferences | null;
}

export interface ResumeBlobRecord {
  storageKey: string;
  file: Blob;
}

export interface StorageMutation {
  activities?: readonly Activity[];
  applications?: readonly Application[];
  contacts?: readonly ApplicationContact[];
  coverLetters?: readonly CoverLetterMetadata[];
  interviews?: readonly Interview[];
  resumes?: readonly ResumeMetadata[];
  resumeFiles?: readonly ResumeBlobRecord[];
  deleteContactIds?: readonly string[];
  deleteCoverLetterIds?: readonly string[];
  deleteInterviewIds?: readonly string[];
  deleteResumeIds?: readonly string[];
  deleteResumeFileKeys?: readonly string[];
}

export interface StorageAdapter {
  initialize(): Promise<StorageSnapshot>;
  commitMutation(mutation: StorageMutation): Promise<void>;

  listApplications(): Promise<Application[]>;
  getApplication(id: string): Promise<Application | undefined>;
  createApplication(application: Application): Promise<void>;
  updateApplication(application: Application): Promise<void>;
  archiveApplication(application: Application): Promise<void>;
  restoreApplication(application: Application): Promise<void>;
  deleteApplication(id: string): Promise<void>;

  listContacts(applicationId?: string): Promise<ApplicationContact[]>;
  saveContacts(contacts: ApplicationContact[]): Promise<void>;
  createContact(contact: ApplicationContact): Promise<void>;
  updateContact(contact: ApplicationContact): Promise<void>;
  deleteContact(id: string): Promise<void>;

  listActivities(applicationId?: string): Promise<Activity[]>;
  appendActivity(activity: Activity): Promise<void>;
  deleteActivitiesForApplication(applicationId: string): Promise<void>;

  listInterviews(applicationId?: string): Promise<Interview[]>;
  saveInterview(interview: Interview): Promise<void>;
  deleteInterview(id: string): Promise<void>;
  deleteInterviewsForApplication(applicationId: string): Promise<void>;

  listCoverLetterMetadata(): Promise<CoverLetterMetadata[]>;
  saveCoverLetter(coverLetter: CoverLetterMetadata, file: Blob): Promise<void>;
  updateCoverLetterMetadata(coverLetter: CoverLetterMetadata): Promise<void>;
  deleteCoverLetterMetadata(id: string): Promise<void>;

  listResumeMetadata(): Promise<ResumeMetadata[]>;
  saveResume(resume: ResumeMetadata, file: Blob): Promise<void>;
  createResumeMetadata(resume: ResumeMetadata): Promise<void>;
  updateResumeMetadata(resume: ResumeMetadata): Promise<void>;
  deleteResumeMetadata(id: string): Promise<void>;
  listResumeFiles(): Promise<ResumeBlobRecord[]>;
  saveResumeFile(storageKey: string, file: Blob): Promise<void>;
  getResumeFile(storageKey: string): Promise<Blob | undefined>;
  deleteResumeFile(storageKey: string): Promise<void>;
  clearResumeFiles(): Promise<void>;

  getSettings(): Promise<UserSettings>;
  saveSettings(settings: UserSettings): Promise<void>;
  resetSettings(): Promise<UserSettings>;

  getNotificationState(): Promise<NotificationState>;
  saveNotificationState(state: NotificationState): Promise<void>;

  getAnalyticsSettings(): Promise<AnalyticsSettings>;
  saveAnalyticsSettings(settings: AnalyticsSettings): Promise<void>;

  getTablePreferences(): Promise<TablePreferences | null>;
  saveTablePreferences(preferences: TablePreferences): Promise<void>;
  resetTablePreferences(): Promise<void>;

  exportSnapshot(): Promise<StorageSnapshot>;
  importSnapshot(
    snapshot: StorageSnapshot,
    resumeFiles?: ResumeBlobRecord[],
  ): Promise<void>;
}
