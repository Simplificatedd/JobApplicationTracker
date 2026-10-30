import type {
  Application,
  ApplicationStatus,
} from "../../types/application";
import { dateTimeEditValue } from "../../lib/dateTime";
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
) {
  if (!canQuickEditInterview(application)) return {} satisfies ApplicationUpdate;
  const value = dateTimeEditValue(interviewDateTime, application.interviewDateTime);
  if (value === application.interviewDateTime) return {} satisfies ApplicationUpdate;
  return {
    interviewDateTime: value,
    ...(interviewDateTime &&
      !INTERVIEW_STATUS_LOCKED_STATUSES.has(application.status)
      ? { status: "Interviewing" as const }
      : {}),
  } satisfies ApplicationUpdate;
}
