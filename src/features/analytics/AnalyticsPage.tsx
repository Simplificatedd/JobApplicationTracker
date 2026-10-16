import { BarChart3, Settings2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { APPLICATION_STATUSES, STATUS_TONE } from "../../lib/constants";
import {
  calculateFollowUpDueDate,
  classifyReminderSeverity,
  severityLabel,
} from "../../lib/reminders";
import {
  APPLICATION_OUTCOME_PATH_LABELS,
  classifyApplicationOutcomePath,
  type ApplicationOutcomePath,
} from "../../lib/statusHistory";
import type { AnalyticsSettings } from "../../types/analytics";
import type {
  Activity,
  Application,
  Assessment,
  Interview,
} from "../../types/application";
import type { UserSettings } from "../../types/settings";
import {
  ChartCard,
  type ChartDatum,
  HorizontalBarChart,
  StatTile,
} from "./charts";
import {
  fillPeriods,
  formatPeriod,
  TimeSeriesChart,
} from "./TimeSeriesChart";
import { DonutChart, NEUTRAL_SEGMENT_COLOR } from "./DonutChart";
import {
  deriveApplicationsBySource,
  deriveAppliedByWeekday,
  deriveAssessmentTypes,
  deriveInterviewTypes,
  deriveJobTypeMix,
  deriveResponseRateBySource,
  deriveTimeToFirstResponse,
  deriveTopCompanies,
  deriveWorkModeMix,
  toCumulative,
} from "./extraMetrics";

interface AnalyticsPageProps {
  activities: Activity[];
  analyticsSettings: AnalyticsSettings;
  assessments: Assessment[];
  applications: Application[];
  interviews: Interview[];
  onUpdateAnalyticsSettings: (settings: Partial<AnalyticsSettings>) => void;
  userSettings: UserSettings;
}

const CHART_GROUPS = ["Activity", "Pipeline and outcomes", "Breakdowns"] as const;

const chartOptions: Array<{
  group: (typeof CHART_GROUPS)[number];
  id: string;
  label: string;
}> = [
  { group: "Activity", id: "applicationsOverTime", label: "Applications over time" },
  { group: "Activity", id: "cumulativeApplications", label: "Cumulative applications" },
  { group: "Pipeline and outcomes", id: "statusPipeline", label: "Pipeline by status" },
  { group: "Pipeline and outcomes", id: "followUpLoad", label: "Follow-up load" },
  { group: "Activity", id: "activityCalendar", label: "Activity calendar" },
  { group: "Activity", id: "statusChangesOverTime", label: "Status changes over time" },
  { group: "Activity", id: "interviewsOverTime", label: "Interviews over time" },
  { group: "Activity", id: "assessmentsOverTime", label: "Assessment invitations over time" },
  { group: "Pipeline and outcomes", id: "outcomes", label: "Offers and rejections" },
  { group: "Pipeline and outcomes", id: "applicationPaths", label: "Application paths" },
  { group: "Pipeline and outcomes", id: "responseRateBySource", label: "Response rate by source" },
  { group: "Pipeline and outcomes", id: "timeToFirstResponse", label: "Time to first response" },
  { group: "Breakdowns", id: "applicationsBySource", label: "Applications by source" },
  { group: "Breakdowns", id: "topCompanies", label: "Top companies" },
  { group: "Breakdowns", id: "workModeMix", label: "Work mode" },
  { group: "Breakdowns", id: "jobTypeMix", label: "Job type" },
  { group: "Breakdowns", id: "appliedByWeekday", label: "Applications by weekday" },
  { group: "Breakdowns", id: "interviewTypes", label: "Interview stage types" },
  { group: "Breakdowns", id: "assessmentTypes", label: "Assessment types" },
];

export function AnalyticsPage({
  activities,
  analyticsSettings,
  assessments,
  applications,
  interviews,
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
  const scopedInterviews = interviews.filter((interview) =>
    scopedApplicationIds.has(interview.applicationId),
  );
  const scopedAssessments = assessments.filter((item) =>
    scopedApplicationIds.has(item.applicationId),
  );
  const [dateRange, setDateRange] = useState<DateRange>("all");
  // The date range is view-only state. Timeline charts filter each record by
  // its own date; outcome classification still sees the full record history.
  const rangeStart = getRangeStart(dateRange);
  const isInRange = (value?: string) =>
    !rangeStart || (Boolean(value) && new Date(value as string) >= rangeStart);
  const rangedApplications = scopedApplications.filter((application) =>
    isInRange(application.dateApplied || application.createdAt),
  );
  const rangedActivities = scopedActivities.filter((activity) =>
    isInRange(activity.createdAt),
  );
  const rangedInterviews = scopedInterviews.filter((interview) =>
    isInRange(interview.dateTime),
  );
  const rangedAssessments = scopedAssessments.filter((item) =>
    isInRange(item.receivedAt || item.createdAt),
  );
  const [isCustomizing, setIsCustomizing] = useState(false);
  const customizePanelId = useId();
  const visibleCharts = new Set(analyticsSettings.visibleCharts);
  const visibleChartCount = chartOptions.filter((chart) =>
    visibleCharts.has(chart.id),
  ).length;
  const hasData =
    scopedApplications.length > 0 ||
    scopedActivities.length > 0 ||
    scopedInterviews.length > 0;

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
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              label="Analytics date range"
              onChange={setDateRange}
              options={DATE_RANGE_OPTIONS}
              value={dateRange}
            />
            <SegmentedControl
              label="Analytics time grouping"
              onChange={(value) =>
                onUpdateAnalyticsSettings({ defaultTimeGrouping: value })
              }
              options={TIME_GROUPING_OPTIONS}
              value={analyticsSettings.defaultTimeGrouping}
            />
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-slate-50">
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
            <button
              aria-controls={customizePanelId}
              aria-expanded={isCustomizing}
              className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition ${
                isCustomizing
                  ? "border-primary bg-blue-50 text-primary"
                  : "border-border text-foreground hover:bg-slate-50"
              }`}
              onClick={() => setIsCustomizing((current) => !current)}
              type="button"
            >
              <Settings2 aria-hidden="true" size={16} />
              Customize
              <span className="rounded-full bg-slate-100 px-1.5 text-xs font-semibold text-muted">
                {visibleChartCount}/{chartOptions.length}
              </span>
            </button>
          </div>
        </div>
        {isCustomizing ? (
          <div
            className="mt-4 border-t border-border pt-4"
            id={customizePanelId}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              Analytics settings
            </p>
            <div className="mt-3 space-y-3">
              {CHART_GROUPS.map((group) => (
                <fieldset className="min-w-0" key={group}>
                  <legend className="mb-2 text-xs font-medium text-muted">
                    {group}
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {chartOptions
                      .filter((chart) => chart.group === group)
                      .map((chart) => {
                        const isVisible = visibleCharts.has(chart.id);

                        return (
                          <label
                            className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                              isVisible
                                ? "border-primary/40 bg-blue-50 text-foreground"
                                : "border-border bg-surface text-muted hover:text-foreground"
                            }`}
                            key={chart.id}
                          >
                            <input
                              checked={isVisible}
                              className="h-4 w-4 shrink-0 rounded border-border text-primary"
                              onChange={(event) =>
                                toggleChart(chart.id, event.target.checked)
                              }
                              type="checkbox"
                            />
                            <span className="min-w-0 break-words">
                              {chart.label}
                            </span>
                          </label>
                        );
                      })}
                  </div>
                </fieldset>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {hasData ? (
        <KeyMetrics
          activities={scopedActivities}
          applications={rangedApplications}
          assessments={scopedAssessments}
          dateRange={dateRange}
          interviews={scopedInterviews}
        />
      ) : null}

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
            <TimeChart
              grouping={analyticsSettings.defaultTimeGrouping}
              color="var(--chart-1)"
              title="Applications over time"
              data={deriveApplicationsOverTime(
                rangedApplications,
                analyticsSettings.defaultTimeGrouping,
              )}
            />
          ) : null}
          {visibleCharts.has("cumulativeApplications") ? (
            <TimeChart
              description="Running total within the selected range"
              grouping={analyticsSettings.defaultTimeGrouping}
              color="var(--chart-6)"
              title="Cumulative applications"
              data={toCumulative(
                fillPeriods(
                  deriveApplicationsOverTime(
                    rangedApplications,
                    analyticsSettings.defaultTimeGrouping,
                  ),
                  analyticsSettings.defaultTimeGrouping,
                ),
              )}
            />
          ) : null}
          {visibleCharts.has("statusPipeline") ? (
            <CategoryChart
              barClassName={getStatusBarClass}
              title="Pipeline by status"
              data={derivePipelineByStatus(rangedApplications)}
            />
          ) : null}
          {visibleCharts.has("followUpLoad") ? (
            <CategoryChart
              barClassName={(_, index) => FOLLOW_UP_BAR_CLASSES[index] ?? "bg-primary"}
              description="Current follow-ups; not limited by date range"
              title="Follow-up load"
              data={deriveFollowUpLoad(scopedApplications, userSettings)}
            />
          ) : null}
          {visibleCharts.has("statusChangesOverTime") ? (
            <TimeChart
              grouping={analyticsSettings.defaultTimeGrouping}
              color="var(--chart-7)"
              title="Status changes over time"
              data={deriveActivityOverTime(
                rangedActivities.filter(
                  (activity) => activity.type === "status_changed",
                ),
                analyticsSettings.defaultTimeGrouping,
              )}
            />
          ) : null}
          {visibleCharts.has("interviewsOverTime") ? (
            <TimeChart
              grouping={analyticsSettings.defaultTimeGrouping}
              color="var(--chart-2)"
              title="Interviews over time"
              data={deriveInterviewsOverTime(
                rangedInterviews,
                analyticsSettings.defaultTimeGrouping,
              )}
            />
          ) : null}
          {visibleCharts.has("assessmentsOverTime") ? (
            <TimeChart
              grouping={analyticsSettings.defaultTimeGrouping}
              color="var(--chart-3)"
              title="Assessment invitations over time"
              data={deriveAssessmentsOverTime(
                rangedAssessments,
                analyticsSettings.defaultTimeGrouping,
              )}
            />
          ) : null}
          {visibleCharts.has("outcomes") ? (
            <CategoryChart
              barClassName={getOutcomeBarClass}
              title="Offers and rejections"
              data={deriveOutcomes(
                rangedApplications,
                scopedActivities,
                scopedInterviews,
                scopedAssessments,
              )}
            />
          ) : null}
          {visibleCharts.has("applicationPaths") ? (
            <CategoryChart
              barClassName={getPathBarClass}
              title="Application paths"
              data={deriveApplicationPaths(
                rangedApplications,
                scopedActivities,
                scopedInterviews,
                scopedAssessments,
              )}
            />
          ) : null}
          {visibleCharts.has("responseRateBySource") ? (
            <CategoryChart
              description="Share of applications past Awaiting Response (count in brackets)"
              formatValue={(value) => `${value}%`}
              maxValue={100}
              showShare={false}
              color="var(--chart-5)"
              title="Response rate by source"
              data={deriveResponseRateBySource(rangedApplications)}
            />
          ) : null}
          {visibleCharts.has("timeToFirstResponse") ? (
            <CategoryChart
              description="Days from applying to the first status change"
              title="Time to first response"
              data={deriveTimeToFirstResponse(rangedApplications, scopedActivities)}
            />
          ) : null}
          {visibleCharts.has("applicationsBySource") ? (
            <CategoryChart
              color="var(--chart-5)"
              title="Applications by source"
              data={deriveApplicationsBySource(rangedApplications)}
            />
          ) : null}
          {visibleCharts.has("topCompanies") ? (
            <CategoryChart
              color="var(--chart-7)"
              title="Top companies"
              data={deriveTopCompanies(rangedApplications)}
            />
          ) : null}
          {visibleCharts.has("workModeMix") ? (
            <DonutChartCard
              colors={WORK_MODE_COLORS}
              title="Work mode"
              data={deriveWorkModeMix(rangedApplications)}
            />
          ) : null}
          {visibleCharts.has("jobTypeMix") ? (
            <DonutChartCard
              colors={JOB_TYPE_COLORS}
              title="Job type"
              data={deriveJobTypeMix(rangedApplications)}
            />
          ) : null}
          {visibleCharts.has("appliedByWeekday") ? (
            <CategoryChart
              description="Which days you tend to apply"
              title="Applications by weekday"
              data={deriveAppliedByWeekday(rangedApplications)}
            />
          ) : null}
          {visibleCharts.has("interviewTypes") ? (
            <CategoryChart
              color="var(--chart-2)"
              title="Interview stage types"
              data={deriveInterviewTypes(rangedInterviews)}
            />
          ) : null}
          {visibleCharts.has("assessmentTypes") ? (
            <CategoryChart
              color="var(--chart-3)"
              title="Assessment types"
              data={deriveAssessmentTypes(rangedAssessments)}
            />
          ) : null}
          {visibleCharts.has("activityCalendar") ? (
            <ActivityCalendar
              activities={rangedActivities}
              applications={rangedApplications}
              assessments={rangedAssessments}
              interviews={rangedInterviews}
            />
          ) : null}
        </section>
      )}
    </div>
  );
}

