import type { Application, Interview } from "../types/application";
import type { NotificationState, UserSettings } from "../types/settings";
import { calculateInterviewDeadline } from "./interviews";

export type ReminderSeverity = "overdue" | "due_today" | "due_soon" | "upcoming";
export type NotificationType =
  | "follow_up"
  | "interview"
  | "deadline"
  | "offer_deadline"
  | "flagged";
export type NotificationGroup = "followups" | "interviews" | "offers" | "other";

export interface ReminderNotification {
  application: Application;
  applicationId: string;
  body: string;
  dueAt?: string;
  group: NotificationGroup;
  id: string;
  interviewId?: string;
  severity: ReminderSeverity;
  sortAt: number;
  title: string;
  type: NotificationType;
}

const FINAL_STATUSES = new Set(["Accepted", "Rejected", "Withdrawn"]);

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
  const dueDate = dueAt instanceof Date ? dueAt : parseDate(dueAt);

  if (!dueDate || Number.isNaN(dueDate.getTime())) {
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
  interviews,
  notificationState,
  settings,
  includeArchived = false,
  now = new Date(),
}: {
  applications: Application[];
  interviews?: Interview[];
  includeArchived?: boolean;
  notificationState: NotificationState;
  now?: Date;
  settings: UserSettings;
}) {
  const dismissedIds = new Set(notificationState.dismissedNotificationIds);
  const notifications = applications
    .filter((application) => includeArchived || !application.archivedAt)
    .flatMap((application) =>
      deriveApplicationNotifications(
        application,
        settings,
        now,
        interviews?.filter(
          (interview) => interview.applicationId === application.id,
        ),
      ),
    )
    .filter((notification) => !dismissedIds.has(notification.id));

  return sortNotifications(notifications);
}

export function deriveNeedsAttentionApplicationIds({
  applications,
  interviews,
  settings,
  now = new Date(),
}: {
  applications: Application[];
  interviews?: Interview[];
  now?: Date;
  settings: UserSettings;
}) {
  return new Set(
    applications
      .filter((application) => !application.archivedAt)
      .flatMap((application) =>
        deriveApplicationNotifications(
          application,
          settings,
          now,
          interviews?.filter(
            (interview) => interview.applicationId === application.id,
          ),
        ),
      )
      .map((notification) => notification.applicationId),
  );
}

export function deriveApplicationNotifications(
  application: Application,
  settings: UserSettings,
  now = new Date(),
  interviews?: Interview[],
): ReminderNotification[] {
  if (
    application.archivedAt ||
    FINAL_STATUSES.has(application.status)
  ) {
    return [];
  }

  if (application.status === "Offered") {
    return deriveOfferDeadlineNotification(application, settings, now);
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

    if (severity !== "upcoming") {
      notifications.push({
        application,
        applicationId: application.id,
        body: [application.company, severityLabel(severity)]
          .filter(Boolean)
          .join(" / "),
        dueAt: followUpDueDate,
        group: "followups",
        id: buildNotificationId(application.id, "follow_up", followUpDueDate),
        severity,
        sortAt: new Date(followUpDueDate).getTime(),
        title: `Follow up on ${application.jobTitle}`,
        type: "follow_up",
      });
    }
  }

  const interviewRecords =
    interviews ?? getProjectedInterviewRecords(application);

  interviewRecords.forEach((interview) => {
    const interviewDate = parseDate(interview.dateTime);
    const roundLabel = interview.round ? ` ${interview.round}` : "";

    if (
      settings.includeUpcomingInterviewsInAttention &&
      application.status === "Interviewing" &&
      interview.dateTime &&
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
        body: [application.company, severityLabel(severity)]
          .filter(Boolean)
          .join(" / "),
        dueAt: interview.dateTime,
        group: "interviews",
        id: buildNotificationId(application.id, "interview", interview.id),
        interviewId: interview.id,
        severity,
        sortAt: interviewDate.getTime(),
        title: `Interview${roundLabel} for ${application.jobTitle}`,
        type: "interview",
      });
    }

    const deadline = calculateInterviewDeadline(interview);
    const deadlineDate = parseDate(deadline);

    if (
      application.status === "Interviewing" &&
      deadline &&
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
        body: [application.company, severityLabel(severity)]
          .filter(Boolean)
          .join(" / "),
        dueAt: deadline,
        group: "interviews",
        id: buildNotificationId(application.id, "deadline", interview.id),
        interviewId: interview.id,
        severity,
        sortAt: deadlineDate.getTime(),
        title: `Interview${roundLabel} deadline for ${application.jobTitle}`,
        type: "deadline",
      });
    }
  });

  return notifications;
}

