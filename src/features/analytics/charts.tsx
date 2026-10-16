import { BarChart3, Table2 } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

export interface ChartDatum {
  label: string;
  value: number;
}

export function ChartCard({
  action,
  children,
  className = "",
  description,
  table,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  description?: string;
  table?: { columns: [string, string]; rows: ChartDatum[] };
  title: string;
}) {
  const [showTable, setShowTable] = useState(false);

  return (
    <article className={`surface-panel flex min-w-0 flex-col rounded-lg p-4 ${className}`}>
      <header className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-xs text-muted">{description}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          {table ? (
            <button
              aria-label={showTable ? `Show ${title} chart` : `Show ${title} as a table`}
              aria-pressed={showTable}
              className="icon-button h-8 w-8"
              onClick={() => setShowTable((current) => !current)}
              title={showTable ? "Show chart" : "Show table"}
              type="button"
            >
              {showTable ? (
                <BarChart3 aria-hidden="true" size={15} />
              ) : (
                <Table2 aria-hidden="true" size={15} />
              )}
            </button>
          ) : null}
        </div>
      </header>
      <div className="mt-4 min-w-0 flex-1">
        {showTable && table ? <ChartTable {...table} /> : children}
      </div>
    </article>
  );
}

function ChartTable({
  columns,
  rows,
}: {
  columns: [string, string];
  rows: ChartDatum[];
}) {
  if (rows.length === 0) {
    return <EmptyChart />;
  }

  return (
    <div className="max-h-72 overflow-auto rounded-md border border-border">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-[0.08em] text-muted">
          <tr>
            <th className="px-3 py-2 font-semibold" scope="col">{columns[0]}</th>
            <th className="px-3 py-2 text-right font-semibold" scope="col">{columns[1]}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="px-3 py-2 text-foreground">{row.label}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">
                {row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyChart({ message = "No data for this chart." }: { message?: string }) {
  return (
    <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted">
      {message}
    </p>
  );
}

// Flips to true on the frame after mount so bars and lines can animate in.
export function useHasMounted() {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setHasMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return hasMounted;
}

export function HorizontalBarChart({
  barClassName,
  color = "var(--color-primary)",
  data,
  formatValue = String,
  maxValue: fixedMaxValue,
  showShare = true,
}: {
  barClassName?: (datum: ChartDatum, index: number) => string;
  color?: string;
  data: ChartDatum[];
  formatValue?: (value: number) => string;
  maxValue?: number;
  showShare?: boolean;
}) {
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const hasMounted = useHasMounted();
  const maxValue = fixedMaxValue ?? Math.max(1, ...data.map((item) => item.value));
  const total = data.reduce((sum, item) => sum + item.value, 0);

  if (data.length === 0 || (showShare && total === 0)) {
    return <EmptyChart />;
  }

  return (
    <ul className="space-y-2.5" onPointerLeave={() => setActiveLabel(null)}>
      {data.map((item, index) => {
        const isActive = activeLabel === item.label;
        const isDimmed = activeLabel !== null && !isActive;
        const share = Math.round((item.value / total) * 100);

        return (
          <li
            aria-label={`${item.label}: ${formatValue(item.value)}${showShare ? ` (${share}%)` : ""}`}
            className={`grid grid-cols-[minmax(5.5rem,8rem)_1fr_2rem] items-center gap-3 sm:grid-cols-[minmax(6.5rem,11rem)_1fr_4.5rem] rounded-md px-1 py-0.5 outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-primary ${
              isDimmed ? "opacity-45" : "opacity-100"
            }`}
            key={item.label}
            onBlur={() => setActiveLabel(null)}
            onFocus={() => setActiveLabel(item.label)}
            onPointerEnter={() => setActiveLabel(item.label)}
            tabIndex={0}
          >
            <span className="truncate text-sm text-foreground" title={item.label}>
              {item.label}
            </span>
            <span className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <span
                className={`block h-full rounded-full transition-[width] duration-700 ease-out ${
                  barClassName?.(item, index) ?? ""
                }`}
                style={{
                  backgroundColor: barClassName ? undefined : color,
                  width: hasMounted && item.value > 0
                    ? `${Math.max(2, (item.value / maxValue) * 100)}%`
                    : "0%",
                }}
              />
            </span>
            <span className="text-right text-sm tabular-nums">
              <span className="font-semibold text-foreground">
                {formatValue(item.value)}
              </span>
              {showShare ? (
                <span
                  className={`ml-1.5 hidden text-xs text-muted transition-opacity sm:inline ${
                    isActive ? "opacity-100" : "opacity-0"
                  }`}
                >
                  {share}%
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function StatTile({
  detail,
  label,
  sparkline,
  value,
}: {
  detail: string;
  label: string;
  sparkline?: number[];
  value: string;
}) {
  return (
    <div className="surface-panel flex min-w-0 items-end justify-between gap-3 rounded-lg px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-muted">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
          {value}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted">{detail}</p>
      </div>
      {sparkline && sparkline.length > 1 ? <Sparkline values={sparkline} /> : null}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const width = 88;
  const height = 32;
  const max = Math.max(1, ...values);
  const points = values
    .map(
      (value, index) =>
        `${(index / (values.length - 1)) * width},${height - 2 - (value / max) * (height - 4)}`,
    )
    .join(" ");

  return (
    <svg
      aria-hidden="true"
      className="shrink-0 overflow-visible"
      height={height}
      width={width}
    >
      <polyline
        fill="none"
        points={points}
        stroke="var(--color-primary)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </svg>
  );
}
