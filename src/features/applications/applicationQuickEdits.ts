import type {
  Application,
  ApplicationStatus,
} from "../../types/application";
import { dateTimeEditValue, parseDateValue } from "../../lib/dateTime";
import type { ApplicationUpdate } from "../../store/useTrackerStore";

const INTERVIEW_STATUS_LOCKED_STATUSES = new Set<ApplicationStatus>([
  "Offered",
  "Accepted",
  "Rejected",
  "Withdrawn",
]);

export function createStatusQuickEdit(status: ApplicationStatus) {
  return { status } satisfies ApplicationUpdate;
}

export function canQuickEditInterview(application: Application) {
  return !INTERVIEW_STATUS_LOCKED_STATUSES.has(application.status);
}

export function createInterviewQuickEdit(
  application: Application,
  interviewDateTime: string,
  now = new Date(),
) {
  if (!canQuickEditInterview(application)) return {} satisfies ApplicationUpdate;
  const value = dateTimeEditValue(interviewDateTime, application.interviewDateTime);
  if (value === application.interviewDateTime) return {} satisfies ApplicationUpdate;
  // Scheduling a new interview moves the status whatever the date (#228 R1);
  // re-dating one only does when it gains its first future date (R2).
  // shortcut: an existing interview with no date counts as new here, because
  // the table only sees the projected date; the detail panel applies R2 exactly.
  const isFuture = (date?: string) =>
    (parseDateValue(date)?.getTime() ?? Number.NEGATIVE_INFINITY) > now.getTime();
  const movesStatus = Boolean(value) && (
    !application.interviewDateTime || (!isFuture(application.interviewDateTime) && isFuture(value))
  );
  return {
    interviewDateTime: value,
    ...(movesStatus ? { status: "Interviewing" as const } : {}),
  } satisfies ApplicationUpdate;
}
