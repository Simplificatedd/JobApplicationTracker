import { BarChart3, CalendarDays, CheckSquare, Settings2 } from "lucide-react";
import { APPLICATION_STATUSES } from "../../lib/constants";
import {
  calculateFollowUpDueDate,
  classifyReminderSeverity,
  severityLabel,
} from "../../lib/reminders";
import type { AnalyticsSettings } from "../../types/analytics";
import type { Activity, Application } from "../../types/application";
import type { UserSettings } from "../../types/settings";

interface AnalyticsPageProps {
  activities: Activity[];
  analyticsSettings: AnalyticsSettings;
  applications: Application[];
  onUpdateAnalyticsSettings: (settings: Partial<AnalyticsSettings>) => void;
  userSettings: UserSettings;
}

const chartOptions = [
  { id: "applicationsOverTime", label: "Applications over time" },
  { id: "statusPipeline", label: "Pipeline by status" },
  { id: "followUpLoad", label: "Follow-up load" },
  { id: "activityCalendar", label: "Activity calendar" },
  { id: "statusChangesOverTime", label: "Status changes over time" },
  { id: "interviewsOverTime", label: "Interviews over time" },
  { id: "outcomes", label: "Offers vs rejections" },
];

export function AnalyticsPage({
  activities,
  analyticsSettings,
  applications,
  onUpdateAnalyticsSettings,
  userSettings,
}: AnalyticsPageProps) {
  const scopedApplications = analyticsSettings.includeArchived
    ? applications
    : applications.filter((application) => !application.archivedAt);
  const scopedApplicationIds = new Set(
    scopedApplications.map((application) => application.id),
  );
  const scopedActivities = activities.filter((activity) =>
    scopedApplicationIds.has(activity.applicationId),
  );
  const visibleCharts = new Set(analyticsSettings.visibleCharts);
  const hasData = scopedApplications.length > 0 || scopedActivities.length > 0;

  function toggleChart(chartId: string, checked: boolean) {
    onUpdateAnalyticsSettings({
      visibleCharts: checked
        ? [...analyticsSettings.visibleCharts, chartId]
        : analyticsSettings.visibleCharts.filter((id) => id !== chartId),
    });
  }

  return (
    <div className="space-y-5">
      <section className="surface-panel rounded-lg px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <BarChart3 aria-hidden="true" className="text-muted" size={22} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-foreground">
                  Analytics
                </h2>
                <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold uppercase text-info">
                  Beta
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">
                Local snapshots from your tracker data.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Analytics time grouping"
              className="field-control h-10 w-auto min-w-32"
              onChange={(event) =>
                onUpdateAnalyticsSettings({
                  defaultTimeGrouping: event.target
                    .value as AnalyticsSettings["defaultTimeGrouping"],
                })
              }
              value={analyticsSettings.defaultTimeGrouping}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <label className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold text-foreground">
              <input
                checked={analyticsSettings.includeArchived}
                className="h-4 w-4 rounded border-border text-primary"
                onChange={(event) =>
                  onUpdateAnalyticsSettings({
                    includeArchived: event.target.checked,
                  })
                }
                type="checkbox"
              />
              Include archived
            </label>
          </div>
        </div>
      </section>

      <section className="surface-panel rounded-lg p-4">
        <div className="flex items-center gap-2">
          <Settings2 aria-hidden="true" className="text-muted" size={18} />
          <h3 className="text-sm font-semibold uppercase text-muted">
            Analytics settings
          </h3>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {chartOptions.map((chart) => (
            <label
              className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground"
              key={chart.id}
            >
              <span className="min-w-0 break-words">{chart.label}</span>
              <input
                checked={visibleCharts.has(chart.id)}
                className="h-4 w-4 shrink-0 rounded border-border text-primary"
                onChange={(event) => toggleChart(chart.id, event.target.checked)}
                type="checkbox"
              />
            </label>
          ))}
        </div>
      </section>

      {!hasData ? (
        <section className="surface-panel rounded-lg px-6 py-12 text-center">
          <p className="text-base font-semibold text-foreground">
            No analytics data available
          </p>
          <p className="mt-2 text-sm text-muted">
            Add applications or activity to populate beta analytics.
          </p>
        </section>
      ) : (
        <section className="grid gap-4 xl:grid-cols-2">
          {visibleCharts.has("applicationsOverTime") ? (
            <BarChart
              title="Applications over time"
              data={deriveApplicationsOverTime(
                scopedApplications,
                analyticsSettings.defaultTimeGrouping,
              )}
            />
          ) : null}
          {visibleCharts.has("statusPipeline") ? (
            <BarChart
              title="Pipeline by status"
              data={derivePipelineByStatus(scopedApplications)}
            />
          ) : null}
          {visibleCharts.has("followUpLoad") ? (
            <BarChart
              title="Follow-up load"
              data={deriveFollowUpLoad(scopedApplications, userSettings)}
            />
          ) : null}
          {visibleCharts.has("statusChangesOverTime") ? (
            <BarChart
              title="Status changes over time"
              data={deriveActivityOverTime(
                scopedActivities.filter(
                  (activity) => activity.type === "status_changed",
                ),
                analyticsSettings.defaultTimeGrouping,
              )}
            />
          ) : null}
          {visibleCharts.has("interviewsOverTime") ? (
            <BarChart
              title="Interviews over time"
              data={deriveInterviewsOverTime(
                scopedApplications,
                analyticsSettings.defaultTimeGrouping,
              )}
            />
          ) : null}
          {visibleCharts.has("outcomes") ? (
            <BarChart title="Offers vs rejections" data={deriveOutcomes(scopedApplications)} />
          ) : null}
          {visibleCharts.has("activityCalendar") ? (
            <ActivityCalendar
              activities={scopedActivities}
              applications={scopedApplications}
            />
          ) : null}
        </section>
      )}
    </div>
  );
}

