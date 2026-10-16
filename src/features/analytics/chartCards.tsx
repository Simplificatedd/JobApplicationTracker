import {
  ChartArea,
  ChartBar,
  ChartColumn,
  ChartColumnStacked,
  ChartLine,
  ChartPie,
  CircleDot,
  Donut,
  LayoutDashboard,
  LayoutGrid,
  Radar,
  Workflow,
} from "lucide-react";
import type { ReactNode } from "react";
import { APPLICATION_STATUSES, STATUS_TONE } from "../../lib/constants";
import {
  APPLICATION_OUTCOME_PATH_LABELS,
  type ApplicationOutcomePath,
} from "../../lib/statusHistory";
import type { AnalyticsSettings } from "../../types/analytics";
import {
  ChartCard,
  type ChartDatum,
  type ChartView,
  HorizontalBarChart,
  tableView,
} from "./charts";
import {
  FlowChart,
  type FlowLink,
  RadarChart,
  RadialBarChart,
  StackedColumnChart,
  TreemapChart,
  WaffleChart,
} from "./chartViews";
import { ColumnChart } from "./ColumnChart";
import { DonutChart, NEUTRAL_SEGMENT_COLOR } from "./DonutChart";
import { type ChartSeries, MultiSeriesChart } from "./MultiSeriesChart";
import {
  applyNotSetFilter,
  isNotSetLabel,
  NotSetToggle,
  useIncludeNotSet,
} from "./notSetFilter";
import { fillPeriods, formatPeriod, TimeSeriesChart } from "./TimeSeriesChart";

type TimeGrouping = AnalyticsSettings["defaultTimeGrouping"];
type ColorFor = (datum: ChartDatum, index: number) => string;

/* ------------------------------------------------------------------ */
/* Colours                                                             */
/* ------------------------------------------------------------------ */

const CATEGORICAL_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
];
// Categories past the eighth palette slot share one muted tone rather than
// generating hues that are hard to tell apart.
const OVERFLOW_CATEGORY_COLOR = "#cbd5e1";

// Assigns palette slots in the order categories appear in `data` (already
// sorted by size), skipping "Not set", which is always neutral grey.
export function createCategoryColors(data: ChartDatum[]): ColorFor {
  const slots = new Map<string, string>();

  data
    .filter((item) => !isNotSetLabel(item.label))
    .forEach((item, index) => {
      slots.set(item.label, CATEGORICAL_COLORS[index] ?? OVERFLOW_CATEGORY_COLOR);
    });

  return (datum) =>
    isNotSetLabel(datum.label)
      ? NEUTRAL_SEGMENT_COLOR
      : (slots.get(datum.label) ?? OVERFLOW_CATEGORY_COLOR);
}

