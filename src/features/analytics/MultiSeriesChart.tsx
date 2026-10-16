import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type { AnalyticsSettings } from "../../types/analytics";
import { type ChartDatum, EmptyChart, useHasMounted } from "./charts";
import {
  fillPeriods,
  formatPeriod,
  formatTick,
  getNiceMax,
  getXLabelIndexes,
} from "./TimeSeriesChart";

type TimeGrouping = AnalyticsSettings["defaultTimeGrouping"];

export interface ChartSeries {
  color: string;
  data: ChartDatum[];
  id: string;
  label: string;
}

const CHART_HEIGHT = 260;
const PADDING = { top: 16, right: 16, bottom: 28, left: 36 };

export function MultiSeriesChart({
  grouping,
  series,
}: {
  grouping: TimeGrouping;
  series: ChartSeries[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const hasMounted = useHasMounted();
  const labels = getSharedPeriods(series, grouping);
  const visibleSeries = series.filter((item) => !hiddenSeries.has(item.id));
  const valuesBySeries = new Map(
    series.map((item) => {
      const counts = new Map(item.data.map((point) => [point.label, point.value]));
      return [item.id, labels.map((label) => counts.get(label) ?? 0)];
    }),
  );

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const element = container;
    const resizeObserver = new ResizeObserver(() =>
      setWidth(element.clientWidth),
    );
    setWidth(element.clientWidth);
    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, []);

  function toggleSeries(id: string) {
    setHiddenSeries((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else if (series.length - next.size > 1) {
        // Keep at least one series visible.
        next.add(id);
      }

      return next;
    });
  }

  const legend = (
    <div className="mb-3 flex flex-wrap gap-2">
      {series.map((item) => {
        const isHidden = hiddenSeries.has(item.id);
        const total = item.data.reduce((sum, point) => sum + point.value, 0);

        return (
          <button
            aria-pressed={!isHidden}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition ${
              isHidden
                ? "border-border text-muted line-through"
                : "border-border bg-surface text-foreground hover:bg-slate-50"
            }`}
            key={item.id}
            onClick={() => toggleSeries(item.id)}
            type="button"
          >
            <span
              aria-hidden="true"
              className="h-0.5 w-4 rounded-full"
              style={{ backgroundColor: isHidden ? "var(--color-border)" : item.color }}
            />
            {item.label}
            <span className="tabular-nums text-muted">{total}</span>
          </button>
        );
      })}
    </div>
  );

  if (labels.length === 0) {
    return (
      <>
        {legend}
        <EmptyChart />
      </>
    );
  }

  const plotWidth = Math.max(1, width - PADDING.left - PADDING.right);
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const yMax = getNiceMax(
    Math.max(
      0,
      ...visibleSeries.flatMap((item) => valuesBySeries.get(item.id) ?? []),
    ),
  );
  const xFor = (index: number) =>
    PADDING.left +
    (labels.length === 1 ? plotWidth / 2 : (index / (labels.length - 1)) * plotWidth);
  const yFor = (value: number) =>
    PADDING.top + plotHeight - (value / yMax) * plotHeight;
  const xLabelIndexes = getXLabelIndexes(labels.length, plotWidth);

  function updateActiveFromPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio =
      labels.length === 1
        ? 0
        : (event.clientX - bounds.left - PADDING.left) / plotWidth;
    setActiveIndex(
      Math.min(labels.length - 1, Math.max(0, Math.round(ratio * (labels.length - 1)))),
    );
  }

  function moveActiveWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    const step = event.key === "ArrowLeft" ? -1 : 1;
    setActiveIndex((current) =>
      Math.min(labels.length - 1, Math.max(0, (current ?? labels.length - 1) + step)),
    );
  }

  return (
    <>
      {legend}
      <div
        aria-label={`Activity comparison across ${labels.length} periods. Use arrow keys to step through periods.`}
        className="relative rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onBlur={() => setActiveIndex(null)}
        onFocus={() => setActiveIndex((current) => current ?? labels.length - 1)}
        onKeyDown={moveActiveWithKeyboard}
        onPointerLeave={() => setActiveIndex(null)}
        onPointerMove={updateActiveFromPointer}
        ref={containerRef}
        role="group"
        tabIndex={0}
      >
        {width > 0 ? (
          <svg aria-hidden="true" className="block overflow-visible" height={CHART_HEIGHT} width={width}>
            {[0, yMax / 2, yMax].map((tick) => (
              <g key={tick}>
                <line
                  stroke="var(--color-border)"
                  strokeOpacity={tick === 0 ? 1 : 0.6}
                  x1={PADDING.left}
                  x2={PADDING.left + plotWidth}
                  y1={yFor(tick)}
                  y2={yFor(tick)}
                />
                <text
                  className="fill-muted text-[11px] tabular-nums"
                  dominantBaseline="middle"
                  textAnchor="end"
                  x={PADDING.left - 8}
                  y={yFor(tick)}
                >
                  {formatTick(tick)}
                </text>
              </g>
            ))}
            {xLabelIndexes.map((index) => (
              <text
                className="fill-muted text-[11px]"
                key={labels[index]}
                textAnchor={
                  labels.length === 1
                    ? "middle"
                    : index === 0
                      ? "start"
                      : index === labels.length - 1
                        ? "end"
                        : "middle"
                }
                x={xFor(index)}
                y={CHART_HEIGHT - 8}
              >
                {formatPeriod(labels[index], grouping, true)}
              </text>
            ))}
            {visibleSeries.map((item) => {
              const values = valuesBySeries.get(item.id) ?? [];
              const path = values
                .map((value, index) => `${index === 0 ? "M" : "L"}${xFor(index)},${yFor(value)}`)
                .join(" ");

              return (
                <path
                  d={path}
                  fill="none"
                  key={item.id}
                  pathLength={1}
                  stroke={item.color}
                  strokeDasharray="1"
                  strokeDashoffset={hasMounted ? 0 : 1}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  style={{ transition: "stroke-dashoffset 900ms ease-out" }}
                />
              );
            })}
            {activeIndex !== null ? (
              <g>
                <line
                  stroke="var(--color-muted)"
                  strokeOpacity={0.5}
                  x1={xFor(activeIndex)}
                  x2={xFor(activeIndex)}
                  y1={PADDING.top}
                  y2={yFor(0)}
                />
                {visibleSeries.map((item) => (
                  <circle
                    cx={xFor(activeIndex)}
                    cy={yFor(valuesBySeries.get(item.id)?.[activeIndex] ?? 0)}
                    fill={item.color}
                    key={item.id}
                    r={4.5}
                    stroke="var(--color-surface)"
                    strokeWidth={2}
                  />
                ))}
              </g>
            ) : null}
          </svg>
        ) : (
          <div style={{ height: CHART_HEIGHT }} />
        )}
        {activeIndex !== null ? (
          <div
            className={`pointer-events-none absolute z-10 min-w-40 whitespace-nowrap rounded-md border border-border bg-surface px-3 py-2 shadow-popover ${
              xFor(activeIndex) > width / 2 ? "-translate-x-full" : ""
            }`}
            style={{
              left:
                xFor(activeIndex) > width / 2
                  ? xFor(activeIndex) - 12
                  : xFor(activeIndex) + 12,
              top: PADDING.top,
            }}
          >
            <p className="mb-1 text-xs font-medium text-foreground">
              {formatPeriod(labels[activeIndex], grouping, false)}
            </p>
            {visibleSeries.map((item) => (
              <p className="flex items-center gap-2 text-xs" key={item.id}>
                <span
                  aria-hidden="true"
                  className="h-0.5 w-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="font-semibold tabular-nums text-foreground">
                  {valuesBySeries.get(item.id)?.[activeIndex] ?? 0}
                </span>
                <span className="text-muted">{item.label}</span>
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}

// Union of every series' periods, with empty periods filled so all series
// share one evenly spaced axis.
function getSharedPeriods(series: ChartSeries[], grouping: TimeGrouping) {
  const labels = [
    ...new Set(series.flatMap((item) => item.data.map((point) => point.label))),
  ].sort((left, right) => left.localeCompare(right));

  return fillPeriods(
    labels.map((label) => ({ label, value: 0 })),
    grouping,
  ).map((point) => point.label);
}
