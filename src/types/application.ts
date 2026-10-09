export type ApplicationStatus =
  | "Awaiting Response"
  | "Online Assessment"
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

export type CanonicalInterviewType =
  | "recruiter-screen"
  | "hiring-manager-interview"
  | "technical-interview"
  | "behavioral-interview"
  | "take-home-assignment"
  | "online-assessment"
  | "other"
  | "unknown";

export type LegacyInterviewType =
  | "technical"
  | "recruiter"
  | "face-to-face"
  | "HireVue"
  | "HackerRank";

export type InterviewType = CanonicalInterviewType | LegacyInterviewType;

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
  followUpAutoResetEnabled?: boolean;
  followUpPromptDays?: number;
  // Prevent legacy projections from recreating converted/deleted stages.
  stageMigrationVersion?: 1;
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
  offerDeadline?: string;
  // Legacy application-level deadline fields retained for backup compatibility.
  deadlineEntryMode?: DeadlineEntryMode;
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

export type AssessmentType =
  | "unknown"
  | "coding"
  | "numerical-reasoning"
  | "verbal-reasoning"
  | "logical-reasoning"
  | "situational-judgement"
  | "personality"
  | "recorded-video"
  | "take-home-assignment"
  | "other";
export type AssessmentProgress =
  | "unknown"
  | "not-started"
  | "in-progress"
  | "submitted"
  | "expired"
  | "cancelled";
export type AssessmentResult =
  "unknown" | "pending" | "passed" | "failed" | "not-disclosed";
export interface Assessment {
  id: string;
  applicationId: string;
  number: number;
  name?: string;
  type: AssessmentType;
  platform?: string;
  link?: string;
  receivedAt?: string;
  deadline?: string;
  timeLimitMinutes?: number;
  scheduledStart?: string;
  proctored: "yes" | "no" | "unknown";
  progress: AssessmentProgress;
  submittedAt?: string;
  result: AssessmentResult;
  score?: string;
  notes?: string;
  originalInterviewRound?: number;
  // Complete source preserves legacy format/location/classification and unknown extensions.
  legacyInterview?: Interview;
  createdAt: string;
  updatedAt: string;
}
export type AssessmentInput = Omit<
  Assessment,
  | "id"
  | "number"
  | "createdAt"
  | "updatedAt"
  | "legacyInterview"
  | "originalInterviewRound"
>;
export type AssessmentUpdate = Partial<Omit<AssessmentInput, "applicationId">>;
