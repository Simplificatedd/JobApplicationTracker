import type { ApplicationStatus, Interview } from "../types/application";
import { isUpcomingInterview } from "./interviews";

// Status rules for interviews and assessments (#228). Automatic changes only
// move an application up from the two early statuses; Interviewing and the
// final statuses (Offered, Accepted, Rejected, Withdrawn) are never changed.
const EARLY_STATUSES = new Set<ApplicationStatus>(["Awaiting Response", "Online Assessment"]);

// R1: any new interview, whatever its date.
export function statusAfterInterviewAdded(status: ApplicationStatus): ApplicationStatus {
  return EARLY_STATUSES.has(status) ? "Interviewing" : status;
}

// R2: an edit that gives an interview its first future date or deadline.
export function statusAfterInterviewEdited(
  status: ApplicationStatus,
  before: Interview,
  after: Interview,
  now: Date,
): ApplicationStatus {
  return EARLY_STATUSES.has(status) && !isUpcomingInterview(before, now) && isUpcomingInterview(after, now)
    ? "Interviewing"
    : status;
}

// R3: an assessment only moves an application out of Awaiting Response.
export function statusAfterAssessmentAdded(status: ApplicationStatus): ApplicationStatus {
  return status === "Awaiting Response" ? "Online Assessment" : status;
}

// R6-R9: after the last interview or assessment goes, suggest the highest
// status the remaining records still support. Undefined means no prompt.
export function suggestStatusAfterRemoval(
  status: ApplicationStatus,
  removed: "interview" | "assessment",
  remaining: { interviews: number; assessments: number },
): ApplicationStatus | undefined {
  if (remaining.interviews > 0) return undefined;
  if (removed === "interview" && status === "Interviewing") {
    return remaining.assessments > 0 ? "Online Assessment" : "Awaiting Response";
  }
  if (removed === "assessment" && status === "Online Assessment" && remaining.assessments === 0) {
    return "Awaiting Response";
  }
  return undefined;
}
