import { useState } from "react";
import { type ChartDatum, EmptyChart, useHasMounted } from "./charts";

const PLOT_HEIGHT = 160;

export function ColumnChart({
  colorFor,
  data,
  shortLabel = (label) => label,
}: {
  colorFor: (datum: ChartDatum, index: number, isMax: boolean) => string;
  data: ChartDatum[];
  shortLabel?: (label: string) => string;
}) {
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const hasMounted = useHasMounted();
  const maxValue = Math.max(0, ...data.map((item) => item.value));
  const total = data.reduce((sum, item) => sum + item.value, 0);
  // Many columns (for example weekly periods) only label every few columns
  // and show values on hover to avoid overlapping text.
  const isDense = data.length > 12;
  const labelEvery = isDense ? Math.ceil(data.length / 8) : 1;

  if (data.length === 0 || total === 0) {
    return <EmptyChart />;
  }

  return (
    <div
      className={`flex items-end ${isDense ? "gap-0.5" : "gap-2"}`}
      onPointerLeave={() => setActiveLabel(null)}
    >
      {data.map((item, index) => {
        const isActive = item.label === activeLabel;
        const height = maxValue > 0 ? (item.value / maxValue) * PLOT_HEIGHT : 0;
        const share = Math.round((item.value / total) * 100);

        return (
          <div
            aria-label={`${item.label}: ${item.value} (${share}%)`}
            className={`flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-md outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-primary ${
              activeLabel && !isActive ? "opacity-45" : ""
            }`}
            key={item.label}
            onBlur={() => setActiveLabel(null)}
            onFocus={() => setActiveLabel(item.label)}
            onPointerEnter={() => setActiveLabel(item.label)}
            tabIndex={0}
          >
            <div
              className="flex w-full flex-col items-center justify-end gap-1"
              style={{ height: PLOT_HEIGHT + 20 }}
            >
              <span
                className={`whitespace-nowrap text-xs font-semibold tabular-nums text-foreground ${
                  isDense && !isActive ? "invisible" : ""
                }`}
              >
                {isActive ? `${item.value} · ${share}%` : item.value}
              </span>
              <div
                className="w-full max-w-12 rounded-t transition-[height] duration-700 ease-out"
                style={{
                  backgroundColor: colorFor(item, index, item.value === maxValue),
                  height: hasMounted ? Math.max(item.value > 0 ? 3 : 0, height) : 0,
                }}
              />
            </div>
            <span
              className="w-full truncate border-t border-border pt-1.5 text-center text-xs text-muted"
              title={item.label}
            >
              {index % labelEvery === 0 ? shortLabel(item.label) : "\u00a0"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
