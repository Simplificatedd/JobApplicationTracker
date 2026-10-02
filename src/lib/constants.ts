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
  { label: "Not specified", value: "unknown" },
  { label: "Recruiter screen", value: "recruiter-screen" },
  { label: "Hiring manager interview", value: "hiring-manager-interview" },
  { label: "Technical interview", value: "technical-interview" },
  { label: "Behavioral interview", value: "behavioral-interview" },
  { label: "Take-home assignment", value: "take-home-assignment" },
  { label: "Online assessment", value: "online-assessment" },
  { label: "Other", value: "other" },
];

export const INTERVIEW_MODE_OPTIONS: ReadonlyArray<{
  label: string;
  value: InterviewMode;
}> = [
  { label: "Not specified", value: "unknown" },
  { label: "Video call", value: "video" },
  { label: "Phone call", value: "phone" },
  { label: "On-site", value: "onsite" },
  { label: "Asynchronous", value: "take-home" },
  { label: "Other", value: "other" },
];

export const STATUS_TONE: Record<
  ApplicationStatus,
  | "awaiting"
  | "interviewing"
  | "offered"
  | "accepted"
  | "rejected"
  | "withdrawn"
> = {
  "Awaiting Response": "awaiting",
  Interviewing: "interviewing",
  Offered: "offered",
  Accepted: "accepted",
  Rejected: "rejected",
  Withdrawn: "withdrawn",
};
