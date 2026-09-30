import type {
  Application,
  ApplicationStatus,
} from "../../types/application";
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

export function createFollowUpQuickEdit(
  followUpNeeded: boolean,
  followUpDate: string,
) {
  return {
    followUpDate: followUpDate || undefined,
    followUpNeeded,
  } satisfies ApplicationUpdate;
}

export function createInterviewQuickEdit(
  application: Application,
  interviewDateTime: string,
) {
  return {
    interviewDateTime: interviewDateTime || undefined,
    ...(interviewDateTime &&
      !INTERVIEW_STATUS_LOCKED_STATUSES.has(application.status)
      ? { status: "Interviewing" as const }
      : {}),
  } satisfies ApplicationUpdate;
}
