import type { Application, Assessment, Interview } from "../types/application";
import type { NotificationState, UserSettings } from "../types/settings";
import { calculateInterviewDeadline } from "./interviews";

export type ReminderSeverity = "overdue" | "due_today" | "due_soon" | "upcoming";
export type NotificationType =
  | "follow_up"
  | "interview"
  | "deadline"
  | "assessment_start"
  | "assessment_deadline"
  | "offer_deadline"
  | "flagged";
export type NotificationGroup =
  "followups" | "interviews" | "assessments" | "offers" | "other";

export interface ReminderNotification {
  application: Application;
  applicationId: string;
  body: string;
  dueAt?: string;
  group: NotificationGroup;
  id: string;
  interviewId?: string;
  assessmentId?: string;
  severity: ReminderSeverity;
  sortAt: number;
  title: string;
  type: NotificationType;
}

const FINAL_STATUSES = new Set(["Accepted", "Rejected", "Withdrawn"]);

export function calculateFollowUpDueDate(application: Application) {
  return application.followUpDate;
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
  assessments,
  notificationState,
  settings,
  includeArchived = false,
  now = new Date(),
}: {
  applications: Application[];
  interviews?: Interview[];
  assessments?: Assessment[];
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
        assessments?.filter((item) => item.applicationId === application.id),
      ),
    )
    .filter((notification) => !dismissedIds.has(notification.id));

  return sortNotifications(notifications);
}

export function deriveNeedsAttentionApplicationIds({
  applications,
  interviews,
  assessments,
  settings,
  now = new Date(),
}: {
  applications: Application[];
  interviews?: Interview[];
  assessments?: Assessment[];
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
          assessments?.filter((item) => item.applicationId === application.id),
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
  assessments: Assessment[] = [],
): ReminderNotification[] {
  if (
    application.archivedAt ||
    FINAL_STATUSES.has(application.status)
  ) {
    return [];
  }

  if (application.status === "Offered") {
    return [
      ...deriveOfferDeadlineNotification(application, settings, now),
      ...deriveAssessmentNotifications(application, assessments, settings, now),
    ];
  }

  const notifications: ReminderNotification[] = deriveAssessmentNotifications(
    application,
    assessments,
    settings,
    now,
  );
  const followUpDueDate = calculateFollowUpDueDate(application);

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
        title: `Scheduled stage${roundLabel} for ${application.jobTitle}`,
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
        title: `Stage${roundLabel} deadline for ${application.jobTitle}`,
        type: "deadline",
      });
    }
  });

  return notifications;
}

export function deriveAssessmentNotifications(
  application: Application,
  assessments: Assessment[],
  settings: UserSettings,
  now = new Date(),
): ReminderNotification[] {
  if (application.archivedAt || FINAL_STATUSES.has(application.status))
    return [];
  return assessments
    .filter(
      (item) =>
        item.applicationId === application.id &&
        item.progress !== "submitted" &&
        item.progress !== "cancelled",
    )
    .flatMap((assessment): ReminderNotification[] => {
      const events: ReminderNotification[] = [];
      const title = `Assessment ${assessment.number}${assessment.name ? ` · ${assessment.name}` : ""}`;
      const base = {
        application,
        applicationId: application.id,
        assessmentId: assessment.id,
        group: "assessments" as const,
      };
      const start = parseDate(assessment.scheduledStart);
      if (
        start &&
        assessment.scheduledStart &&
        start >= now &&
        settings.includeUpcomingInterviewsInAttention
      ) {
        const severity = classifyReminderSeverity(
          start,
          settings.dueSoonDays,
          now,
        );
        events.push({
          ...base,
          id: buildNotificationId(
            application.id,
            assessment.legacyInterview ? "interview" : "assessment_start",
            assessment.id,
          ),
          type: "assessment_start",
          dueAt: assessment.scheduledStart,
          severity,
          sortAt: start.getTime(),
          title: `${title} scheduled for ${application.jobTitle}`,
          body: [application.company, severityLabel(severity)]
            .filter(Boolean)
            .join(" / "),
        });
      }
      const dueDate = parseDate(assessment.deadline);
      if (dueDate && assessment.deadline) {
        const severity =
          dueDate < now
            ? "overdue"
            : classifyReminderSeverity(dueDate, settings.dueSoonDays, now);
        events.push({
          ...base,
          // Keep the legacy deadline identity so previously dismissed reminders stay dismissed.
          id: buildNotificationId(
            application.id,
            assessment.legacyInterview ? "deadline" : "assessment_deadline",
            assessment.id,
          ),
          type: "assessment_deadline",
          severity,
          dueAt: assessment.deadline,
          sortAt: dueDate.getTime(),
          title: `${title} deadline for ${application.jobTitle}`,
          body: [application.company, severityLabel(severity)]
            .filter(Boolean)
            .join(" / "),
        });
      }
      return events;
    });
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
