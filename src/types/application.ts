export type ApplicationStatus =
  | "Applied"
  | "Awaiting Response"
  | "Pending Interview - Technical"
  | "Pending Interview - Face-to-Face"
  | "Pending Interview - HireVue"
  | "Offered"
  | "Rejected"
  | "Withdrawn"
  | "Archived";

export type WorkMode = "remote" | "hybrid" | "onsite" | "unknown";

export type JobType =
  | "internship"
  | "part-time"
  | "full-time"
  | "contract"
  | "other";

export type InterviewType =
  | "technical"
  | "face-to-face"
  | "HireVue"
  | "other"
  | "unknown";

export type InterviewMode = "phone" | "video" | "onsite" | "take-home" | "other";

export type Priority = "low" | "medium" | "high";

export type DeadlineEntryMode = "exact" | "1_day" | "2_days" | "3_days" | "72_hours";

export interface ResumeMetadata {
  id: string;
  displayName: string;
  originalFileName: string;
  fileExtension: "pdf" | "docx";
  uploadedAt: string;
  lastUsedAt?: string;
}

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
  interviewDateTime?: string;
  interviewType?: InterviewType;
  interviewMode?: InterviewMode;
  interviewLocation?: string;
  interviewMeetingUrl?: string;
  interviewPlatform?: string;
  interviewProctored: boolean;
  interviewDeadline?: string;
  deadlineEntryMode: DeadlineEntryMode;
  nextAction?: string;
  priority: Priority;
  resumeId?: string;
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
    | "deleted"
    | "contact_created"
    | "contact_updated"
    | "contact_deleted";
  message: string;
  createdAt: string;
}

export interface Interview {
  id: string;
  applicationId: string;
  dateTime?: string;
  type: InterviewType;
  mode: InterviewMode;
  location?: string;
  meetingUrl?: string;
  platform?: string;
  proctored: boolean;
  deadline?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

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
