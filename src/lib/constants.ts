import type {
  ApplicationStatus,
  InterviewMode,
  InterviewType,
} from "../types/application";
import { APPLICATION_STATUSES as DOMAIN_APPLICATION_STATUSES } from "./domain";

export const ENABLE_BETA_ANALYTICS = true;

export const APP_NAME = "Job Application Tracker";

export const APPLICATION_STATUSES = DOMAIN_APPLICATION_STATUSES;

export const INTERVIEW_TYPE_OPTIONS: ReadonlyArray<{
  label: string;
  value: InterviewType;
}> = [
  { label: "Unknown", value: "unknown" },
  { label: "Technical", value: "technical" },
  { label: "Recruiter", value: "recruiter" },
  { label: "Face-to-face", value: "face-to-face" },
  { label: "HireVue", value: "HireVue" },
  { label: "HackerRank", value: "HackerRank" },
  { label: "Other", value: "other" },
];

export const INTERVIEW_MODE_OPTIONS: ReadonlyArray<{
  label: string;
  value: InterviewMode;
}> = [
  { label: "Unknown", value: "unknown" },
  { label: "Online / video call", value: "video" },
  { label: "Phone", value: "phone" },
  { label: "Onsite", value: "onsite" },
  { label: "Take-home / assessment", value: "take-home" },
  { label: "Other", value: "other" },
];

export const STATUS_TONE: Record<
  ApplicationStatus,
  "info" | "warning" | "success" | "neutral" | "danger"
> = {
  "Awaiting Response": "warning",
  Interviewing: "warning",
  Offered: "success",
  Accepted: "success",
  Rejected: "danger",
  Withdrawn: "neutral",
};