function deriveOfferDeadlineNotification(
  application: Application,
  settings: UserSettings,
  now: Date,
): ReminderNotification[] {
  if (!application.offerDeadline) {
    return [];
  }

  const deadlineDate = parseDate(application.offerDeadline);

  if (!deadlineDate) {
    return [];
  }

  const severity = classifyReminderSeverity(
    deadlineDate,
    settings.dueSoonDays,
    now,
  );

  if (severity === "upcoming") {
    return [];
  }

  return [
    {
      application,
      applicationId: application.id,
      body: [application.company, severityLabel(severity)]
        .filter(Boolean)
        .join(" / "),
      dueAt: application.offerDeadline,
      group: "offers",
      id: buildNotificationId(
        application.id,
        "offer_deadline",
        application.offerDeadline,
      ),
      severity,
      sortAt: deadlineDate.getTime(),
      title: `Offer deadline for ${application.jobTitle}`,
      type: "offer_deadline",
    },
  ];
}

function getProjectedInterviewRecords(application: Application): Interview[] {
  if (
    !application.interviewDateTime &&
    !application.interviewDeadline &&
    !application.interviewRound &&
    !application.interviewType &&
    !application.interviewMode &&
    !application.interviewDeadlineEntryMode &&
    !application.interviewDeadlineReceivedAt
  ) {
    return [];
  }

  return [
    {
      id: `projected-${application.id}`,
      applicationId: application.id,
      dateTime: application.interviewDateTime,
      deadline: application.interviewDeadline,
      deadlineEntryMode: application.interviewDeadlineEntryMode,
      deadlineReceivedAt: application.interviewDeadlineReceivedAt,
      location: application.interviewLocation,
      meetingUrl: application.interviewMeetingUrl,
      mode: application.interviewMode ?? "unknown",
      platform: application.interviewPlatform,
      proctored: application.interviewProctored,
      round: application.interviewRound,
      type: application.interviewType ?? "unknown",
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
    },
  ];
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
  const dateStampMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const baseDate = dateStampMatch
    ? new Date(
        Date.UTC(
          Number(dateStampMatch[1]),
          Number(dateStampMatch[2]) - 1,
          Number(dateStampMatch[3]),
        ),
      )
    : new Date(value);

  if (Number.isNaN(baseDate.getTime())) {
    return undefined;
  }

  if (dateStampMatch) {
    const isValidDateStamp =
      baseDate.getUTCFullYear() === Number(dateStampMatch[1]) &&
      baseDate.getUTCMonth() === Number(dateStampMatch[2]) - 1 &&
      baseDate.getUTCDate() === Number(dateStampMatch[3]);

    if (!isValidDateStamp) {
      return undefined;
    }

    baseDate.setUTCDate(baseDate.getUTCDate() + days);
    return baseDate.toISOString().slice(0, 10);
  }

  const localDate = new Date(
    Date.UTC(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate()),
  );
  localDate.setUTCDate(localDate.getUTCDate() + days);

  return localDate.toISOString().slice(0, 10);
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

  const dateStampMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (dateStampMatch) {
    const year = Number(dateStampMatch[1]);
    const monthIndex = Number(dateStampMatch[2]) - 1;
    const day = Number(dateStampMatch[3]);
    const localDate = new Date(year, monthIndex, day);

    if (
      localDate.getFullYear() !== year ||
      localDate.getMonth() !== monthIndex ||
      localDate.getDate() !== day
    ) {
      return undefined;
    }

    return localDate;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}
