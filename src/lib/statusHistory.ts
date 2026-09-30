import type { Activity, ApplicationStatus } from "../types/application";

const STATUS_CHANGE_PREFIX = "Status changed to ";
const LEGACY_STATUS_MAP: Record<string, ApplicationStatus> = {
  "Just Applied": "Awaiting Response",
  "Awaiting Response": "Awaiting Response",
  Interviewing: "Interviewing",
  Offered: "Accepted",
  Accepted: "Accepted",
  Rejected: "Rejected",
  Withdrawn: "Withdrawn",
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
