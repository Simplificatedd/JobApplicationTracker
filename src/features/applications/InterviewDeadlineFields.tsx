import { useState } from "react";
import {
  calculateDeadlineFromDuration,
  MAX_DEADLINE_DURATION_DAYS,
  MAX_DEADLINE_DURATION_HOURS,
} from "../../lib/interviews";

interface InterviewDeadlineFieldsProps {
  breakpoint?: "sm" | "md";
  deadline: string;
  onChange: (value: { deadline: string; receivedAt: string }) => void;
  receivedAt: string;
}

type DurationUnit = "hours" | "days";

const DEADLINE_PRESETS = [24, 48, 72] as const;

export function InterviewDeadlineFields({
  breakpoint = "sm",
  deadline,
  onChange,
  receivedAt,
}: InterviewDeadlineFieldsProps) {
  const [customAmount, setCustomAmount] = useState("4");
  const [customError, setCustomError] = useState("");
  const [customUnit, setCustomUnit] = useState<DurationUnit>("days");
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const gridClassName =
    breakpoint === "md"
      ? "md:col-span-2 md:grid-cols-2"
      : "sm:col-span-2 sm:grid-cols-2";
  const fullWidthClassName =
    breakpoint === "md" ? "md:col-span-2" : "sm:col-span-2";

  function updateReceivedAt(value: string) {
    onChange({ deadline, receivedAt: value });
  }

  function updateDeadline(value: string) {
    onChange({ deadline: value, receivedAt });
  }

  function applyDuration(amount: number, unit: DurationUnit) {
    const nextReceivedAt = receivedAt || toDateTimeLocal(new Date());
    const suggestedDeadline = calculateDeadlineFromDuration(
      nextReceivedAt,
      amount,
      unit,
    );

    if (!suggestedDeadline) {
      setCustomError("Enter a duration within the supported range.");
      return;
    }

    setCustomError("");
    onChange({
      deadline: toDateTimeLocal(new Date(suggestedDeadline)),
      receivedAt: nextReceivedAt,
    });
  }

  function applyCustomDuration() {
    applyDuration(Number(customAmount), customUnit);
  }

  return (
    <div className={`grid gap-4 ${gridClassName}`}>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-foreground">
          Invitation received at
        </span>
        <div className="flex gap-2">
          <input
            className="field-control min-w-0"
            onChange={(event) => updateReceivedAt(event.target.value)}
            type="datetime-local"
            value={receivedAt}
          />
          <button
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-border px-3 text-sm font-semibold text-foreground hover:bg-slate-50"
            onClick={() => updateReceivedAt(toDateTimeLocal(new Date()))}
            type="button"
          >
            Now
          </button>
        </div>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-foreground">
          Deadline
        </span>
        <input
          className="field-control"
          onChange={(event) => updateDeadline(event.target.value)}
          type="datetime-local"
          value={deadline}
        />
      </label>

      <div className={fullWidthClassName}>
        <p className="text-sm font-medium text-foreground">
          Set deadline from received time
        </p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {DEADLINE_PRESETS.map((hours) => (
            <button
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-3 text-sm font-semibold text-foreground hover:border-primary hover:bg-primary-soft"
              key={hours}
              onClick={() => {
                setIsCustomOpen(false);
                applyDuration(hours, "hours");
              }}
              type="button"
            >
              +{hours}h
            </button>
          ))}
          <button
            aria-expanded={isCustomOpen}
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-3 text-sm font-semibold text-foreground hover:border-primary hover:bg-primary-soft"
            onClick={() => {
              setCustomError("");
              setIsCustomOpen((current) => !current);
            }}
            type="button"
          >
            Custom…
          </button>
        </div>

        {isCustomOpen ? (
          <div className="mt-3 rounded-lg border border-border bg-surface p-3">
            <p className="text-sm font-medium text-foreground">Custom duration</p>
            <div className="mt-2 flex flex-wrap items-start gap-2">
              <input
                aria-label="Custom duration amount"
                className="field-control w-28"
                max={
                  customUnit === "days"
                    ? MAX_DEADLINE_DURATION_DAYS
                    : MAX_DEADLINE_DURATION_HOURS
                }
                min="0.01"
                onChange={(event) => {
                  setCustomAmount(event.target.value);
                  setCustomError("");
                }}
                step="any"
                type="number"
                value={customAmount}
              />
              <select
                aria-label="Custom duration unit"
                className="field-control w-32"
                onChange={(event) => {
                  setCustomUnit(event.target.value as DurationUnit);
                  setCustomError("");
                }}
                value={customUnit}
              >
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
              <button
                className="inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-blue-700"
                onClick={applyCustomDuration}
                type="button"
              >
                Apply
              </button>
            </div>
            {customError ? (
              <p className="mt-2 text-xs font-medium text-destructive" role="alert">
                {customError}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-muted">
              Days are calculated as 24-hour periods.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function toDateTimeLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
