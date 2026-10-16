import type { ReactNode } from "react";
import { STATUS_TONE } from "../../lib/constants";
import {
  APPLICATION_OUTCOME_PATH_LABELS,
  type ApplicationOutcomePath,
} from "../../lib/statusHistory";
import type { AnalyticsSettings } from "../../types/analytics";
import { ChartCard, type ChartDatum, HorizontalBarChart } from "./charts";
import { ColumnChart } from "./ColumnChart";
import { DonutChart, NEUTRAL_SEGMENT_COLOR } from "./DonutChart";
import { type ChartSeries, MultiSeriesChart } from "./MultiSeriesChart";
import {
  applyNotSetFilter,
  isNotSetLabel,
  NotSetToggle,
  useIncludeNotSet,
} from "./notSetFilter";
import { formatPeriod, TimeSeriesChart } from "./TimeSeriesChart";

export function ActivityComparisonCard({
  grouping,
  series,
}: {
  grouping: AnalyticsSettings["defaultTimeGrouping"];
  series: ChartSeries[];
}) {
  return (
    <ChartCard
      className="xl:col-span-2"
      description="Click a legend item to show or hide a line"
      table={{
        columns: ["Series", "Total"],
        rows: series.map((item) => ({
          label: item.label,
          value: item.data.reduce((sum, point) => sum + point.value, 0),
        })),
      }}
      title="Activity comparison"
    >
      <MultiSeriesChart grouping={grouping} series={series} />
    </ChartCard>
  );
}

// Ordered response-time buckets use the validated light-to-dark blue ramp.
export const RESPONSE_TIME_COLORS = [
  "var(--chart-ramp-1)",
  "var(--chart-ramp-2)",
  "var(--chart-ramp-3)",
  "var(--chart-ramp-4)",
  "var(--chart-ramp-5)",
];

export const RESPONSE_TIME_SHORT_LABELS: Record<string, string> = {
  "Within 1 week": "≤ 1 wk",
  "1–2 weeks": "1–2 wk",
  "2–4 weeks": "2–4 wk",
  "1–2 months": "1–2 mo",
  "Over 2 months": "2+ mo",
};

export const WEEKDAY_MUTED_COLOR = "#b7d3f6";

export function ColumnChartCard({
  colorFor,
  data,
  description,
  shortLabel,
  title,
}: {
  colorFor: (datum: ChartDatum, index: number, isMax: boolean) => string;
  data: ChartDatum[];
  description?: string;
  shortLabel?: (label: string) => string;
  title: string;
}) {
  return (
    <ChartCard
      description={description}
      table={{ columns: ["Category", "Count"], rows: data }}
      title={title}
    >
      <ColumnChart colorFor={colorFor} data={data} shortLabel={shortLabel} />
    </ChartCard>
  );
}

export function DonutChartCard({
  colors,
  data,
  notSetFilterId,
  title,
}: {
  colors: Record<string, string>;
  data: ChartDatum[];
  notSetFilterId: string;
  title: string;
}) {
  const [includeNotSet, setIncludeNotSet] = useIncludeNotSet(notSetFilterId);
  const { hasNotSet, notSetCount, visibleData } = applyNotSetFilter(
    data,
    includeNotSet,
  );

  return (
    <ChartCard
      action={
        hasNotSet ? (
          <NotSetToggle includeNotSet={includeNotSet} onChange={setIncludeNotSet} />
        ) : null
      }
      description={describeTotal(visibleData, "applications", notSetCount, includeNotSet)}
      table={{ columns: ["Category", "Count"], rows: visibleData }}
      title={title}
    >
      <DonutChart
        colorFor={(datum) => colors[datum.label] ?? NEUTRAL_SEGMENT_COLOR}
        data={visibleData}
        totalLabel="applications"
      />
    </ChartCard>
  );
}

// "66 applications · 55 not set" / "11 applications · 55 not set hidden"
function describeTotal(
  data: ChartDatum[],
  unit: string,
  notSetCount: number,
  includeNotSet: boolean,
) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const notSetNote =
    notSetCount > 0
      ? ` · ${notSetCount} not set${includeNotSet ? "" : " hidden"}`
      : "";

  return `Total ${total} ${unit}${notSetNote}`;
}