// Rate rows are labelled "Source (count)"; colour them by the source name so
// they match the applications-by-source chart.
export function bySourceName(colorFor: ColorFor): ColorFor {
  return (datum, index) =>
    colorFor({ ...datum, label: datum.label.replace(/ \(\d+\)$/, "") }, index);
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

// Ordered response-time buckets use the validated light-to-dark blue ramp.
const RESPONSE_TIME_COLORS = [
  "var(--chart-ramp-1)",
  "var(--chart-ramp-2)",
  "var(--chart-ramp-3)",
  "var(--chart-ramp-4)",
  "var(--chart-ramp-5)",
];

export function getResponseTimeColor(_: ChartDatum, index: number) {
  return RESPONSE_TIME_COLORS[index] ?? "var(--chart-ramp-5)";
}

export const RESPONSE_TIME_SHORT_LABELS: Record<string, string> = {
  "Within 1 week": "≤ 1 wk",
  "1–2 weeks": "1–2 wk",
  "2–4 weeks": "2–4 wk",
  "1–2 months": "1–2 mo",
  "Over 2 months": "2+ mo",
};

export const WORK_MODE_COLORS: Record<string, string> = {
  Remote: "var(--chart-1)",
  Hybrid: "var(--chart-2)",
  Onsite: "var(--chart-3)",
};

export const JOB_TYPE_COLORS: Record<string, string> = {
  Internship: "var(--chart-1)",
  "Part Time": "var(--chart-2)",
  "Full Time": "var(--chart-3)",
  Contract: "var(--chart-4)",
  Other: "var(--chart-5)",
};

export function fromColorMap(colors: Record<string, string>): ColorFor {
  return (datum) => colors[datum.label] ?? NEUTRAL_SEGMENT_COLOR;
}

const WEEKDAY_MUTED_COLOR = "#b7d3f6";

/* ------------------------------------------------------------------ */
/* Category charts                                                     */
/* ------------------------------------------------------------------ */

export type CategoryViewId =
  | "bars"
  | "lollipop"
  | "columns"
  | "donut"
  | "waffle"
  | "treemap"
  | "radial"
  | "radar"
  | "table";

const CATEGORY_VIEW_META: Record<CategoryViewId, Pick<ChartView, "icon" | "label">> = {
  bars: { icon: ChartBar, label: "Bars" },
  lollipop: { icon: CircleDot, label: "Lollipop" },
  columns: { icon: ChartColumn, label: "Columns" },
  donut: { icon: Donut, label: "Donut" },
  waffle: { icon: LayoutGrid, label: "Waffle" },
  treemap: { icon: LayoutDashboard, label: "Treemap" },
  radial: { icon: ChartPie, label: "Radial" },
  radar: { icon: Radar, label: "Radar" },
  table: { icon: ChartBar, label: "Table" },
};

// "Total 66 applications · 55 not set" / "Total 11 applications · 55 not set hidden"
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
  chartId,
  colorFor,
  data,
  description,
  emphasizeMax = false,
  formatValue = String,
  limit,
  maxValue,
  notSetFilterId,
  overflowLabel,
  shortLabel,
  showShare,
  summary,
  title,
  totalUnit,
  views,
}: {
  chartId: string;
  // Defaults to the categorical palette assigned by size order.
  colorFor?: ColorFor;
  data: ChartDatum[];
  description?: string;
  // Column view highlights the largest value and mutes the rest.
  emphasizeMax?: boolean;
  formatValue?: (value: number) => string;
  limit?: number;
  maxValue?: number;
  // Adds an include/exclude "Not set" toggle, remembered per chart.
  notSetFilterId?: string;
  // Plural noun for the categories, e.g. "companies".
  overflowLabel?: string;
  shortLabel?: (label: string) => string;
  showShare?: boolean;
  // Extra content shown above the bars view, e.g. a stacked strip.
  summary?: (data: ChartDatum[]) => ReactNode;
  title: string;
  // When set, the card shows the total count in this unit.
  totalUnit?: string;
  // Views offered by the header button, in cycling order.
  views: CategoryViewId[];
}) {
  const [includeNotSet, setIncludeNotSet] = useIncludeNotSet(notSetFilterId);
  const { hasNotSet, notSetCount, visibleData } = notSetFilterId
    ? applyNotSetFilter(data, includeNotSet)
    : { hasNotSet: false, notSetCount: 0, visibleData: data };
  const resolveColor = colorFor ?? createCategoryColors(data);
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
  const topData = limit ? visibleData.slice(0, limit) : visibleData;

  function renderView(viewId: CategoryViewId) {
    switch (viewId) {
      case "bars":
      case "lollipop":
        return (
          <>
            {viewId === "bars" ? summary?.(visibleData) : null}
            <HorizontalBarChart
              colorFor={resolveColor}
              data={visibleData}
              formatValue={formatValue}
              limit={limit}
              maxValue={maxValue}
              overflowLabel={overflowLabel}
              showShare={showShare}
              unit={totalUnit}
              variant={viewId}
            />
          </>
        );
      case "columns":
        return (
          <ColumnChart
            colorFor={(datum, index, isMax) =>
              emphasizeMax
                ? isMax
                  ? resolveColor(datum, index)
                  : WEEKDAY_MUTED_COLOR
                : resolveColor(datum, index)
            }
            data={topData}
            shortLabel={shortLabel}
          />
        );
      case "donut":
        return (
          <DonutChart
            colorFor={resolveColor}
            data={visibleData}
            totalLabel={totalUnit ?? "total"}
          />
        );
      case "waffle":
        return <WaffleChart colorFor={resolveColor} data={topData} />;
      case "treemap":
        return <TreemapChart colorFor={resolveColor} data={visibleData} />;
      case "radial":
        return (
          <RadialBarChart
            colorFor={resolveColor}
            data={visibleData}
            formatValue={formatValue}
            maxValue={maxValue}
          />
        );
      case "radar":
        return (
          <RadarChart
            color={resolveColor(visibleData[0] ?? { label: "", value: 0 }, 0)}
            data={visibleData}
            shortLabel={shortLabel}
          />
        );
      case "table":
        return null;
    }
  }

  const chartViews = views.map((viewId) =>
    viewId === "table"
      ? tableView(["Category", totalUnit ? "Count" : "Value"], visibleData, formatValue)
      : {
          ...CATEGORY_VIEW_META[viewId],
          id: viewId,
          render: () => renderView(viewId),
        },
  );

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
      title={title}
      viewStorageKey={chartId}
      views={chartViews}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Time charts                                                         */
/* ------------------------------------------------------------------ */

export function TimeChart({
  chartId,
  color,
  data,
  description,
  grouping,
  title,
}: {
  chartId: string;
  color: string;
  data: ChartDatum[];
  description?: string;
  grouping: TimeGrouping;
  title: string;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const periods = fillPeriods(data, grouping);

  return (
    <ChartCard
      description={description ?? `${total} total`}
      title={title}
      viewStorageKey={chartId}
      views={[
        {
          icon: ChartArea,
          id: "area",
          label: "Area",
          render: () => (
            <TimeSeriesChart color={color} data={data} grouping={grouping} seriesLabel={title} />
          ),
        },
        {
          icon: ChartLine,
          id: "line",
          label: "Line",
          render: () => (
            <TimeSeriesChart
              color={color}
              data={data}
              grouping={grouping}
              seriesLabel={title}
              variant="line"
            />
          ),
        },
        {
          icon: ChartColumn,
          id: "columns",
          label: "Columns",
          render: () => (
            <ColumnChart
              colorFor={() => color}
              data={periods}
              shortLabel={(label) => formatPeriod(label, grouping, true)}
            />
          ),
        },
        tableView(
          ["Period", "Count"],
          data.map((item) => ({
            label: formatPeriod(item.label, grouping, false),
            value: item.value,
          })),
        ),
      ]}
    />
  );
}

export function ActivityComparisonCard({
  grouping,
  series,
}: {
  grouping: TimeGrouping;
  series: ChartSeries[];
}) {
  const labels = [
    ...new Set(series.flatMap((item) => item.data.map((point) => point.label))),
  ].sort((left, right) => left.localeCompare(right));
  const periods = fillPeriods(
    labels.map((label) => ({ label, value: 0 })),
    grouping,
  ).map((point) => point.label);

  return (
    <ChartCard
      className="xl:col-span-2"
      description="Applications, interviews and assessments on one timeline"
      title="Activity comparison"
      viewStorageKey="activityComparison"
      views={[
        {
          icon: ChartLine,
          id: "lines",
          label: "Lines",
          render: () => <MultiSeriesChart grouping={grouping} series={series} />,
        },
        {
          icon: ChartColumnStacked,
          id: "stacked",
          label: "Stacked",
          render: () => (
            <StackedColumnChart
              formatLabel={(label, short) => formatPeriod(label, grouping, short)}
              labels={periods}
              series={series.map((item) => {
                const counts = new Map(item.data.map((point) => [point.label, point.value]));
                return {
                  color: item.color,
                  id: item.id,
                  label: item.label,
                  values: periods.map((label) => counts.get(label) ?? 0),
                };
              })}
            />
          ),
        },
        tableView(
          ["Series", "Total"],
          series.map((item) => ({
            label: item.label,
            value: item.data.reduce((sum, point) => sum + point.value, 0),
          })),
        ),
      ]}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Status flow                                                         */
/* ------------------------------------------------------------------ */

export function StatusFlowCard({ links }: { links: FlowLink[] }) {
  const pairs = links.map((link) => ({
    label: `${link.from} → ${link.to}`,
    value: link.value,
  }));
  const total = links.reduce((sum, link) => sum + link.value, 0);
  const colorForStatus = (label: string) => getStatusColor({ label, value: 0 });

  return (
    <ChartCard
      className="xl:col-span-2"
      description={`${total} recorded status ${total === 1 ? "change" : "changes"}`}
      title="Status flow"
      viewStorageKey="statusFlow"
      views={[
        {
          icon: Workflow,
          id: "flow",
          label: "Flow",
          render: () => (
            <FlowChart colorFor={colorForStatus} links={links} order={APPLICATION_STATUSES} />
          ),
        },
        {
          icon: ChartBar,
          id: "bars",
          label: "Bars",
          render: () => (
            <HorizontalBarChart
              colorFor={(datum) => colorForStatus(datum.label.split(" → ")[1] ?? "")}
              data={pairs}
              limit={10}
              overflowLabel="transitions"
              unit="changes"
            />
          ),
        },
        tableView(["Change", "Count"], pairs),
      ]}
    />
  );
}
