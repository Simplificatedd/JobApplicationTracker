import { getInterviewTypeLabel } from "../../lib/constants";
import type {
  Activity,
  Application,
  Assessment,
  Interview,
} from "../../types/application";
import type { ChartDatum } from "./charts";

const NOT_SET_LABEL = "Not set";
const OTHER_LABEL = "Other";
const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function getApplicationDate(application: Application) {
  return application.dateApplied || application.createdAt;
}

// Counts values, keeps the largest groups and folds the remainder into
// "Other" so long tails do not crowd the chart.
export function countTopValues(
  values: Array<string | undefined>,
  limit = 8,
): ChartDatum[] {
  const counts = new Map<string, number>();

  values.forEach((value) => {
    const label = value?.trim() || NOT_SET_LABEL;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });

  const sorted = [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));

  if (sorted.length <= limit) {
    return sorted;
  }

  const kept = sorted.slice(0, limit - 1);
  const otherTotal = sorted
    .slice(limit - 1)
    .reduce((sum, item) => sum + item.value, 0);

  return [...kept, { label: OTHER_LABEL, value: otherTotal }];
}

export function formatOptionLabel(value?: string) {
  if (!value || value === "unknown") {
    return undefined;
  }

  return value
    .split(/[-_]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function deriveApplicationsBySource(applications: Application[]) {
  return countTopValues(applications.map((application) => application.source));
}

export function deriveTopCompanies(applications: Application[]) {
  return countTopValues(applications.map((application) => application.company));
}

export function deriveWorkModeMix(applications: Application[]) {
  return countTopValues(
    applications.map((application) => formatOptionLabel(application.workMode)),
  );
}

export function deriveJobTypeMix(applications: Application[]) {
  return countTopValues(
    applications.map((application) => formatOptionLabel(application.jobType)),
  );
}

export function deriveInterviewTypes(interviews: Interview[]) {
  return countTopValues(
    interviews.map((interview) =>
      interview.type === "unknown" ? undefined : getInterviewTypeLabel(interview.type),
    ),
  );
}

export function deriveAssessmentTypes(assessments: Assessment[]) {
  return countTopValues(assessments.map((item) => formatOptionLabel(item.type)));
}

export function deriveAppliedByWeekday(applications: Application[]) {
  const counts = WEEKDAY_LABELS.map(() => 0);

  applications.forEach((application) => {
    const value = getApplicationDate(application);
    // Date-only values are calendar days; parse them as local dates so the
    // weekday does not shift with the time zone offset.
    const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);

    if (!Number.isNaN(date.getTime())) {
      counts[date.getDay()] += 1;
    }
  });

  return WEEKDAY_LABELS.map((label, index) => ({ label, value: counts[index] }));
}

// Share of non-withdrawn applications per source that have moved past
// "Awaiting Response". Values are whole percentages.
export function deriveResponseRateBySource(applications: Application[]) {
  const totals = new Map<string, { responded: number; total: number }>();

  applications.forEach((application) => {
    if (application.status === "Withdrawn") {
      return;
    }

    const label = application.source?.trim() || NOT_SET_LABEL;
    const current = totals.get(label) ?? { responded: 0, total: 0 };

    current.total += 1;

    if (application.status !== "Awaiting Response") {
      current.responded += 1;
    }

    totals.set(label, current);
  });

  return [...totals.entries()]
    .map(([label, { responded, total }]) => ({
      label: `${label} (${total})`,
      value: Math.round((responded / total) * 100),
      total,
    }))
    .sort((left, right) => right.value - left.value || right.total - left.total)
    .slice(0, 8)
    .map(({ label, value }) => ({ label, value }));
}

export const RESPONSE_TIME_BUCKETS = [
  { label: "Within 1 week", maxDays: 7 },
  { label: "1–2 weeks", maxDays: 14 },
  { label: "2–4 weeks", maxDays: 30 },
  { label: "1–2 months", maxDays: 60 },
  { label: "Over 2 months", maxDays: Infinity },
];

// Days from applying to the first recorded status change away from
// "Awaiting Response".
export function deriveTimeToFirstResponse(
  applications: Application[],
  activities: Activity[],
) {
  const firstResponseByApplication = new Map<string, number>();

  activities.forEach((activity) => {
    if (
      activity.type !== "status_changed" ||
      activity.statusFrom !== "Awaiting Response"
    ) {
      return;
    }

    const time = new Date(activity.createdAt).getTime();
    const current = firstResponseByApplication.get(activity.applicationId);

    if (!Number.isNaN(time) && (current === undefined || time < current)) {
      firstResponseByApplication.set(activity.applicationId, time);
    }
  });

  const counts = RESPONSE_TIME_BUCKETS.map(() => 0);

  applications.forEach((application) => {
    const respondedAt = firstResponseByApplication.get(application.id);
    const appliedAt = new Date(getApplicationDate(application)).getTime();

    if (respondedAt === undefined || Number.isNaN(appliedAt)) {
      return;
    }

    const days = Math.max(0, (respondedAt - appliedAt) / 86_400_000);
    const bucketIndex = RESPONSE_TIME_BUCKETS.findIndex(
      (bucket) => days <= bucket.maxDays,
    );

    counts[bucketIndex] += 1;
  });

  return RESPONSE_TIME_BUCKETS.map((bucket, index) => ({
    label: bucket.label,
    value: counts[index],
  }));
}

export function toCumulative(data: ChartDatum[]) {
  let runningTotal = 0;

  return data.map((item) => {
    runningTotal += item.value;
    return { label: item.label, value: runningTotal };
  });
}
