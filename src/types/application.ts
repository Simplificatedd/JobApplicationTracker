export type ApplicationStatus =
  | "Awaiting Response"
  | "Interviewing"
  | "Offered"
  | "Accepted"
  | "Rejected"
  | "Withdrawn";

export type WorkMode = "remote" | "hybrid" | "onsite" | "unknown";

export type JobType =
  | "internship"
  | "part-time"
  | "full-time"
  | "contract"
  | "other";

export type InterviewType =
  | "technical"
  | "recruiter"
  | "face-to-face"
  | "HireVue"
  | "HackerRank"
  | "other"
  | "unknown";

export type InterviewMode =
  | "phone"
  | "video"
  | "onsite"
  | "take-home"
  | "other"
  | "unknown";

export type Priority = "low" | "medium" | "high";

export type DeadlineEntryMode = "exact" | "1_day" | "2_days" | "3_days" | "72_hours";

export interface StoredDocumentMetadata {
  id: string;
  displayName: string;
  originalFileName: string;
  downloadFileName: string;
  fileExtension: "pdf" | "docx";
  mimeType: string;
  fileSize: number;
  storageKey: string;
  contentHash: string;
  versionLabel?: string;
  notes?: string;
  uploadedAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}

export type ResumeMetadata = StoredDocumentMetadata;
export type CoverLetterMetadata = StoredDocumentMetadata;

export interface Application {
  id: string;
  company: string;
  jobTitle: string;
  jobDescription: string;
  status: ApplicationStatus;
  location?: string;
  workMode: WorkMode;
  jobType: JobType;
  source?: string;
  applicationUrl?: string;
  dateFound?: string;
  dateApplied?: string;
  deadline?: string;
  roleStartDate?: string;
  roleEndDate?: string;
  followUpNeeded: boolean;
  followUpDate?: string;
  followUpPromptDays?: number;
  // Denormalized current-interview projection. Interview records are canonical.
  interviewRound?: number;
  interviewDateTime?: string;
  interviewType?: InterviewType;
  interviewMode?: InterviewMode;
  interviewLocation?: string;
  interviewMeetingUrl?: string;
  interviewPlatform?: string;
  interviewProctored: boolean;
  interviewDeadline?: string;
  interviewDeadlineEntryMode?: DeadlineEntryMode;
  interviewDeadlineReceivedAt?: string;
  deadlineEntryMode: DeadlineEntryMode;
  nextAction?: string;
  priority: Priority;
  resumeId?: string;
  coverLetterId?: string;
  coverLetterVersion?: string;
  salary?: string;
  notes?: string;
  contactsCount: number;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Activity {
  id: string;
  applicationId: string;
  type:
    | "created"
    | "updated"
    | "status_changed"
    | "archived"
    | "restored"
    | "contact_created"
    | "contact_updated"
    | "contact_deleted";
  message: string;
  statusFrom?: ApplicationStatus;
  statusTo?: ApplicationStatus;
  createdAt: string;
}

// Canonical one-to-many interview history for an application.
export interface Interview {
  id: string;
  applicationId: string;
  dateTime?: string;
  round?: number;
  type: InterviewType;
  mode: InterviewMode;
  location?: string;
  meetingUrl?: string;
  platform?: string;
  proctored: boolean;
  deadline?: string;
  deadlineEntryMode?: DeadlineEntryMode;
  deadlineReceivedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type InterviewInput = Omit<Interview, "id" | "createdAt" | "updatedAt">;

export type InterviewUpdate = Partial<
  Omit<Interview, "id" | "applicationId" | "createdAt" | "updatedAt">
>;

export interface ApplicationContact {
  id: string;
  applicationId: string;
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  linkedInUrl?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type ResumeFile = ResumeMetadata;
export type JobApplication = Application;
