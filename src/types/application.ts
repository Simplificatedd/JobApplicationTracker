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

export type Priority = "low" | "medium" | "high";

export interface ResumeFile {
  id: string;
  displayName: string;
  originalFileName: string;
  fileExtension: "pdf" | "docx";
  uploadedAt: string;
  lastUsedAt?: string;
}

export interface JobApplication {
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
  interviewDateTime?: string;
  interviewType?: InterviewType;
  nextAction?: string;
  priority: Priority;
  resumeId?: string;
  contactsCount: number;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}