function BarChart({ data, title }: { data: ChartDatum[]; title: string }) {
  const maxValue = Math.max(1, ...data.map((item) => item.value));

  return (
    <article className="surface-panel rounded-lg p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {data.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted">
          No data for this chart.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {data.map((item) => (
            <div className="grid grid-cols-[minmax(7rem,12rem)_1fr_2rem] items-center gap-3" key={item.label}>
              <p className="truncate text-sm font-medium text-foreground">
                {item.label}
              </p>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(5, (item.value / maxValue) * 100)}%` }}
                />
              </div>
              <p className="text-right text-sm font-semibold text-foreground">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function ActivityCalendar({
  activities,
  applications,
}: {
  activities: Activity[];
  applications: Application[];
}) {
  const days = deriveActivityCalendarDays(applications, activities);

  return (
    <article className="surface-panel rounded-lg p-4 xl:col-span-2">
      <div className="flex items-center gap-2">
        <CalendarDays aria-hidden="true" className="text-muted" size={18} />
        <h3 className="text-sm font-semibold text-foreground">Activity calendar</h3>
      </div>
      <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(0.75rem,1fr))] gap-1">
        {days.map((day) => (
          <button
            aria-label={day.summary}
            className={`h-3 rounded-sm ${day.colorClass}`}
            key={day.date}
            title={day.summary}
            type="button"
          />
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-3 text-xs font-medium text-muted">
        <LegendItem className="bg-slate-200" label="No activity" />
        <LegendItem className="bg-success" label="Any activity" />
        <LegendItem className="bg-destructive" label="Rejection-only" />
      </div>
    </article>
  );
}

function LegendItem({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-3 w-3 rounded-sm ${className}`} />
      {label}
    </span>
  );
}

interface ChartDatum {
  label: string;
  value: number;
}

function deriveApplicationsOverTime(
  applications: Application[],
  grouping: AnalyticsSettings["defaultTimeGrouping"],
) {
  return toChartData(
    groupDates(
      applications.map((application) => application.dateApplied || application.createdAt),
      grouping,
    ),
  );
}

function derivePipelineByStatus(applications: Application[]) {
  return APPLICATION_STATUSES.map((status) => ({
    label: status,
    value: applications.filter((application) => application.status === status).length,
  }));
}

function deriveFollowUpLoad(
  applications: Application[],
  userSettings: UserSettings,
) {
  const counts = {
    overdue: 0,
    due_today: 0,
    due_soon: 0,
    upcoming: 0,
  };

  applications.forEach((application) => {
    const dueDate = calculateFollowUpDueDate(
      application,
      userSettings.defaultFollowUpPromptDays,
    );

    if (!dueDate) {
      return;
    }

    counts[classifyReminderSeverity(dueDate, userSettings.dueSoonDays)] += 1;
  });

  return Object.entries(counts).map(([severity, value]) => ({
    label: severityLabel(severity as keyof typeof counts),
    value,
  }));
}

function deriveActivityOverTime(
  activities: Activity[],
  grouping: AnalyticsSettings["defaultTimeGrouping"],
) {
  return toChartData(
    groupDates(
      activities.map((activity) => activity.createdAt),
      grouping,
    ),
  );
}

function deriveInterviewsOverTime(
  applications: Application[],
  grouping: AnalyticsSettings["defaultTimeGrouping"],
) {
  return toChartData(
    groupDates(
      applications
        .map((application) => application.interviewDateTime)
        .filter((value): value is string => Boolean(value)),
      grouping,
    ),
  );
}

function deriveOutcomes(applications: Application[]) {
  return [
    {
      label: "Offered",
      value: applications.filter((application) => application.status === "Offered").length,
    },
    {
      label: "Rejected",
      value: applications.filter((application) => application.status === "Rejected").length,
    },
  ];
}

function deriveActivityCalendarDays(
  applications: Application[],
  activities: Activity[],
) {
  const dateValues = [
    ...applications.map((application) => application.dateApplied || application.createdAt),
    ...activities.map((activity) => activity.createdAt),
  ];
  const earliest = dateValues
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((left, right) => left.getTime() - right.getTime())[0];
  const start = startOfMonth(earliest ?? new Date());
  const end = endOfMonth(new Date());
  const activityByDate = new Map<string, Activity[]>();
  const applicationByDate = new Map<string, Application[]>();

  activities.forEach((activity) => {
    const key = toDateKey(activity.createdAt);
    activityByDate.set(key, [...(activityByDate.get(key) ?? []), activity]);
  });
  applications.forEach((application) => {
    const key = toDateKey(application.dateApplied || application.createdAt);
    applicationByDate.set(key, [...(applicationByDate.get(key) ?? []), application]);
  });

  const days = [];

  for (
    let cursor = new Date(start);
    cursor <= end;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    const key = toDateKey(cursor.toISOString());
    const dayActivities = activityByDate.get(key) ?? [];
    const dayApplications = applicationByDate.get(key) ?? [];
    const summaryParts = [
      countLabel(dayApplications.length, "job applied"),
      countLabel(
        dayActivities.filter((activity) => activity.message.toLowerCase().includes("interview")).length,
        "interview completed",
      ),
      countLabel(
        dayActivities.filter((activity) => activity.message.toLowerCase().includes("offer")).length,
        "offer",
      ),
      countLabel(
        dayActivities.filter((activity) => activity.message.toLowerCase().includes("rejected")).length,
        "rejection",
      ),
      countLabel(
        dayActivities.filter((activity) => activity.type === "status_changed").length,
        "major status change",
      ),
    ].filter(Boolean);
    const hasAnyActivity = summaryParts.length > 0;
    const hasOnlyRejections =
      hasAnyActivity &&
      summaryParts.every((part) => part?.includes("rejection"));

    days.push({
      colorClass: !hasAnyActivity
        ? "bg-slate-200 hover:bg-slate-300"
        : hasOnlyRejections
          ? "bg-destructive hover:opacity-80"
          : "bg-success hover:opacity-80",
      date: key,
      summary: hasAnyActivity
        ? `On this date: ${summaryParts.join("; ")}.`
        : `On this date: no activity.`,
    });
  }

  return days;
}

function groupDates(
  dates: string[],
  grouping: AnalyticsSettings["defaultTimeGrouping"],
) {
  return dates.reduce((counts, value) => {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return counts;
    }

    const key = getGroupKey(date, grouping);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
}

function toChartData(counts: Map<string, number>) {
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, value]) => ({ label, value }));
}

function getGroupKey(
  date: Date,
  grouping: AnalyticsSettings["defaultTimeGrouping"],
) {
  if (grouping === "daily") {
    return date.toISOString().slice(0, 10);
  }

  if (grouping === "monthly") {
    return date.toISOString().slice(0, 7);
  }

  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());
  return `${start.toISOString().slice(0, 10)} week`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function toDateKey(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function countLabel(count: number, singular: string) {
  if (count === 0) {
    return null;
  }

  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}
