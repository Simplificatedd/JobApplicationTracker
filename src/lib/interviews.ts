import { createId } from "./domain";
import type { Application, Interview } from "../types/application";

export function buildInterviewRecord(
  application: Application,
  interviews: Interview[],
  timestamp: string,
) {
  if (application.status !== "Interviewing") {
    return undefined;
  }

  const existing = findInterviewRound(
    interviews,
    application.id,
    application.interviewRound,
  );

  return {
    id: existing?.id ?? createId("interview"),
    applicationId: application.id,
    dateTime: application.interviewDateTime,
    round: application.interviewRound,
    type: application.interviewType ?? "unknown",
    mode: application.interviewMode ?? "other",
    location: application.interviewLocation,
    meetingUrl: application.interviewMeetingUrl,
    platform: application.interviewPlatform,
    proctored: application.interviewProctored,
    deadline: application.interviewDeadline,
    notes: existing?.notes,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  } satisfies Interview;
}

export function upsertInterviewHistory(
  interviews: Interview[],
  interview: Interview,
) {
  return [
    interview,
    ...interviews.filter((candidate) => candidate.id !== interview.id),
  ];
}

function findInterviewRound(
  interviews: Interview[],
  applicationId: string,
  round: number | undefined,
) {
  return interviews
    .filter(
      (interview) =>
        interview.applicationId === applicationId && interview.round === round,
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}