export function CategoryChart({
  color,
  colorFor,
  data,
  description,
  formatValue,
  limit,
  maxValue,
  notSetFilterId,
  overflowLabel,
  showShare,
  summary,
  title,
  totalUnit,
}: {
  color?: string;
  colorFor?: (datum: ChartDatum, index: number) => string;
  data: ChartDatum[];
  description?: string;
  formatValue?: (value: number) => string;
  limit?: number;
  maxValue?: number;
  // Adds an include/exclude "Not set" toggle, remembered per chart.
  notSetFilterId?: string;
  // Plural noun for the categories, e.g. "companies".
  overflowLabel?: string;
  showShare?: boolean;
  summary?: ReactNode;
  title: string;
  // When set, the card shows the total count in this unit.
  totalUnit?: string;
}) {
  const [includeNotSet, setIncludeNotSet] = useIncludeNotSet(notSetFilterId);
  const { hasNotSet, notSetCount, visibleData } = notSetFilterId
    ? applyNotSetFilter(data, includeNotSet)
    : { hasNotSet: false, notSetCount: 0, visibleData: data };
  const categoryCount = visibleData.filter(
    (item) => !isNotSetLabel(item.label),
  ).length;
  const totalDescription = totalUnit
    ? [
        describeTotal(visibleData, totalUnit, notSetCount, includeNotSet),
        overflowLabel && categoryCount > 0
          ? `${categoryCount} ${overflowLabel}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : undefined;

  return (
    <ChartCard
      action={
        hasNotSet ? (
          <NotSetToggle includeNotSet={includeNotSet} onChange={setIncludeNotSet} />
        ) : null
      }
      description={
        [totalDescription, description].filter(Boolean).join(" · ") || undefined
      }
      table={{ columns: ["Category", "Count"], rows: visibleData }}
      title={title}
    >
      {summary}
      <HorizontalBarChart
        color={color}
        colorFor={colorFor}
        data={visibleData}
        formatValue={formatValue}
        limit={limit}
        maxValue={maxValue}
        overflowLabel={overflowLabel}
        unit={totalUnit}
        showShare={showShare}
      />
    </ChartCard>
  );
}

export function TimeChart({
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

export const STATUS_COLORS: Record<(typeof STATUS_TONE)[keyof typeof STATUS_TONE], string> = {
  awaiting: "#fbbf24",
  assessment: "#14b8a6",
  interviewing: "#3b82f6",
  offered: "#8b5cf6",
  accepted: "#10b981",
  rejected: "#ef4444",
  withdrawn: "#94a3b8",
};

// Follow-up load is ordered overdue, due today, due soon, upcoming.
const FOLLOW_UP_COLORS = ["#ef4444", "#f97316", "#fbbf24", "#0ea5e9"];

const OUTCOME_COLORS: Record<string, string> = {
  "Offers received": STATUS_COLORS.offered,
  Accepted: STATUS_COLORS.accepted,
  Rejected: STATUS_COLORS.rejected,
};

const PATH_COLORS: Record<ApplicationOutcomePath, string> = {
  accepted: STATUS_COLORS.accepted,
  offer_pending: STATUS_COLORS.offered,
  offered_rejected: "#fca5a5",
  online_assessment: STATUS_COLORS.assessment,
  assessment_rejected: "#fca5a5",
  interviewing: STATUS_COLORS.interviewing,
  interviewed_rejected: "#f87171",
  rejected_without_interview: STATUS_COLORS.rejected,
  awaiting_response: STATUS_COLORS.awaiting,
  withdrawn: STATUS_COLORS.withdrawn,
};

const PATH_BY_LABEL = new Map(
  Object.entries(APPLICATION_OUTCOME_PATH_LABELS).map(([path, label]) => [
    label,
    path as ApplicationOutcomePath,
  ]),
);

export function getStatusColor(datum: ChartDatum) {
  const tone = STATUS_TONE[datum.label as keyof typeof STATUS_TONE];
  return tone ? STATUS_COLORS[tone] : "var(--color-primary)";
}

export function getFollowUpColor(_: ChartDatum, index: number) {
  return FOLLOW_UP_COLORS[index] ?? "var(--color-primary)";
}

export function getOutcomeColor(datum: ChartDatum) {
  return OUTCOME_COLORS[datum.label] ?? "var(--color-primary)";
}

export function getPathColor(datum: ChartDatum) {
  const path = PATH_BY_LABEL.get(datum.label);
  return path ? PATH_COLORS[path] : "var(--color-primary)";
}
