import type {
  Activity,
  Application,
  ApplicationStatus,
  Assessment,
  Interview,
} from "../types/application";

const STATUS_CHANGE_PREFIX = "Status changed to ";
const LEGACY_STATUS_MAP: Record<string, ApplicationStatus> = {
  "Just Applied": "Awaiting Response",
  "Awaiting Response": "Awaiting Response",
  "Online Assessment": "Online Assessment",
  Interviewing: "Interviewing",
  Offered: "Accepted",
  Accepted: "Accepted",
  Rejected: "Rejected",
  Withdrawn: "Withdrawn",
};

export type ApplicationOutcomePath =
  | "accepted"
  | "offered_rejected"
  | "interviewed_rejected"
  | "rejected_without_interview"
  | "withdrawn"
  | "offer_pending"
  | "online_assessment"
  | "assessment_rejected"
  | "interviewing"
  | "awaiting_response";

export const APPLICATION_OUTCOME_PATH_LABELS: Record<
  ApplicationOutcomePath,
  string
> = {
  accepted: "Accepted",
  offered_rejected: "Offered → Rejected",
  interviewed_rejected: "Interviewed → Rejected",
  rejected_without_interview: "Rejected before interview",
  withdrawn: "Withdrawn",
  offer_pending: "Offer pending",
  online_assessment: "Online assessment",
  assessment_rejected: "Assessed → Rejected",
  interviewing: "Interviewing",
  awaiting_response: "Awaiting response",
};

export function normalizeStatusActivities(
  activities: Activity[],
  legacyOfferSemantics = false,
) {
  return activities.map((activity) =>
    normalizeStatusActivity(activity, legacyOfferSemantics),
  );
}

export function normalizeStatusActivity(
  activity: Activity,
  legacyOfferSemantics = false,
): Activity {
  if (activity.type !== "status_changed") {
    return activity;
  }

  if (activity.statusTo) {
    if (!legacyOfferSemantics) {
      return activity;
    }

    return {
      ...activity,
      statusFrom: migrateLegacyOfferedStatus(activity.statusFrom),
      statusTo: migrateLegacyOfferedStatus(activity.statusTo),
    };
  }

  const statusTo = statusFromLegacyMessage(activity.message);

  return statusTo ? { ...activity, statusTo } : activity;
}

export function deriveApplicationStatusPath(
  application: Application,
  activities: Activity[],
  interviews: Interview[] = [],
  assessments: Assessment[] = [],
) {
  const relevantActivities = normalizeStatusActivities(
    activities.filter(
      (activity) => activity.applicationId === application.id,
    ),
  );
  const statusEvents = relevantActivities
    .filter(
      (activity) =>
        activity.statusTo &&
        (activity.type === "created" || activity.type === "status_changed"),
    )
    .map((activity) => ({
      createdAt: activity.createdAt,
      order: activity.type === "created" ? 0 : 2,
      statusFrom: activity.statusFrom,
      statusTo: activity.statusTo!,
    }));
  const hasInitialStatus = statusEvents.some((event) => event.order === 0);
  const hasInterviewStatus = statusEvents.some(
    (event) =>
      event.statusFrom === "Interviewing" || event.statusTo === "Interviewing",
  );
  const applicationInterviews = interviews.filter(
    (interview) => interview.applicationId === application.id,
  );
  const earliestInterview = [...applicationInterviews].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  )[0];

  if (!hasInitialStatus) {
    statusEvents.push({
      createdAt: application.createdAt,
      order: 0,
      statusFrom: undefined,
      statusTo: "Awaiting Response",
    });
  }

  if (!hasInterviewStatus && earliestInterview) {
    statusEvents.push({
      createdAt: earliestInterview.createdAt,
      order: 1,
      statusFrom: undefined,
      statusTo: "Interviewing",
    });
  }

  const firstAssessment = assessments
    .filter((item) => item.applicationId === application.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (
    firstAssessment &&
    !statusEvents.some((event) => event.statusTo === "Online Assessment")
  ) {
    statusEvents.push({
      createdAt: firstAssessment.createdAt,
      order: 1,
      statusFrom: undefined,
      statusTo: "Online Assessment",
    });
  }

  statusEvents.push({
    createdAt: application.updatedAt,
    order: 3,
    statusFrom: undefined,
    statusTo: application.status,
  });

  const path: ApplicationStatus[] = [];

  statusEvents
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.order - right.order,
    )
    .forEach((event) => {
      if (path[path.length - 1] === event.statusTo) {
        return;
      }

      appendStatus(path, event.statusFrom);
      appendStatus(path, event.statusTo);
    });

  return path;
}

export function classifyApplicationOutcomePath(
  application: Application,
  activities: Activity[],
  interviews: Interview[] = [],
  assessments: Assessment[] = [],
): ApplicationOutcomePath {
  const path = deriveApplicationStatusPath(
    application,
    activities,
    interviews,
    assessments,
  );
  const reachedOffer = path.includes("Offered");
  const applicationAssessments = assessments.filter(
    (item) => item.applicationId === application.id,
  );
  const hasMigratedAssessments = applicationAssessments.some(
    (item) => item.legacyInterview,
  );
  const reachedInterview =
    interviews.some(
      (interview) => interview.applicationId === application.id,
    ) ||
    (path.includes("Interviewing") && !hasMigratedAssessments);
  const reachedAssessment =
    path.includes("Online Assessment") || applicationAssessments.length > 0;

  if (application.status === "Accepted") {
    return "accepted";
  }

  if (application.status === "Rejected") {
    if (reachedOffer) {
      return "offered_rejected";
    }

    return reachedInterview
      ? "interviewed_rejected"
      : reachedAssessment
        ? "assessment_rejected"
        : "rejected_without_interview";
  }

  if (application.status === "Withdrawn") {
    return "withdrawn";
  }

  if (application.status === "Offered") {
    return "offer_pending";
  }

  if (application.status === "Online Assessment") return "online_assessment";
  return application.status === "Interviewing"
    ? "interviewing"
    : "awaiting_response";
}

function statusFromLegacyMessage(message: string) {
  if (!message.startsWith(STATUS_CHANGE_PREFIX) || !message.endsWith(".")) {
    return undefined;
  }

  const value = message.slice(STATUS_CHANGE_PREFIX.length, -1);
  return LEGACY_STATUS_MAP[value];
}

function migrateLegacyOfferedStatus(status?: ApplicationStatus) {
  return status === "Offered" ? "Accepted" : status;
}

function appendStatus(
  path: ApplicationStatus[],
  status: ApplicationStatus | undefined,
) {
  if (status && path[path.length - 1] !== status) {
    path.push(status);
  }
}
