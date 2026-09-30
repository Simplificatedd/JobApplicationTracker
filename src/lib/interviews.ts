import { createId } from "./domain";
import type {
  Application,
  DeadlineEntryMode,
  Interview,
  InterviewInput,
  InterviewUpdate,
} from "../types/application";

export interface InterviewReconciliation {
  applicationWrites: Application[];
  applications: Application[];
  interviewWrites: Interview[];
  interviews: Interview[];
}

export function buildInterviewRecord(
  application: Application,
  interviews: Interview[],
  timestamp: string,
  interviewId?: string,
) {
  if (application.status !== "Interviewing") {
    return undefined;
  }

  const existing = interviewId
    ? interviews.find((interview) => interview.id === interviewId)
    : findInterviewRound(
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
    mode: application.interviewMode ?? "unknown",
    location: application.interviewLocation,
    meetingUrl: application.interviewMeetingUrl,
    platform: application.interviewPlatform,
    proctored: application.interviewProctored,
    deadline: application.interviewDeadline,
    deadlineEntryMode: application.deadlineEntryMode,
    deadlineReceivedAt: existing?.deadlineReceivedAt ?? application.createdAt,
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

export function createInterviewRecord(
  input: InterviewInput,
  timestamp: string,
): Interview {
  return {
    ...input,
    deadlineEntryMode: input.deadlineEntryMode ?? "exact",
    id: createId("interview"),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function updateInterviewRecord(
  interview: Interview,
  input: InterviewUpdate,
  timestamp: string,
): Interview {
  return {
    ...interview,
    ...input,
    applicationId: interview.applicationId,
    id: interview.id,
    createdAt: interview.createdAt,
    updatedAt: timestamp,
  };
}

export function getNextInterviewRound(interviews: Interview[]) {
  return Math.max(0, ...interviews.map((interview) => interview.round ?? 0)) + 1;
}

export function isValidInterviewRound(round: number | undefined) {
  return round === undefined || (Number.isInteger(round) && round > 0);
}

export function calculateInterviewDeadline(interview: Interview) {
  if (interview.deadline) {
    return interview.deadline;
  }

  const entryMode = interview.deadlineEntryMode ?? "exact";

  if (entryMode === "exact") {
    return undefined;
  }

  const receivedAt = interview.deadlineReceivedAt ?? interview.createdAt;
  const receivedDate = new Date(receivedAt);

  if (Number.isNaN(receivedDate.getTime())) {
    return undefined;
  }

  const hoursByMode = {
    "1_day": 24,
    "2_days": 48,
    "3_days": 72,
    "72_hours": 72,
  } satisfies Record<Exclude<DeadlineEntryMode, "exact">, number>;

  return new Date(
    receivedDate.getTime() + hoursByMode[entryMode] * 60 * 60 * 1000,
  ).toISOString();
}

export function reconcileCanonicalInterviews(
  applications: Application[],
  interviews: Interview[],
  now = new Date(),
): InterviewReconciliation {
  const nextInterviews = [...interviews];
  const interviewWrites: Interview[] = [];
  const applicationWrites: Application[] = [];
  const nextApplications = applications.map((application) => {
    let applicationInterviews = nextInterviews.filter(
      (interview) => interview.applicationId === application.id,
    );
    const projectedInterview = findInterviewRound(
      applicationInterviews,
      application.id,
      application.interviewRound,
    );

    if (!projectedInterview && hasExplicitInterviewProjection(application)) {
      const migratedInterview = interviewFromApplicationProjection(application);

      nextInterviews.push(migratedInterview);
      interviewWrites.push(migratedInterview);
      applicationInterviews = [...applicationInterviews, migratedInterview];
    }

    const currentInterview = selectCurrentInterview(applicationInterviews, now);

    if (!currentInterview) {
      return application;
    }

    const projectedApplication = applyInterviewProjection(
      application,
      currentInterview,
    );

    if (hasDifferentInterviewProjection(application, projectedApplication)) {
      applicationWrites.push(projectedApplication);
      return projectedApplication;
    }

    return application;
  });

  return {
    applicationWrites,
    applications: nextApplications,
    interviewWrites,
    interviews: nextInterviews,
  };
}

export function selectCurrentInterview(
  interviews: Interview[],
  now = new Date(),
) {
  const nowTime = now.getTime();

  return [...interviews].sort((left, right) => {
    const leftUpcoming = getUpcomingTime(left, nowTime);
    const rightUpcoming = getUpcomingTime(right, nowTime);

    if (leftUpcoming !== undefined || rightUpcoming !== undefined) {
      if (leftUpcoming === undefined) return 1;
      if (rightUpcoming === undefined) return -1;
      if (leftUpcoming !== rightUpcoming) return leftUpcoming - rightUpcoming;
    } else {
      const leftPast = getPastTime(left, nowTime);
      const rightPast = getPastTime(right, nowTime);

      if (leftPast !== rightPast) return rightPast - leftPast;
    }

    const roundDifference = (right.round ?? 0) - (left.round ?? 0);
    return roundDifference || right.updatedAt.localeCompare(left.updatedAt);
  })[0];
}

export function isUpcomingInterview(interview: Interview, now = new Date()) {
  return getUpcomingTime(interview, now.getTime()) !== undefined;
}

export function applyInterviewProjection(
  application: Application,
  interview?: Interview,
): Application {
  return {
    ...application,
    interviewDateTime: interview?.dateTime,
    interviewRound: interview?.round,
    interviewType: interview?.type,
    interviewMode: interview?.mode,
    interviewLocation: interview?.location,
    interviewMeetingUrl: interview?.meetingUrl,
    interviewPlatform: interview?.platform,
    interviewProctored: interview?.proctored ?? false,
    interviewDeadline: interview?.deadline,
  };
}

function interviewFromApplicationProjection(
  application: Application,
  existing?: Interview,
): Interview {
  return {
    id: existing?.id ?? createId("interview"),
    applicationId: application.id,
    dateTime: application.interviewDateTime,
    round: application.interviewRound,
    type: application.interviewType ?? "unknown",
    mode: application.interviewMode ?? "unknown",
    location: application.interviewLocation,
    meetingUrl: application.interviewMeetingUrl,
    platform: application.interviewPlatform,
    proctored: application.interviewProctored,
    deadline: application.interviewDeadline,
    deadlineEntryMode: application.deadlineEntryMode,
    deadlineReceivedAt: application.createdAt,
    notes: existing?.notes,
    createdAt: existing?.createdAt ?? application.updatedAt,
    updatedAt: application.updatedAt,
  };
}

function hasExplicitInterviewProjection(application: Application) {
  return Boolean(
    application.interviewDateTime ||
      application.interviewRound ||
      application.interviewType ||
      application.interviewMode ||
      application.interviewLocation ||
      application.interviewMeetingUrl ||
      application.interviewPlatform ||
      application.interviewProctored ||
      application.interviewDeadline,
  );
}

function getInterviewTimes(interview: Interview) {
  return [interview.dateTime, interview.deadline]
    .map((value) => (value ? new Date(value).getTime() : Number.NaN))
    .filter((value) => !Number.isNaN(value));
}

function getUpcomingTime(interview: Interview, nowTime: number) {
  const upcomingTimes = getInterviewTimes(interview).filter(
    (value) => value >= nowTime,
  );

  return upcomingTimes.length > 0 ? Math.min(...upcomingTimes) : undefined;
}

function getPastTime(interview: Interview, nowTime: number) {
  const pastTimes = getInterviewTimes(interview).filter((value) => value < nowTime);

  return pastTimes.length > 0 ? Math.max(...pastTimes) : Number.NEGATIVE_INFINITY;
}

function hasDifferentInterviewProjection(
  previous: Application,
  next: Application,
) {
  return [
    "interviewDateTime",
    "interviewRound",
    "interviewType",
    "interviewMode",
    "interviewLocation",
    "interviewMeetingUrl",
    "interviewPlatform",
    "interviewProctored",
    "interviewDeadline",
  ].some(
    (key) =>
      previous[key as keyof Application] !== next[key as keyof Application],
  );
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
