import type { AnalyticsSettings } from "../types/analytics";
import type { ApplicationStatus } from "../types/application";
import type { NotificationState, UserSettings } from "../types/settings";

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  "Just Applied",
  "Awaiting Response",
  "Interviewing",
  "Offered",
  "Rejected",
  "Withdrawn",
];

export const DEFAULT_VISIBLE_APPLICATION_COLUMNS = [
  "jobTitle",
  "company",
  "status",
  "followUp",
  "interviewDateTime",
  "resume",
  "contacts",
  "updatedAt",
  "actions",
];

export const APPLICATION_SOURCES = [
  "LinkedIn",
  "Referral",
  "Company site",
  "Career fair",
  "School portal",
  "Indeed",
  "Glassdoor",
  "Handshake",
  "Recruiter outreach",
  "Other",
];

export const DEFAULT_USER_SETTINGS: UserSettings = {
  defaultFollowUpPromptDays: 7,
  contactsDisplayMode: "side_panel",
  navigationDisplayMode: "side",
  addJobFormLayout: "long_form",
  addJobPresentation: "modal",
  visibleApplicationColumns: DEFAULT_VISIBLE_APPLICATION_COLUMNS,
  enableDraggableColumnWidths: true,
  rememberTableState: true,
  enableDeleteActiveApplications: false,
  enableNotificationBell: true,
  enableGroupedNotifications: true,
  includeUpcomingInterviewsInAttention: true,
  dueSoonDays: 3,
  betaAnalyticsEnabled: false,
};

export const DEFAULT_ANALYTICS_SETTINGS: AnalyticsSettings = {
  enabled: false,
  defaultTimeGrouping: "weekly",
  visibleCharts: ["statusPipeline", "applicationsOverTime", "sourceQuality"],
  includeArchived: false,
};

export const DEFAULT_NOTIFICATION_STATE: NotificationState = {
  dismissedNotificationIds: [],
};

export function createTimestamp(date = new Date()) {
  return date.toISOString();
}

export function createDateStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
