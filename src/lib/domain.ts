import type { AnalyticsSettings } from "../types/analytics";
import type { ApplicationStatus } from "../types/application";
import type { NotificationState, UserSettings } from "../types/settings";

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  "Awaiting Response",
  "Interviewing",
  "Offered",
  "Accepted",
  "Rejected",
  "Withdrawn",
];

export const DEFAULT_APPLICATION_STATUS: ApplicationStatus =
  "Awaiting Response";

export function normalizeApplicationStatus(status: unknown): ApplicationStatus {
  return APPLICATION_STATUSES.includes(status as ApplicationStatus)
    ? (status as ApplicationStatus)
    : DEFAULT_APPLICATION_STATUS;
}

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

export const REQUIRED_APPLICATION_COLUMNS = [
  "jobTitle",
  "status",
  "contacts",
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
  enableDraggableColumnWidths: false,
  rememberTableState: true,
  enableDeleteActiveApplications: false,
  enableNotificationBell: true,
  enableGroupedNotifications: true,
  includeUpcomingInterviewsInAttention: true,
  dueSoonDays: 3,
  betaAnalyticsEnabled: false,
};

export function normalizeUserSettings(
  settings?: Partial<UserSettings>,
): UserSettings {
  const visibleApplicationColumns = [
    ...(settings?.visibleApplicationColumns ??
      DEFAULT_USER_SETTINGS.visibleApplicationColumns),
    ...REQUIRED_APPLICATION_COLUMNS,
  ].filter(
    (column) => column !== "deadline" && column !== "deadlineEntryMode",
  );

  return {
    ...DEFAULT_USER_SETTINGS,
    ...settings,
    addJobFormLayout: "long_form",
    addJobPresentation: "modal",
    visibleApplicationColumns: [...new Set(visibleApplicationColumns)],
  };
}

export const DEFAULT_ANALYTICS_SETTINGS: AnalyticsSettings = {
  enabled: false,
  defaultTimeGrouping: "weekly",
  visibleCharts: [
    "applicationsOverTime",
    "statusPipeline",
    "followUpLoad",
    "activityCalendar",
    "applicationPaths",
  ],
  includeArchived: false,
};

export const DEFAULT_NOTIFICATION_STATE: NotificationState = {
  dismissedNotificationIds: [],
};

export function createTimestamp(date = new Date()) {
  return date.toISOString();
}

export function createDateStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
