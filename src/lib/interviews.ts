import { createId } from "./domain";
import type {
  Application,
  CanonicalInterviewType,
  DeadlineEntryMode,
  Interview,
  InterviewInput,
  InterviewType,
  InterviewUpdate,
} from "../types/application";

export interface InterviewReconciliation {
  applicationWrites: Application[];
  applications: Application[];
  interviewWrites: Interview[];
  interviews: Interview[];
}

export const MAX_DEADLINE_DURATION_DAYS = 3650;
export const MAX_DEADLINE_DURATION_HOURS = MAX_DEADLINE_DURATION_DAYS * 24;

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
  const classification = normalizeInterviewClassification({
    mode: application.interviewMode ?? "unknown",
    platform: application.interviewPlatform,
    type: application.interviewType ?? "unknown",
  });

  return {
    id: existing?.id ?? createId("interview"),
    applicationId: application.id,
    dateTime: application.interviewDateTime,
    round: application.interviewRound,
    type: classification.type,
    mode: classification.mode,
    location: application.interviewLocation,
    meetingUrl: application.interviewMeetingUrl,
    platform: classification.platform,
    proctored: application.interviewProctored,
    deadline: application.interviewDeadline,
    deadlineEntryMode:
      application.interviewDeadlineEntryMode ?? application.deadlineEntryMode,
    deadlineReceivedAt:
      application.interviewDeadlineReceivedAt ??
      existing?.deadlineReceivedAt ??
      application.createdAt,
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

export function normalizeInterviewType(
  type: InterviewType,
): CanonicalInterviewType {
  if (type === "technical") return "technical-interview";
  if (type === "recruiter") return "recruiter-screen";
  if (type === "face-to-face") return "other";
  if (type === "HireVue" || type === "HackerRank") {
    return "online-assessment";
  }

  return type;
}

export function normalizeInterviewClassification(
  classification: Pick<Interview, "mode" | "platform" | "type">,
) {
  const legacyType = classification.type;
  const type: Interview["type"] = normalizeInterviewType(legacyType);
  let mode = classification.mode;
  let platform = classification.platform;

  if (legacyType === "face-to-face") {
    mode = mode === "unknown" ? "onsite" : mode;
  } else if (legacyType === "HireVue" || legacyType === "HackerRank") {
    platform ||= legacyType;
  }

  return { mode, platform, type };
}

export function isAssessmentStage(
  type: Interview["type"],
) {
  const normalizedType = normalizeInterviewType(type);

  return (
    normalizedType === "take-home-assignment" ||
    normalizedType === "online-assessment"
  );
}

export function shouldShowProctored(
  type: Interview["type"],
  proctored: boolean,
) {
  return proctored || isAssessmentStage(type);
}

export function calculateInterviewDeadline(interview: Interview) {
  if (interview.deadline) {
    return interview.deadline;
  }

  return suggestInterviewDeadline(
    interview.deadlineEntryMode ?? "exact",
    interview.deadlineReceivedAt ?? interview.createdAt,
  );
}

export function suggestInterviewDeadline(
  entryMode: DeadlineEntryMode,
  receivedAt: string,
) {
  if (entryMode === "exact" || !receivedAt) {
    return undefined;
  }

  const hoursByMode = {
    "1_day": 24,
    "2_days": 48,
    "3_days": 72,
    "72_hours": 72,
  } satisfies Record<Exclude<DeadlineEntryMode, "exact">, number>;

  return calculateDeadlineFromDuration(
    receivedAt,
    hoursByMode[entryMode],
    "hours",
  );
}

export function calculateDeadlineFromDuration(
  receivedAt: string,
  amount: number,
  unit: "hours" | "days",
) {
  const receivedDate = new Date(receivedAt);

  if (
    !receivedAt ||
    Number.isNaN(receivedDate.getTime()) ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return undefined;
  }

  const hours = unit === "days" ? amount * 24 : amount;
  const deadlineTimestamp = receivedDate.getTime() + hours * 60 * 60 * 1000;
  const deadlineDate = new Date(deadlineTimestamp);

  if (
    !Number.isFinite(hours) ||
    hours > MAX_DEADLINE_DURATION_HOURS ||
    !Number.isFinite(deadlineTimestamp) ||
    Number.isNaN(deadlineDate.getTime())
  ) {
    return undefined;
  }

  return deadlineDate.toISOString();
}

export function reconcileCanonicalInterviews(
  applications: Application[],
  interviews: Interview[],
  now = new Date(),
): InterviewReconciliation {
  const interviewWritesById = new Map<string, Interview>();
  const nextInterviews = interviews.map((interview) => {
    const classification = normalizeInterviewClassification(interview);

    if (
      classification.type === interview.type &&
      classification.mode === interview.mode &&
      classification.platform === interview.platform
    ) {
      return interview;
    }

    const normalizedInterview = { ...interview, ...classification };
    interviewWritesById.set(normalizedInterview.id, normalizedInterview);
    return normalizedInterview;
  });
  const applicationWrites: Application[] = [];
  const nextApplications = applications.map((application) => {
    let applicationInterviews = nextInterviews.filter(
      (interview) => interview.applicationId === application.id,
    );
    let projectedInterview = findInterviewRound(
      applicationInterviews,
      application.id,
      application.interviewRound,
    );
    const legacyDeadlineTarget =
      projectedInterview ??
      (applicationInterviews.length === 1 ? applicationInterviews[0] : undefined);

    if (
      legacyDeadlineTarget &&
      !legacyDeadlineTarget.deadline &&
      !application.interviewDeadline &&
      application.deadline
    ) {
      const migratedInterview = withLegacyApplicationDeadline(
        legacyDeadlineTarget,
        application,
      );
      const interviewIndex = nextInterviews.findIndex(
        (interview) => interview.id === migratedInterview.id,
      );

      nextInterviews[interviewIndex] = migratedInterview;
      interviewWritesById.set(migratedInterview.id, migratedInterview);
      applicationInterviews = applicationInterviews.map((interview) =>
        interview.id === migratedInterview.id ? migratedInterview : interview,
      );
      projectedInterview =
        projectedInterview?.id === migratedInterview.id
          ? migratedInterview
          : projectedInterview;
    }

    if (!projectedInterview && hasExplicitInterviewProjection(application)) {
      const migratedInterview = interviewFromApplicationProjection(application);

      nextInterviews.push(migratedInterview);
      interviewWritesById.set(migratedInterview.id, migratedInterview);
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
    interviewWrites: Array.from(interviewWritesById.values()),
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
    interviewDeadlineEntryMode: interview?.deadlineEntryMode,
    interviewDeadlineReceivedAt: interview?.deadlineReceivedAt,
  };
}

function interviewFromApplicationProjection(
  application: Application,
  existing?: Interview,
): Interview {
  const legacyDeadline = hasInterviewDetailProjection(application)
    ? application.deadline
    : undefined;
  const classification = normalizeInterviewClassification({
    mode: application.interviewMode ?? "unknown",
    platform: application.interviewPlatform,
    type: application.interviewType ?? "unknown",
  });

  return {
    id: existing?.id ?? createId("interview"),
    applicationId: application.id,
    dateTime: application.interviewDateTime,
    round: application.interviewRound,
    type: classification.type,
    mode: classification.mode,
    location: application.interviewLocation,
    meetingUrl: application.interviewMeetingUrl,
    platform: classification.platform,
    proctored: application.interviewProctored,
    deadline: application.interviewDeadline ?? legacyDeadline,
    deadlineEntryMode:
      application.interviewDeadlineEntryMode ?? application.deadlineEntryMode,
    deadlineReceivedAt:
      application.interviewDeadlineReceivedAt ?? application.createdAt,
    notes: existing?.notes,
    createdAt: existing?.createdAt ?? application.updatedAt,
    updatedAt: application.updatedAt,
  };
}

function withLegacyApplicationDeadline(
  interview: Interview,
  application: Application,
): Interview {
  return {
    ...interview,
    deadline: application.deadline,
    deadlineEntryMode:
      application.interviewDeadlineEntryMode ?? application.deadlineEntryMode,
    deadlineReceivedAt:
      application.interviewDeadlineReceivedAt ?? application.createdAt,
  };
}

function hasInterviewDetailProjection(application: Application) {
  return Boolean(
    application.interviewDateTime ||
      application.interviewRound ||
      application.interviewType ||
      application.interviewMode ||
      application.interviewLocation ||
      application.interviewMeetingUrl ||
      application.interviewPlatform ||
      application.interviewProctored,
  );
}

function hasExplicitInterviewProjection(application: Application) {
  return Boolean(
    hasInterviewDetailProjection(application) ||
      application.interviewDeadline ||
      application.interviewDeadlineEntryMode ||
      application.interviewDeadlineReceivedAt,
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
    "interviewDeadlineEntryMode",
    "interviewDeadlineReceivedAt",
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
