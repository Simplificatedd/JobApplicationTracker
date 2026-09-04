import type { ApplicationStatus } from "../types/application";
import { APPLICATION_STATUSES as DOMAIN_APPLICATION_STATUSES } from "./domain";

export const ENABLE_BETA_ANALYTICS = true;

export const APP_NAME = "Job Application Tracker";

export const APPLICATION_STATUSES = DOMAIN_APPLICATION_STATUSES;

export const STATUS_TONE: Record<
  ApplicationStatus,
  "info" | "warning" | "success" | "neutral" | "danger"
> = {
  "Just Applied": "info",
  "Awaiting Response": "warning",
  Interviewing: "warning",
  Offered: "success",
  Rejected: "danger",
  Withdrawn: "neutral",
};
