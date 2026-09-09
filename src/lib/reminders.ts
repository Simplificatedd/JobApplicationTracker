import type { Application } from "../types/application";
import type { NotificationState, UserSettings } from "../types/settings";

export type ReminderSeverity = "overdue" | "due_today" | "due_soon" | "upcoming";
export type NotificationType = "follow_up" | "interview" | "deadline" | "flagged";
export type NotificationGroup = "followups" | "interviews" | "other";

export interface ReminderNotification {
  application: Application;
  applicationId: string;
  body: string;
  dueAt?: string;
  group: NotificationGroup;
  id: string;
  severity: ReminderSeverity;
  sortAt: number;
  title: string;
  type: NotificationType;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const FINAL_STATUSES = new Set(["Offered", "Rejected", "Withdrawn"]);

export function calculateFollowUpDueDate(
  application: Application,
  defaultPromptDays: number,
) {
  if (application.followUpDate) {
    return application.followUpDate;
  }

  if (!application.followUpNeeded) {
    return undefined;
  }

  return addDaysToDateStamp(
    application.dateApplied || application.createdAt,
    application.followUpPromptDays ?? defaultPromptDays,
  );
}

export function classifyReminderSeverity(
  dueAt: string | Date,
  dueSoonDays: number,
  now = new Date(),
): ReminderSeverity {
  const dueDate = dueAt instanceof Date ? dueAt : new Date(dueAt);

  if (Number.isNaN(dueDate.getTime())) {
    return "upcoming";
  }

  const today = startOfDay(now);
  const dueDay = startOfDay(dueDate);

  if (dueDay < today) {
    return "overdue";
  }

  if (dueDay.getTime() === today.getTime()) {
    return "due_today";
  }

  if (dueDate <= addDays(now, dueSoonDays)) {
    return "due_soon";
  }

  return "upcoming";
}

export function deriveReminderNotifications({
  applications,
  notificationState,
  settings,
  includeArchived = false,
  now = new Date(),
}: {
  applications: Application[];
  includeArchived?: boolean;
  notificationState: NotificationState;
  now?: Date;
  settings: UserSettings;
}) {
  const dismissedIds = new Set(notificationState.dismissedNotificationIds);
  const notifications = applications
    .filter((application) => includeArchived || !application.archivedAt)
    .flatMap((application) =>
      deriveApplicationNotifications(application, settings, now),
    )
    .filter((notification) => !dismissedIds.has(notification.id));

  return sortNotifications(notifications);
}

export function deriveNeedsAttentionApplicationIds({
  applications,
  settings,
  now = new Date(),
}: {
  applications: Application[];
  now?: Date;
  settings: UserSettings;
}) {
  return new Set(
    applications
      .filter((application) => !application.archivedAt)
      .flatMap((application) =>
        deriveApplicationNotifications(application, settings, now),
      )
      .map((notification) => notification.applicationId),
  );
}

export function deriveApplicationNotifications(
  application: Application,
  settings: UserSettings,
  now = new Date(),
): ReminderNotification[] {
  if (application.archivedAt || FINAL_STATUSES.has(application.status)) {
    return [];
  }

  const notifications: ReminderNotification[] = [];
  const followUpDueDate = calculateFollowUpDueDate(
    application,
    settings.defaultFollowUpPromptDays,
  );

  if (followUpDueDate) {
    const severity = classifyReminderSeverity(
      followUpDueDate,
      settings.dueSoonDays,
      now,
    );

    if (severity !== "upcoming" || application.followUpNeeded) {
      notifications.push({
        application,
        applicationId: application.id,
        body: `${application.company || "No company listed"} / ${severityLabel(severity)}`,
        dueAt: followUpDueDate,
        group: "followups",
        id: buildNotificationId(application.id, "follow_up", followUpDueDate),
        severity,
        sortAt: new Date(followUpDueDate).getTime(),
        title: `Follow up on ${application.jobTitle}`,
        type: "follow_up",
      });
    }
  } else if (application.followUpNeeded) {
    notifications.push({
      application,
      applicationId: application.id,
      body: application.company || "No company listed",
      group: "other",
      id: buildNotificationId(application.id, "flagged", application.updatedAt),
      severity: "due_soon",
      sortAt: new Date(application.updatedAt).getTime(),
      title: `Follow-up flagged for ${application.jobTitle}`,
      type: "flagged",
    });
  }

  const interviewDate = parseDate(application.interviewDateTime);

  if (
    settings.includeUpcomingInterviewsInAttention &&
    application.status === "Interviewing" &&
    interviewDate &&
    interviewDate >= now
  ) {
    const severity = classifyReminderSeverity(
      interviewDate,
      settings.dueSoonDays,
      now,
    );

    notifications.push({
      application,
      applicationId: application.id,
      body: `${application.company || "No company listed"} / ${severityLabel(severity)}`,
      dueAt: application.interviewDateTime,
      group: "interviews",
      id: buildNotificationId(
        application.id,
        "interview",
        application.interviewDateTime,
      ),
      severity,
      sortAt: interviewDate.getTime(),
      title: `Interview for ${application.jobTitle}`,
      type: "interview",
    });
  }

  const interviewDeadline = calculateInterviewDeadline(application);
  const deadlineDate = parseDate(interviewDeadline);

  if (
    application.status === "Interviewing" &&
    application.interviewProctored &&
    interviewDeadline &&
    deadlineDate &&
    deadlineDate >= now
  ) {
    const severity = classifyReminderSeverity(
      deadlineDate,
      settings.dueSoonDays,
      now,
    );

    notifications.push({
      application,
      applicationId: application.id,
      body: `${application.company || "No company listed"} / ${severityLabel(severity)}`,
      dueAt: interviewDeadline,
      group: "interviews",
      id: buildNotificationId(application.id, "deadline", interviewDeadline),
      severity,
      sortAt: deadlineDate.getTime(),
      title: `Assessment deadline for ${application.jobTitle}`,
      type: "deadline",
    });
  }

  return notifications;
}

export function calculateInterviewDeadline(application: Application) {
  if (application.deadlineEntryMode === "exact") {
    return application.interviewDeadline || application.deadline;
  }

  const receivedAt = application.createdAt;
  const hoursByMode = {
    "1_day": 24,
    "2_days": 48,
    "3_days": 72,
    "72_hours": 72,
  } satisfies Record<Exclude<Application["deadlineEntryMode"], "exact">, number>;
  const hours = hoursByMode[application.deadlineEntryMode];

  return hours ? new Date(new Date(receivedAt).getTime() + hours * 60 * 60 * 1000).toISOString() : undefined;
}

export function sortNotifications(notifications: ReminderNotification[]) {
  const severityRank: Record<ReminderSeverity, number> = {
    overdue: 0,
    due_today: 1,
    due_soon: 2,
    upcoming: 3,
  };

  return [...notifications].sort((left, right) => {
    const severityDifference =
      severityRank[left.severity] - severityRank[right.severity];

    if (severityDifference !== 0) {
      return severityDifference;
    }

    if (left.sortAt !== right.sortAt) {
      return left.sortAt - right.sortAt;
    }

    return left.title.localeCompare(right.title);
  });
}

export function severityLabel(severity: ReminderSeverity) {
  if (severity === "overdue") {
    return "overdue";
  }

  if (severity === "due_today") {
    return "due today";
  }

  if (severity === "due_soon") {
    return "due soon";
  }

  return "upcoming";
}

function buildNotificationId(
  applicationId: string,
  type: NotificationType,
  sourceValue?: string,
) {
  return `${type}:${applicationId}:${sourceValue ?? "none"}`;
}

function addDaysToDateStamp(value: string, days: number) {
  const baseDate = new Date(value);

  if (Number.isNaN(baseDate.getTime())) {
    return undefined;
  }

  const next = addDays(startOfDay(baseDate), days);

  return next.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseDate(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}
