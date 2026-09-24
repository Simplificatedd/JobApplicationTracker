import type {
  Application,
  ApplicationStatus,
} from "../../types/application";
import type { ApplicationUpdate } from "../../store/useTrackerStore";

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
    ...(interviewDateTime && application.status !== "Interviewing"
      ? { status: "Interviewing" as const }
      : {}),
  } satisfies ApplicationUpdate;
}
