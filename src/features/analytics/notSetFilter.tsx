import { useState } from "react";
import type { ChartDatum } from "./charts";

export const NOT_SET_LABEL = "Not set";

const STORAGE_PREFIX = "jat.analytics.includeNotSet.";

// Matches the plain "Not set" bucket and labelled variants such as
// "Not set (12)" used by rate charts.
export function isNotSetLabel(label: string) {
  return label === NOT_SET_LABEL || label.startsWith(`${NOT_SET_LABEL} (`);
}

// Per-chart, per-browser view preference. It lives in localStorage only and is
// never sent to the tracker's cloud storage.
export function useIncludeNotSet(chartId: string | undefined) {
  const [includeNotSet, setIncludeNotSet] = useState(() => {
    if (!chartId) {
      return true;
    }

    try {
      return window.localStorage.getItem(`${STORAGE_PREFIX}${chartId}`) !== "false";
    } catch {
      return true;
    }
  });

  function updateIncludeNotSet(next: boolean) {
    setIncludeNotSet(next);

    if (!chartId) {
      return;
    }

    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}${chartId}`, String(next));
    } catch {
      // Storage can be unavailable (private mode); the toggle still works for
      // this visit.
    }
  }

  return [includeNotSet, updateIncludeNotSet] as const;
}

export function applyNotSetFilter(data: ChartDatum[], includeNotSet: boolean) {
  const notSetItems = data.filter((item) => isNotSetLabel(item.label));

  return {
    hasNotSet: notSetItems.length > 0,
    notSetCount: notSetItems.reduce((sum, item) => sum + item.value, 0),
    visibleData: includeNotSet
      ? data
      : data.filter((item) => !isNotSetLabel(item.label)),
  };
}

export function NotSetToggle({
  includeNotSet,
  onChange,
}: {
  includeNotSet: boolean;
  onChange: (includeNotSet: boolean) => void;
}) {
  return (
    <button
      aria-pressed={includeNotSet}
      className={`inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 text-xs font-medium transition hover:bg-slate-50 ${
        includeNotSet ? "text-foreground" : "text-muted"
      }`}
      onClick={() => onChange(!includeNotSet)}
      title={includeNotSet ? "Hide values that are not set" : "Show values that are not set"}
      type="button"
    >
      <span
        aria-hidden="true"
        className={`relative h-3.5 w-6 rounded-full transition ${
          includeNotSet ? "bg-primary" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all ${
            includeNotSet ? "left-3" : "left-0.5"
          }`}
        />
      </span>
      Include not set
    </button>
  );
}
