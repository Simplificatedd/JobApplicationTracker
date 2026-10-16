import { type LucideIcon, Repeat, Table2 } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

export interface ChartDatum {
  label: string;
  value: number;
}

export interface ChartView {
  icon: LucideIcon;
  id: string;
  label: string;
  render: () => ReactNode;
}

const VIEW_STORAGE_PREFIX = "jat.analytics.view.";

function readStoredView(storageKey: string | undefined) {
  if (!storageKey) {
    return null;
  }

  try {
    return window.localStorage.getItem(`${VIEW_STORAGE_PREFIX}${storageKey}`);
  } catch {
    return null;
  }
}

function writeStoredView(storageKey: string | undefined, viewId: string) {
  if (!storageKey) {
    return;
  }

  try {
    window.localStorage.setItem(`${VIEW_STORAGE_PREFIX}${storageKey}`, viewId);
  } catch {
    // Storage can be unavailable; the view still switches for this visit.
  }
}

export function ChartCard({
  action,
  children,
  className = "",
  description,
  title,
  viewStorageKey,
  views,
}: {
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  description?: string;
  title: string;
  // Remembers the chosen view per chart in this browser only.
  viewStorageKey?: string;
  // Alternative ways to draw the same data; the header button cycles them.
  views?: ChartView[];
}) {
  const [selectedViewId, setSelectedViewId] = useState(() =>
    readStoredView(viewStorageKey),
  );
  const viewIndex = Math.max(
    0,
    views?.findIndex((view) => view.id === selectedViewId) ?? 0,
  );
  const currentView = views?.[viewIndex];
  const nextView = views?.[(viewIndex + 1) % (views?.length ?? 1)];

  function cycleView() {
    if (!views || !nextView) {
      return;
    }

    setSelectedViewId(nextView.id);
    writeStoredView(viewStorageKey, nextView.id);
  }

  const CurrentIcon = currentView?.icon;

  return (
    <article className={`surface-panel flex min-w-0 flex-col rounded-lg p-4 ${className}`}>
      <header className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-xs text-muted">{description}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {action}
          {views && views.length > 1 && currentView && nextView && CurrentIcon ? (
            <button
              aria-label={`${title}: showing ${currentView.label}. Switch to ${nextView.label}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface pl-2 pr-2.5 text-xs font-medium text-foreground transition hover:border-primary/40 hover:bg-blue-50"
              onClick={cycleView}
              title={`Switch to ${nextView.label}`}
              type="button"
            >
              <CurrentIcon aria-hidden="true" className="text-primary" size={14} />
              {currentView.label}
              <span className="tabular-nums text-muted">
                {viewIndex + 1}/{views.length}
              </span>
              <Repeat aria-hidden="true" className="text-muted" size={12} />
            </button>
          ) : null}
        </div>
      </header>
      <div className="mt-4 min-w-0 flex-1" key={currentView?.id}>
        {currentView ? currentView.render() : children}
      </div>
    </article>
  );
}

export function tableView(
  columns: [string, string],
  rows: ChartDatum[],
  formatValue: (value: number) => string = String,
): ChartView {
  return {
    icon: Table2,
    id: "table",
    label: "Table",
    render: () => <ChartTable columns={columns} formatValue={formatValue} rows={rows} />,
  };
}

function ChartTable({
  columns,
  formatValue,
  rows,
}: {
  columns: [string, string];
  formatValue: (value: number) => string;
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
                {formatValue(row.value)}
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
  color = "var(--color-primary)",
  colorFor,
  data,
  formatValue = String,
  limit,
  maxValue: fixedMaxValue,
  overflowLabel = "more",
  showShare = true,
  unit,
  variant = "bars",
}: {
  color?: string;
  colorFor?: (datum: ChartDatum, index: number) => string;
  data: ChartDatum[];
  formatValue?: (value: number) => string;
  // Shows only the first `limit` rows with a "Show all" toggle for the rest,
  // instead of folding the tail into a misleading "Other" bar.
  limit?: number;
  maxValue?: number;
  // Plural noun for hidden rows, e.g. "companies".
  overflowLabel?: string;
  showShare?: boolean;
  // Unit for counts in the overflow summary, e.g. "applications".
  unit?: string;
  // "lollipop" draws a thin stem with a dot instead of a filled bar.
  variant?: "bars" | "lollipop";
}) {
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const hasMounted = useHasMounted();
  const isLimited = limit !== undefined && data.length > limit;
  const visibleData = isLimited && !isExpanded ? data.slice(0, limit) : data;
  const hiddenData = isLimited ? data.slice(limit) : [];
  const hiddenTotal = hiddenData.reduce((sum, item) => sum + item.value, 0);
  const maxValue = fixedMaxValue ?? Math.max(1, ...data.map((item) => item.value));
  const total = data.reduce((sum, item) => sum + item.value, 0);

  if (data.length === 0 || (showShare && total === 0)) {
    return <EmptyChart />;
  }

  return (
    <div>
      <ul
        className={`space-y-2.5 ${isExpanded ? "max-h-[22rem] overflow-y-auto pr-1" : ""}`}
        onPointerLeave={() => setActiveLabel(null)}
      >
        {visibleData.map((item, index) => {
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
              {variant === "lollipop" ? (
                <span className="relative h-3">
                  <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-slate-200" />
                  <span
                    className="absolute left-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full transition-[width] duration-700 ease-out"
                    style={{
                      backgroundColor: colorFor?.(item, index) ?? color,
                      width: hasMounted ? `${(item.value / maxValue) * 100}%` : "0%",
                    }}
                  />
                  <span
                    className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface transition-[left,width,height] duration-700 ease-out ${
                      isActive ? "h-3.5 w-3.5" : "h-2.5 w-2.5"
                    }`}
                    style={{
                      backgroundColor: colorFor?.(item, index) ?? color,
                      left: hasMounted ? `${(item.value / maxValue) * 100}%` : "0%",
                    }}
                  />
                </span>
              ) : (
                <span className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <span
                    className="block h-full rounded-full transition-[width] duration-700 ease-out"
                    style={{
                      backgroundColor: colorFor?.(item, index) ?? color,
                      width: hasMounted && item.value > 0
                        ? `${Math.max(2, (item.value / maxValue) * 100)}%`
                        : "0%",
                    }}
                  />
                </span>
              )}
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
      {isLimited ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5 text-xs text-muted">
          <span>
            {isExpanded
              ? `Showing all ${data.length} ${overflowLabel}`
              : `+${formatValue(hiddenTotal)}${unit ? ` ${unit}` : ""} across ${hiddenData.length} more ${overflowLabel}`}
          </span>
          <button
            aria-expanded={isExpanded}
            className="rounded-md px-2 py-1 font-semibold text-primary hover:bg-blue-50"
            onClick={() => setIsExpanded((current) => !current)}
            type="button"
          >
            {isExpanded ? `Show top ${limit}` : `Show all ${data.length}`}
          </button>
        </div>
      ) : null}
    </div>
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

// A single 100% bar showing how a whole splits across categories.
export function StackedShareBar({
  colorFor,
  data,
}: {
  colorFor: (datum: ChartDatum) => string;
  data: ChartDatum[];
}) {
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const hasMounted = useHasMounted();
  const segments = data.filter((item) => item.value > 0);
  const total = segments.reduce((sum, item) => sum + item.value, 0);

  if (total === 0) {
    return null;
  }

  const active = segments.find((item) => item.label === activeLabel);

  return (
    <div className="mb-4">
      <div
        className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full"
        onPointerLeave={() => setActiveLabel(null)}
      >
        {segments.map((item) => (
          <span
            aria-label={`${item.label}: ${item.value}`}
            className={`h-full transition-[flex-grow,opacity] duration-700 ease-out first:rounded-l-full last:rounded-r-full ${
              activeLabel && activeLabel !== item.label ? "opacity-40" : ""
            }`}
            key={item.label}
            onPointerEnter={() => setActiveLabel(item.label)}
            role="img"
            style={{
              backgroundColor: colorFor(item),
              flexBasis: 0,
              flexGrow: hasMounted ? item.value : 0,
              minWidth: 3,
            }}
          />
        ))}
      </div>
      <p className="mt-1.5 h-4 text-xs text-muted">
        {active
          ? `${active.label}: ${active.value} of ${total} (${Math.round((active.value / total) * 100)}%)`
          : `${total} applications · hover the strip for a breakdown`}
      </p>
    </div>
  );
}
