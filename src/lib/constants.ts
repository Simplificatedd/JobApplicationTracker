import type { ApplicationStatus } from "../types/application";

export const ENABLE_BETA_ANALYTICS = true;

export const APP_NAME = "Job Application Tracker";

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  "Applied",
  "Awaiting Response",
  "Pending Interview - Technical",
  "Pending Interview - Face-to-Face",
  "Pending Interview - HireVue",
  "Offered",
  "Rejected",
  "Withdrawn",
  "Archived",
];

export const STATUS_TONE: Record<
  ApplicationStatus,
  "info" | "warning" | "success" | "neutral" | "danger"
> = {
  Applied: "info",
  "Awaiting Response": "warning",
  "Pending Interview - Technical": "warning",
  "Pending Interview - Face-to-Face": "warning",
  "Pending Interview - HireVue": "warning",
  Offered: "success",
  Rejected: "danger",
  Withdrawn: "neutral",
  Archived: "neutral",
};
