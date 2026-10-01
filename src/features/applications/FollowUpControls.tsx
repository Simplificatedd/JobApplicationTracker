import { useId, useState } from "react";
import {
  FOLLOW_UP_AUTO_RESET_PRESETS,
  FOLLOW_UP_DATE_PRESETS,
  type FollowUpRequirement,
  scheduleFollowUpAfterDays,
} from "../../lib/followUps";

interface FollowUpScheduleControlsProps {
  date: string;
  error?: string;
  onDateChange: (value: string) => void;
  onRequirementChange: (value: FollowUpRequirement) => void;
  requirement: FollowUpRequirement;
}

export function FollowUpScheduleControls({
  date,
  error,
  onDateChange,
  onRequirementChange,
  requirement,
}: FollowUpScheduleControlsProps) {
  const requirementId = useId();
  const dateId = useId();
  const [customDays, setCustomDays] = useState("");
  const parsedCustomDays = Number(customDays);
  const canApplyCustomDays =
    customDays.trim() !== "" &&
    Number.isInteger(parsedCustomDays) &&
    parsedCustomDays >= 0;

  function applyDuration(days: number) {
    const scheduledDate = scheduleFollowUpAfterDays(days);

    if (scheduledDate) {
      onDateChange(scheduledDate);
    }
  }

  return (
    <div className="space-y-3">
      <label className="block space-y-1" htmlFor={requirementId}>
        <span className="text-xs font-semibold text-foreground">
          Requirement
        </span>
        <select
          className="field-control"
          id={requirementId}
          onChange={(event) =>
            onRequirementChange(event.target.value as FollowUpRequirement)
          }
          value={requirement}
        >
          <option value="optional">Optional</option>
          <option value="compulsory">Compulsory</option>
        </select>
      </label>

      <label className="block space-y-1" htmlFor={dateId}>
        <span className="text-xs font-semibold text-foreground">
          Follow-up date
        </span>
        <input
          aria-describedby={error ? `${dateId}-error` : undefined}
          aria-invalid={Boolean(error)}
          className="field-control"
          id={dateId}
          onChange={(event) => onDateChange(event.target.value)}
          required={requirement === "compulsory"}
          type="date"
          value={date}
        />
      </label>

      {requirement === "compulsory" ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {FOLLOW_UP_DATE_PRESETS.map((days) => (
              <button
                className="rounded-md border border-border bg-white px-2 py-1 text-xs font-medium text-foreground hover:bg-slate-50"
                key={days}
                onClick={() => applyDuration(days)}
                type="button"
              >
                {days === 0 ? "Now" : `+${days}d`}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              aria-label="Custom days from now"
              className="field-control h-9 min-w-0"
              min="0"
              onChange={(event) => setCustomDays(event.target.value)}
              placeholder="Custom days"
              step="1"
              type="number"
              value={customDays}
            />
            <button
              className="h-9 shrink-0 rounded-md border border-border bg-white px-3 text-xs font-semibold text-foreground hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canApplyCustomDays}
              onClick={() => applyDuration(parsedCustomDays)}
              type="button"
            >
              Apply
            </button>
          </div>
        </div>
      ) : date ? (
        <button
          className="text-left text-xs font-semibold text-primary hover:underline"
          onClick={() => onDateChange("")}
          type="button"
        >
          Clear date
        </button>
      ) : (
        <p className="text-xs text-muted">No Follow-Up</p>
      )}

      {error ? (
        <p className="text-xs font-medium text-danger" id={`${dateId}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface FollowUpAutoResetControlsProps {
  defaultPromptDays: number;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  onPromptDaysChange: (value: string) => void;
  promptDays: string;
}

export function FollowUpAutoResetControls({
  defaultPromptDays,
  enabled,
  onEnabledChange,
  onPromptDaysChange,
  promptDays,
}: FollowUpAutoResetControlsProps) {
  const promptDaysId = useId();

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm font-medium text-foreground">
        <input
          checked={enabled}
          className="h-4 w-4 rounded border-border text-primary"
          onChange={(event) => onEnabledChange(event.target.checked)}
          type="checkbox"
        />
        <span>Automatically schedule the next follow-up when handled</span>
      </label>

      {enabled ? (
        <div className="space-y-2">
          <label className="block space-y-1" htmlFor={promptDaysId}>
            <span className="text-xs font-semibold text-foreground">
              Days after handling
            </span>
            <input
              className="field-control"
              id={promptDaysId}
              min="1"
              onChange={(event) => onPromptDaysChange(event.target.value)}
              placeholder={String(defaultPromptDays)}
              step="1"
              type="number"
              value={promptDays}
            />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {FOLLOW_UP_AUTO_RESET_PRESETS.map((days) => (
              <button
                className="rounded-md border border-border bg-white px-2 py-1 text-xs font-medium text-foreground hover:bg-slate-50"
                key={days}
                onClick={() => onPromptDaysChange(String(days))}
                type="button"
              >
                {days}d
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted">
          Handling a follow-up will clear it and make it optional.
        </p>
      )}
    </div>
  );
}
