import { createId } from "./domain";
import type { Application, Interview } from "../types/application";

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

export function reconcileCanonicalInterviews(
  applications: Application[],
  interviews: Interview[],
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

    if (
      (!projectedInterview && hasExplicitInterviewProjection(application)) ||
      (applicationInterviews.length === 0 && application.status === "Interviewing")
    ) {
      const migratedInterview = interviewFromApplicationProjection(application);

      nextInterviews.push(migratedInterview);
      interviewWrites.push(migratedInterview);
      applicationInterviews = [...applicationInterviews, migratedInterview];
    } else if (
      projectedInterview &&
      application.updatedAt > projectedInterview.updatedAt &&
      hasDifferentInterviewProjection(
        application,
        applyInterviewProjection(application, projectedInterview),
      )
    ) {
      const reconciledInterview = interviewFromApplicationProjection(
        application,
        projectedInterview,
      );
      const interviewIndex = nextInterviews.findIndex(
        (interview) => interview.id === reconciledInterview.id,
      );

      nextInterviews[interviewIndex] = reconciledInterview;
      interviewWrites.push(reconciledInterview);
      applicationInterviews = applicationInterviews.map((interview) =>
        interview.id === reconciledInterview.id
          ? reconciledInterview
          : interview,
      );
    }

    const currentInterview = selectCurrentInterview(applicationInterviews, {
      round: application.interviewRound,
    });

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
  preferred?: { round?: number },
) {
  const sortedInterviews = [...interviews].sort((left, right) => {
    const roundDifference = (right.round ?? 0) - (left.round ?? 0);

    return roundDifference || right.updatedAt.localeCompare(left.updatedAt);
  });

  return (
    (preferred
      ? sortedInterviews.find(
          (interview) => interview.round === preferred.round,
        )
      : undefined) ?? sortedInterviews[0]
  );
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
    mode: application.interviewMode ?? "other",
    location: application.interviewLocation,
    meetingUrl: application.interviewMeetingUrl,
    platform: application.interviewPlatform,
    proctored: application.interviewProctored,
    deadline: application.interviewDeadline,
    notes: existing?.notes,
    createdAt: existing?.createdAt ?? application.updatedAt,
    updatedAt: application.updatedAt,
  };
}

function applyInterviewProjection(
  application: Application,
  interview: Interview,
): Application {
  return {
    ...application,
    interviewDateTime: interview.dateTime,
    interviewRound: interview.round,
    interviewType: interview.type,
    interviewMode: interview.mode,
    interviewLocation: interview.location,
    interviewMeetingUrl: interview.meetingUrl,
    interviewPlatform: interview.platform,
    interviewProctored: interview.proctored,
    interviewDeadline: interview.deadline,
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
