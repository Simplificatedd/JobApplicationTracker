import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { AnalyticsSettings } from "../../types/analytics";
import { type ChartDatum, EmptyChart, useHasMounted } from "./charts";

type TimeGrouping = AnalyticsSettings["defaultTimeGrouping"];

const CHART_HEIGHT = 220;
const PADDING = { top: 16, right: 16, bottom: 28, left: 36 };
const MAX_FILLED_PERIODS = 400;

export function TimeSeriesChart({
  color = "var(--color-primary)",
  data,
  grouping,
  seriesLabel,
}: {
  color?: string;
  data: ChartDatum[];
  grouping: TimeGrouping;
  seriesLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const hasMounted = useHasMounted();
  const gradientId = useId();
  const points = fillPeriods(data, grouping);

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

  if (points.length === 0) {
    return <EmptyChart />;
  }

  const plotWidth = Math.max(1, width - PADDING.left - PADDING.right);
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const yMax = getNiceMax(Math.max(...points.map((point) => point.value)));
  const xFor = (index: number) =>
    PADDING.left +
    (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const yFor = (value: number) =>
    PADDING.top + plotHeight - (value / yMax) * plotHeight;
  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${xFor(index)},${yFor(point.value)}`)
    .join(" ");
  const areaPath = `${linePath} L${xFor(points.length - 1)},${yFor(0)} L${xFor(0)},${yFor(0)} Z`;
  const yTicks = [0, yMax / 2, yMax];
  const xLabelIndexes = getXLabelIndexes(points.length, plotWidth);
  const showMarkers = points.length <= 40;
  const activePoint = activeIndex === null ? null : points[activeIndex];
  const total = data.reduce((sum, item) => sum + item.value, 0);

  function updateActiveFromPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left - PADDING.left;
    const ratio = points.length === 1 ? 0 : x / plotWidth;
    setActiveIndex(
      Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1)))),
    );
  }

  function moveActiveWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    const step = event.key === "ArrowLeft" ? -1 : 1;
    setActiveIndex((current) =>
      Math.min(points.length - 1, Math.max(0, (current ?? points.length - 1) + step)),
    );
  }

  return (
    <div
      aria-label={`${seriesLabel}: ${total} total across ${points.length} periods. Use arrow keys to step through periods.`}
      className="relative rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary"
      onBlur={() => setActiveIndex(null)}
      onFocus={() => setActiveIndex((current) => current ?? points.length - 1)}
      onKeyDown={moveActiveWithKeyboard}
      onPointerLeave={() => setActiveIndex(null)}
      onPointerMove={updateActiveFromPointer}
      ref={containerRef}
      role="group"
      tabIndex={0}
    >
      {width > 0 ? (
        <svg
          aria-hidden="true"
          className="block overflow-visible"
          height={CHART_HEIGHT}
          width={width}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                stroke="var(--color-border)"
                strokeDasharray={tick === 0 ? undefined : "3 4"}
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
              key={points[index].label}
              textAnchor={
                points.length === 1
                  ? "middle"
                  : index === 0
                    ? "start"
                    : index === points.length - 1
                      ? "end"
                      : "middle"
              }
              x={xFor(index)}
              y={CHART_HEIGHT - 8}
            >
              {formatPeriod(points[index].label, grouping, true)}
            </text>
          ))}
          <path
            className="transition-opacity duration-700"
            d={areaPath}
            fill={`url(#${gradientId})`}
            opacity={hasMounted ? 1 : 0}
          />
          <path
            d={linePath}
            fill="none"
            pathLength={1}
            stroke={color}
            strokeDasharray="1"
            strokeDashoffset={hasMounted ? 0 : 1}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            style={{ transition: "stroke-dashoffset 900ms ease-out" }}
          />
          {showMarkers
            ? points.map((point, index) =>
                point.value > 0 ? (
                  <circle
                    cx={xFor(index)}
                    cy={yFor(point.value)}
                    fill={color}
                    key={point.label}
                    r={2.5}
                  />
                ) : null,
              )
            : null}
          {activePoint && activeIndex !== null ? (
            <g>
              <line
                stroke="var(--color-muted)"
                strokeOpacity={0.5}
                x1={xFor(activeIndex)}
                x2={xFor(activeIndex)}
                y1={PADDING.top}
                y2={yFor(0)}
              />
              <circle
                cx={xFor(activeIndex)}
                cy={yFor(activePoint.value)}
                fill={color}
                r={5}
                stroke="var(--color-surface)"
                strokeWidth={2}
              />
            </g>
          ) : null}
        </svg>
      ) : (
        <div style={{ height: CHART_HEIGHT }} />
      )}
      {activePoint && activeIndex !== null ? (
        <div
          className={`pointer-events-none absolute z-10 min-w-32 whitespace-nowrap rounded-md border border-border bg-surface px-3 py-2 shadow-popover ${
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
          <p className="text-lg font-semibold tabular-nums leading-6 text-foreground">
            {activePoint.value}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <span
              aria-hidden="true"
              className="h-0.5 w-3 rounded-full"
              style={{ backgroundColor: color }}
            />
            {seriesLabel}
          </p>
          <p className="mt-1 text-xs font-medium text-foreground">
            {formatPeriod(activePoint.label, grouping, false)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

// Fills empty periods between the first and last data point with zero so the
// time axis is evenly spaced. Original keys are always kept.
export function fillPeriods(data: ChartDatum[], grouping: TimeGrouping) {
  if (data.length < 2) {
    return data;
  }

  const counts = new Map(data.map((item) => [item.label, item.value]));
  const first = parsePeriodKey(data[0].label, grouping);
  const last = parsePeriodKey(data[data.length - 1].label, grouping);

  if (!first || !last) {
    return data;
  }

  const keys = new Set(data.map((item) => item.label));
  const cursor = new Date(first);

  while (cursor <= last && keys.size <= MAX_FILLED_PERIODS) {
    keys.add(toPeriodKey(cursor, grouping));
    stepPeriod(cursor, grouping);
  }

  if (keys.size > MAX_FILLED_PERIODS) {
    return data;
  }

  return [...keys]
    .sort((left, right) => left.localeCompare(right))
    .map((label) => ({ label, value: counts.get(label) ?? 0 }));
}

function parsePeriodKey(key: string, grouping: TimeGrouping) {
  const datePart =
    grouping === "monthly" ? `${key.slice(0, 7)}-01` : key.slice(0, 10);
  const date = new Date(`${datePart}T00:00:00.000Z`);

  return Number.isNaN(date.getTime()) ? null : date;
}

function toPeriodKey(date: Date, grouping: TimeGrouping) {
  const iso = date.toISOString();

  if (grouping === "monthly") {
    return iso.slice(0, 7);
  }

  return grouping === "weekly" ? `${iso.slice(0, 10)} week` : iso.slice(0, 10);
}

function stepPeriod(date: Date, grouping: TimeGrouping) {
  if (grouping === "monthly") {
    date.setUTCMonth(date.getUTCMonth() + 1);
  } else {
    date.setUTCDate(date.getUTCDate() + (grouping === "weekly" ? 7 : 1));
  }
}

export function formatPeriod(key: string, grouping: TimeGrouping, short: boolean) {
  const date = parsePeriodKey(key, grouping);

  if (!date) {
    return key;
  }

  if (grouping === "monthly") {
    return date.toLocaleDateString(undefined, {
      month: "short",
      timeZone: "UTC",
      year: short ? "2-digit" : "numeric",
    });
  }

  const dayLabel = date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    ...(short ? {} : { year: "numeric" }),
  });

  return grouping === "weekly" && !short ? `Week of ${dayLabel}` : dayLabel;
}

function getNiceMax(value: number) {
  if (value <= 4) {
    return 4;
  }

  const magnitude = 10 ** Math.floor(Math.log10(value));
  const nice = [1, 2, 4, 6, 8, 10].find((step) => step * magnitude >= value) ?? 10;

  return nice * magnitude;
}

function formatTick(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function getXLabelIndexes(count: number, plotWidth: number) {
  if (count <= 1) {
    return count === 1 ? [0] : [];
  }

  const maxLabels = Math.max(2, Math.floor(plotWidth / 72));
  const step = Math.max(1, Math.ceil((count - 1) / (maxLabels - 1)));
  const indexes = [];

  for (let index = 0; index < count; index += step) {
    indexes.push(index);
  }

  const lastIndex = indexes[indexes.length - 1];
  const pixelsPerIndex = plotWidth / (count - 1);

  if (lastIndex !== count - 1) {
    // Keep the final period labelled without crowding the previous label.
    if ((count - 1 - lastIndex) * pixelsPerIndex < 64 && indexes.length > 1) {
      indexes[indexes.length - 1] = count - 1;
    } else {
      indexes.push(count - 1);
    }
  }

  return indexes;
}
