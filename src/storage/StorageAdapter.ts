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

export interface StorageSnapshot {
  activities: Activity[];
  analyticsSettings: AnalyticsSettings;
  applications: Application[];
  contacts: ApplicationContact[];
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

export interface StorageAdapter {
  initialize(): Promise<StorageSnapshot>;

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