type DateRange = "all" | "30d" | "90d" | "12m";

const DATE_RANGE_OPTIONS: ReadonlyArray<{ label: string; value: DateRange }> = [
  { label: "All time", value: "all" },
  { label: "30 days", value: "30d" },
  { label: "90 days", value: "90d" },
  { label: "12 months", value: "12m" },
];

function getRangeStart(range: DateRange) {
  if (range === "all") {
    return null;
  }

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  if (range === "12m") {
    start.setFullYear(start.getFullYear() - 1);
  } else {
    start.setDate(start.getDate() - (range === "30d" ? 30 : 90));
  }

  return start;
}

const TIME_GROUPING_OPTIONS: ReadonlyArray<{
  label: string;
  value: AnalyticsSettings["defaultTimeGrouping"];
}> = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
];

function SegmentedControl<Value extends string>({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: Value) => void;
  options: ReadonlyArray<{ label: string; value: Value }>;
  value: Value;
}) {
  return (
    <div
      aria-label={label}
      className="inline-flex h-9 items-center rounded-lg border border-border bg-background p-0.5"
      role="radiogroup"
    >
      {options.map((option) => (
        <button
          aria-checked={option.value === value}
          className={`h-full whitespace-nowrap rounded-md px-2.5 text-sm font-medium transition sm:px-3 ${
            option.value === value
              ? "bg-surface text-foreground shadow-sm"
              : "text-muted hover:text-foreground"
          }`}
          key={option.value}
          onClick={() => onChange(option.value)}
          role="radio"
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function KeyMetrics({
  activities,
  applications,
  assessments,
  dateRange,
  interviews,
}: {
  activities: Activity[];
  applications: Application[];
  assessments: Assessment[];
  dateRange: DateRange;
  interviews: Interview[];
}) {
  const countWithStatus = (...statuses: Application["status"][]) =>
    applications.filter((application) => statuses.includes(application.status))
      .length;
  const withdrawn = countWithStatus("Withdrawn");
  const awaiting = countWithStatus("Awaiting Response");
  const responseBase = applications.length - withdrawn;
  const responded = responseBase - awaiting;
  const [offers, accepted] = deriveOutcomes(
    applications,
    activities,
    interviews,
    assessments,
  );
  const weeklyApplications = fillPeriods(
    deriveApplicationsOverTime(applications, "weekly"),
    "weekly",
  ).map((item) => item.value);
  const rangeLabel =
    DATE_RANGE_OPTIONS.find((option) => option.value === dateRange)?.label ??
    "All time";

  return (
    <section
      aria-label="Key metrics"
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      <StatTile
        detail={dateRange === "all" ? "All time" : `Applied in the last ${rangeLabel.toLowerCase()}`}
        label="Applications"
        sparkline={weeklyApplications}
        value={String(applications.length)}
      />
      <StatTile
        detail="Online assessments and interviews"
        label="In progress"
        value={String(countWithStatus("Online Assessment", "Interviewing"))}
      />
      <StatTile
        detail={`${accepted.value} accepted`}
        label="Offers received"
        value={String(offers.value)}
      />
      <StatTile
        detail={
          responseBase > 0
            ? `${responded} of ${responseBase} heard back`
            : "No applications yet"
        }
        label="Response rate"
        value={
          responseBase > 0
            ? `${Math.round((responded / responseBase) * 100)}%`
            : "–"
        }
      />
    </section>
  );
}

// Fixed per-value colors so a value keeps its color when others are filtered out.
const WORK_MODE_COLORS: Record<string, string> = {
  Remote: "var(--chart-1)",
  Hybrid: "var(--chart-2)",
  Onsite: "var(--chart-3)",
};

const JOB_TYPE_COLORS: Record<string, string> = {
  Internship: "var(--chart-1)",
  "Part Time": "var(--chart-2)",
  "Full Time": "var(--chart-3)",
  Contract: "var(--chart-4)",
  Other: "var(--chart-5)",
};

function DonutChartCard({
  colors,
  data,
  title,
}: {
  colors: Record<string, string>;
  data: ChartDatum[];
  title: string;
}) {
  return (
    <ChartCard
      table={{ columns: ["Category", "Count"], rows: data }}
      title={title}
    >
      <DonutChart
        colorFor={(datum) => colors[datum.label] ?? NEUTRAL_SEGMENT_COLOR}
        data={data}
        totalLabel="applications"
      />
    </ChartCard>
  );
}

function CategoryChart({
  barClassName,
  color,
  data,
  description,
  formatValue,
  maxValue,
  showShare,
  title,
}: {
  barClassName?: (datum: ChartDatum, index: number) => string;
  color?: string;
  data: ChartDatum[];
  description?: string;
  formatValue?: (value: number) => string;
  maxValue?: number;
  showShare?: boolean;
  title: string;
}) {
  return (
    <ChartCard
      description={description}
      table={{ columns: ["Category", "Count"], rows: data }}
      title={title}
    >
      <HorizontalBarChart
        barClassName={barClassName}
        color={color}
        data={data}
        formatValue={formatValue}
        maxValue={maxValue}
        showShare={showShare}
      />
    </ChartCard>
  );
}

function TimeChart({
  color,
  data,
  description,
  grouping,
  title,
}: {
  color?: string;
  data: ChartDatum[];
  description?: string;
  grouping: AnalyticsSettings["defaultTimeGrouping"];
  title: string;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <ChartCard
      description={description ?? `${total} total`}
      table={{
        columns: ["Period", "Count"],
        rows: data.map((item) => ({
          label: formatPeriod(item.label, grouping, false),
          value: item.value,
        })),
      }}
      title={title}
    >
      <TimeSeriesChart
        color={color}
        data={data}
        grouping={grouping}
        seriesLabel={title}
      />
    </ChartCard>
  );
}

const STATUS_BAR_CLASS: Record<(typeof STATUS_TONE)[keyof typeof STATUS_TONE], string> = {
  awaiting: "bg-amber-400",
  assessment: "bg-teal-500",
  interviewing: "bg-blue-500",
  offered: "bg-violet-500",
  accepted: "bg-emerald-500",
  rejected: "bg-red-500",
  withdrawn: "bg-slate-400",
};

// Follow-up load is ordered overdue, due today, due soon, upcoming.
const FOLLOW_UP_BAR_CLASSES = [
  "bg-red-500",
  "bg-orange-500",
  "bg-amber-400",
  "bg-sky-500",
];

// Outcome and path bars reuse the pipeline's status colors so the same
// outcome reads the same everywhere on the page.
const OUTCOME_BAR_CLASS: Record<string, string> = {
  "Offers received": STATUS_BAR_CLASS.offered,
  Accepted: STATUS_BAR_CLASS.accepted,
  Rejected: STATUS_BAR_CLASS.rejected,
};

const PATH_BAR_CLASS: Record<ApplicationOutcomePath, string> = {
  accepted: STATUS_BAR_CLASS.accepted,
  offer_pending: STATUS_BAR_CLASS.offered,
  offered_rejected: "bg-red-300",
  online_assessment: STATUS_BAR_CLASS.assessment,
  assessment_rejected: "bg-red-300",
  interviewing: STATUS_BAR_CLASS.interviewing,
  interviewed_rejected: "bg-red-400",
  rejected_without_interview: STATUS_BAR_CLASS.rejected,
  awaiting_response: STATUS_BAR_CLASS.awaiting,
  withdrawn: STATUS_BAR_CLASS.withdrawn,
};

const PATH_BY_LABEL = new Map(
  Object.entries(APPLICATION_OUTCOME_PATH_LABELS).map(([path, label]) => [
    label,
    path as ApplicationOutcomePath,
  ]),
);

function getOutcomeBarClass(datum: ChartDatum) {
  return OUTCOME_BAR_CLASS[datum.label] ?? "bg-primary";
}

function getPathBarClass(datum: ChartDatum) {
  const path = PATH_BY_LABEL.get(datum.label);
  return path ? PATH_BAR_CLASS[path] : "bg-primary";
}

function getStatusBarClass(datum: ChartDatum) {
  const tone = STATUS_TONE[datum.label as keyof typeof STATUS_TONE];
  return tone ? STATUS_BAR_CLASS[tone] : "bg-primary";
}

function ActivityCalendar({
  assessments,
  activities,
  applications,
  interviews,
}: {
  activities: Activity[];
  applications: Application[];
  interviews: Interview[];
  assessments: Assessment[];
}) {
  const days = deriveActivityCalendarDays(
    applications,
    activities,
    interviews,
    assessments,
  );
  const activeDays = days.filter((day) => day.tone !== "none").length;

  return (
    <ChartCard
      className="xl:col-span-2"
      description={`${activeDays} active ${activeDays === 1 ? "day" : "days"}`}
      title="Activity calendar"
    >
      <ActivityHeatmap days={days} />
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
        <LegendItem className={HEATMAP_TONE_CLASS.none} label="No activity" />
        <LegendItem className={HEATMAP_TONE_CLASS.activity} label="Any activity" />
        <LegendItem className={HEATMAP_TONE_CLASS.rejection} label="Rejection-only" />
      </div>
    </ChartCard>
  );
}

type CalendarDay = ReturnType<typeof deriveActivityCalendarDays>[number];

const HEATMAP_TONE_CLASS: Record<CalendarDay["tone"], string> = {
  none: "bg-slate-100",
  activity: "bg-emerald-500",
  rejection: "bg-red-400",
};

const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

function ActivityHeatmap({ days }: { days: CalendarDay[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeDay, setActiveDay] = useState<{
    day: CalendarDay;
    left: number;
    top: number;
  } | null>(null);
  const weeks = groupDaysIntoWeeks(days);
  const monthLabels = getMonthLabels(weeks);

  useEffect(() => {
    const scroller = scrollRef.current;

    if (scroller) {
      scroller.scrollLeft = scroller.scrollWidth;
    }
  }, [weeks.length]);

  function showDay(day: CalendarDay, target: HTMLElement) {
    const scroller = scrollRef.current;

    if (!scroller) {
      return;
    }

    const cell = target.getBoundingClientRect();
    const container = scroller.parentElement?.getBoundingClientRect();

    setActiveDay({
      day,
      left: cell.left - (container?.left ?? 0) + cell.width / 2,
      top: cell.top - (container?.top ?? 0),
    });
  }

  return (
    <div className="relative">
      <div className="overflow-x-auto pb-1" ref={scrollRef}>
        <div className="inline-flex gap-[3px]">
          <div className="mr-1 grid grid-rows-[14px_repeat(7,13px)] gap-[3px] text-[10px] leading-[13px] text-muted">
            <span />
            {WEEKDAY_LABELS.map((label, index) => (
              <span key={index}>{label}</span>
            ))}
          </div>
          {weeks.map((week, weekIndex) => (
            <div className="grid grid-rows-[14px_repeat(7,13px)] gap-[3px]" key={weekIndex}>
              <span className="whitespace-nowrap text-[10px] leading-[14px] text-muted">
                {monthLabels[weekIndex]}
              </span>
              {week.map((day, dayIndex) =>
                day ? (
                  <button
                    aria-label={`${formatCalendarDate(day.date)}. ${day.summary}`}
                    className={`h-[13px] w-[13px] rounded-[3px] transition hover:ring-2 hover:ring-foreground/30 focus-visible:ring-2 focus-visible:ring-primary ${HEATMAP_TONE_CLASS[day.tone]}`}
                    key={day.date}
                    onBlur={() => setActiveDay(null)}
                    onFocus={(event) => showDay(day, event.currentTarget)}
                    onPointerEnter={(event) => showDay(day, event.currentTarget)}
                    onPointerLeave={() => setActiveDay(null)}
                    type="button"
                  />
                ) : (
                  <span key={`empty-${dayIndex}`} />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
      {activeDay ? (
        <div
          className="pointer-events-none absolute z-10 max-w-72 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-popover"
          style={{ left: activeDay.left, top: activeDay.top - 6 }}
        >
          <p className="font-semibold text-foreground">
            {formatCalendarDate(activeDay.day.date)}
          </p>
          <p className="mt-0.5 text-muted">
            {activeDay.day.summary.replace(/^On this date: /, "")}
          </p>
        </div>
      ) : null}
    </div>
  );
}

// Columns are Sunday-first weeks; leading and trailing slots stay empty.
function groupDaysIntoWeeks(days: CalendarDay[]) {
  const weeks: Array<Array<CalendarDay | null>> = [];
  let currentWeek: Array<CalendarDay | null> = [];

  days.forEach((day, index) => {
    const weekday = new Date(`${day.date}T00:00:00.000Z`).getUTCDay();

    if (index === 0) {
      currentWeek = Array.from({ length: weekday }, () => null);
    } else if (weekday === 0) {
      weeks.push(currentWeek);
      currentWeek = [];
    }

    currentWeek.push(day);
  });

  if (currentWeek.length > 0) {
    weeks.push([
      ...currentWeek,
      ...Array.from({ length: 7 - currentWeek.length }, () => null),
    ]);
  }

  return weeks;
}

// Labels the first week of each month. When two labels would crowd each other
// (for example a partial first month), the later month keeps its label.
function getMonthLabels(weeks: Array<Array<CalendarDay | null>>) {
  const labels = weeks.map(() => "");
  let lastLabelIndex = -Infinity;

  weeks.forEach((week, weekIndex) => {
    const firstDay = week.find((day) => day !== null);
    const previousDay = weeks[weekIndex - 1]?.find((day) => day !== null);

    if (!firstDay || firstDay.date.slice(0, 7) === previousDay?.date.slice(0, 7)) {
      return;
    }

    if (weekIndex - lastLabelIndex < 3) {
      labels[lastLabelIndex] = "";
    }

    labels[weekIndex] = new Date(
      `${firstDay.date}T00:00:00.000Z`,
    ).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
    lastLabelIndex = weekIndex;
  });

  return labels;
}

function formatCalendarDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    weekday: "short",
    year: "numeric",
  });
}

function LegendItem({
  className,
  label,
}: {
  className: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-3 w-3 rounded-[3px] ${className}`} />
      {label}
    </span>
  );
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

export function derivePipelineByStatus(applications: Application[]) {
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
    const dueDate = calculateFollowUpDueDate(application);

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

export function deriveInterviewsOverTime(
  interviews: Interview[],
  grouping: AnalyticsSettings["defaultTimeGrouping"],
) {
  return toChartData(
    groupDates(
      interviews
        .map((interview) => interview.dateTime)
        .filter((value): value is string => Boolean(value)),
      grouping,
    ),
  );
}

export function deriveAssessmentsOverTime(
  assessments: Assessment[],
  grouping: AnalyticsSettings["defaultTimeGrouping"],
) {
  return toChartData(
    groupDates(
      assessments.map((item) => item.receivedAt || item.createdAt),
      grouping,
    ),
  );
}

export function deriveOutcomes(
  applications: Application[],
  activities: Activity[],
  interviews: Interview[],
  assessments: Assessment[] = [],
) {
  const outcomePaths = applications.map((application) =>
    classifyApplicationOutcomePath(
      application,
      activities,
      interviews,
      assessments,
    ),
  );
  const offerPaths: ApplicationOutcomePath[] = [
    "accepted",
    "offer_pending",
    "offered_rejected",
  ];
  const rejectionPaths: ApplicationOutcomePath[] = [
    "offered_rejected",
    "assessment_rejected",
    "interviewed_rejected",
    "rejected_without_interview",
  ];

  return [
    {
      label: "Offers received",
      value: outcomePaths.filter((outcomePath) =>
        offerPaths.includes(outcomePath),
      ).length,
    },
    {
      label: "Accepted",
      value: outcomePaths.filter((outcomePath) => outcomePath === "accepted")
        .length,
    },
    {
      label: "Rejected",
      value: outcomePaths.filter((outcomePath) =>
        rejectionPaths.includes(outcomePath),
      ).length,
    },
  ];
}

const APPLICATION_OUTCOME_PATH_ORDER: ApplicationOutcomePath[] = [
  "accepted",
  "offer_pending",
  "offered_rejected",
  "online_assessment",
  "assessment_rejected",
  "interviewing",
  "interviewed_rejected",
  "rejected_without_interview",
  "awaiting_response",
  "withdrawn",
];

export function deriveApplicationPaths(
  applications: Application[],
  activities: Activity[],
  interviews: Interview[],
  assessments: Assessment[] = [],
) {
  const counts = new Map<ApplicationOutcomePath, number>();

  applications.forEach((application) => {
    const outcomePath = classifyApplicationOutcomePath(
      application,
      activities,
      interviews,
      assessments,
    );

    counts.set(outcomePath, (counts.get(outcomePath) ?? 0) + 1);
  });

  return APPLICATION_OUTCOME_PATH_ORDER.map((outcomePath) => ({
    label: APPLICATION_OUTCOME_PATH_LABELS[outcomePath],
    value: counts.get(outcomePath) ?? 0,
  })).filter((item) => item.value > 0);
}

export function deriveActivityCalendarDays(
  applications: Application[],
  activities: Activity[],
  interviews: Interview[],
  assessments: Assessment[] = [],
) {
  const assessmentEventDate = (item: Assessment) =>
    item.submittedAt ||
    item.scheduledStart ||
    item.receivedAt ||
    item.createdAt;
  const dateValues = [
    ...assessments.map(assessmentEventDate),
    ...applications.map(
      (application) => application.dateApplied || application.createdAt,
    ),
    ...activities.map((activity) => activity.createdAt),
    ...interviews
      .map((interview) => interview.dateTime)
      .filter((value): value is string => Boolean(value)),
  ];
  const earliest = dateValues
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((left, right) => left.getTime() - right.getTime())[0];
  const start = startOfMonth(earliest ?? new Date());
  const end = endOfMonth(new Date());
  const activityByDate = new Map<string, Activity[]>();
  const applicationByDate = new Map<string, Application[]>();
  const interviewsByDate = new Map<string, Interview[]>();

  activities.forEach((activity) => {
    const key = toDateKey(activity.createdAt);
    activityByDate.set(key, [...(activityByDate.get(key) ?? []), activity]);
  });
  applications.forEach((application) => {
    const key = toDateKey(application.dateApplied || application.createdAt);
    applicationByDate.set(key, [...(applicationByDate.get(key) ?? []), application]);
  });
  interviews.forEach((interview) => {
    if (!interview.dateTime) return;
    const key = toDateKey(interview.dateTime);
    interviewsByDate.set(key, [...(interviewsByDate.get(key) ?? []), interview]);
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
    const dayInterviews = interviewsByDate.get(key) ?? [];
    const eventCounts = getCalendarEventCounts(
      dayApplications,
      dayActivities,
      dayInterviews,
    );
    const assessmentEvents = assessments.filter(
      (item) => toDateKey(assessmentEventDate(item)) === key,
    ).length;
    const summaryParts = [
      countLabel(assessmentEvents, "assessment event", "assessment events"),
      countLabel(eventCounts.applications, "job applied", "jobs applied"),
      countLabel(
        eventCounts.interviews,
        "interview completed",
        "interviews completed",
      ),
      countLabel(eventCounts.offers, "offer"),
      countLabel(eventCounts.rejections, "rejection"),
      countLabel(eventCounts.statusChanges, "major status change"),
    ].filter(Boolean);
    const primaryActivityCount =
      assessmentEvents +
      eventCounts.applications +
      eventCounts.interviews +
      eventCounts.offers +
      eventCounts.rejections;
    const hasAnyActivity = primaryActivityCount > 0 || eventCounts.statusChanges > 0;
    const hasOnlyRejections =
      eventCounts.rejections > 0 &&
      primaryActivityCount === eventCounts.rejections;

    days.push({
      date: key,
      tone: !hasAnyActivity
        ? ("none" as const)
        : hasOnlyRejections
          ? ("rejection" as const)
          : ("activity" as const),
      summary: hasAnyActivity
        ? `On this date: ${summaryParts.join("; ")}.`
        : `On this date: no activity.`,
    });
  }

  return days;
}

function getCalendarEventCounts(
  applications: Application[],
  activities: Activity[],
  interviews: Interview[],
) {
  const lowerCaseMessages = activities.map((activity) =>
    activity.message.toLowerCase(),
  );

  return {
    applications: applications.length,
    interviews: interviews.length,
    offers: lowerCaseMessages.filter((message) => message.includes("offer"))
      .length,
    rejections: lowerCaseMessages.filter((message) =>
      message.includes("rejected"),
    ).length,
    statusChanges: activities.filter(
      (activity) => activity.type === "status_changed",
    ).length,
  };
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

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  if (count === 0) {
    return null;
  }

  return `${count} ${count === 1 ? singular : plural}`;
}
