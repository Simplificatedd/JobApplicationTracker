import type { Application, Interview } from "../types/application";
import type { StorageSnapshot } from "../storage/StorageAdapter";
import {
  DEFAULT_ANALYTICS_SETTINGS,
  DEFAULT_NOTIFICATION_STATE,
  DEFAULT_USER_SETTINGS,
} from "../lib/domain";
export const timestamp = "2026-09-20T00:00:00.000Z";
export const now = new Date("2026-09-21T00:00:00.000Z");
export const application: Application = {
  id: "app-1",
  company: "Example",
  jobTitle: "Engineer",
  jobDescription: "",
  status: "Interviewing",
  workMode: "unknown",
  jobType: "full-time",
  followUpNeeded: false,
  interviewProctored: false,
  priority: "medium",
  contactsCount: 0,
  createdAt: timestamp,
  updatedAt: timestamp,
};
export function interview(
  round: number,
  type: Interview["type"] = "technical-interview",
): Interview {
  return {
    id: `round-${round}`,
    applicationId: application.id,
    round,
    type,
    mode: "video",
    proctored: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
export function snapshot(
  overrides: Partial<StorageSnapshot> = {},
): StorageSnapshot {
  return {
    dataVersion: 2,
    applications: [application],
    interviews: [],
    activities: [],
    contacts: [],
    coverLetters: [],
    resumes: [],
    settings: DEFAULT_USER_SETTINGS,
    notificationState: DEFAULT_NOTIFICATION_STATE,
    analyticsSettings: DEFAULT_ANALYTICS_SETTINGS,
    tablePreferences: null,
    ...overrides,
  };
}
