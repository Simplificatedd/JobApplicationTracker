import { useState } from "react";
import {
  type ChartDatum,
  EmptyChart,
  HorizontalBarChart,
  useHasMounted,
} from "./charts";

const SIZE = 168;
const STROKE = 22;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SEGMENT_GAP = 2;
// Part-to-whole reads at a glance only with a few slices; beyond this the
// chart falls back to bars.
const MAX_SEGMENTS = 6;

export const NEUTRAL_SEGMENT_COLOR = "#94a3b8";

export function DonutChart({
  colorFor,
  data,
  totalLabel,
}: {
  colorFor: (datum: ChartDatum, index: number) => string;
  data: ChartDatum[];
  totalLabel: string;
}) {
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const hasMounted = useHasMounted();
  const segments = data.filter((item) => item.value > 0);
  const total = segments.reduce((sum, item) => sum + item.value, 0);

  if (total === 0) {
    return <EmptyChart />;
  }

  if (segments.length > MAX_SEGMENTS) {
    return <HorizontalBarChart data={data} />;
  }

  const activeSegment = segments.find((item) => item.label === activeLabel);
  let offset = 0;

  return (
    <div
      className="flex flex-col items-center gap-5 sm:flex-row sm:items-center"
      onPointerLeave={() => setActiveLabel(null)}
    >
      <div className="relative shrink-0" style={{ height: SIZE, width: SIZE }}>
        <svg
          aria-hidden="true"
          className="-rotate-90"
          height={SIZE}
          width={SIZE}
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            fill="none"
            r={RADIUS}
            stroke="#f1f5f9"
            strokeWidth={STROKE}
          />
          {segments.map((item) => {
            const length = (item.value / total) * CIRCUMFERENCE;
            const visibleLength =
              segments.length > 1 ? Math.max(0, length - SEGMENT_GAP) : length;
            const segmentOffset = offset;
            const isActive = item.label === activeLabel;
            offset += length;

            return (
              <circle
                className="cursor-pointer transition-[stroke-dasharray,opacity,stroke-width] duration-700 ease-out"
                cx={SIZE / 2}
                cy={SIZE / 2}
                fill="none"
                key={item.label}
                onPointerEnter={() => setActiveLabel(item.label)}
                opacity={activeLabel && !isActive ? 0.35 : 1}
                r={RADIUS}
                stroke={colorFor(item, data.indexOf(item))}
                strokeDasharray={`${hasMounted ? visibleLength : 0} ${CIRCUMFERENCE}`}
                strokeDashoffset={-segmentOffset}
                strokeWidth={isActive ? STROKE + 6 : STROKE}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-semibold tabular-nums text-foreground">
            {activeSegment ? activeSegment.value : total}
          </span>
          <span className="max-w-24 truncate text-xs text-muted">
            {activeSegment
              ? `${Math.round((activeSegment.value / total) * 100)}% · ${activeSegment.label}`
              : totalLabel}
          </span>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-1.5">
        {segments.map((item) => {
          const isActive = item.label === activeLabel;

          return (
            <li
              aria-label={`${item.label}: ${item.value} (${Math.round((item.value / total) * 100)}%)`}
              className={`flex items-center gap-2 rounded-md px-2 py-1 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary ${
                isActive ? "bg-slate-50" : ""
              } ${activeLabel && !isActive ? "opacity-50" : ""}`}
              key={item.label}
              onBlur={() => setActiveLabel(null)}
              onFocus={() => setActiveLabel(item.label)}
              onPointerEnter={() => setActiveLabel(item.label)}
              tabIndex={0}
            >
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: colorFor(item, data.indexOf(item)) }}
              />
              <span className="min-w-0 flex-1 truncate text-foreground">
                {item.label}
              </span>
              <span className="font-semibold tabular-nums text-foreground">
                {item.value}
              </span>
              <span className="w-10 text-right text-xs tabular-nums text-muted">
                {Math.round((item.value / total) * 100)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
