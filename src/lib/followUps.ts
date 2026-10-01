import type { Application } from "../types/application";

export const FOLLOW_UP_DATE_PRESETS = [0, 1, 2, 3, 7, 14] as const;
export const FOLLOW_UP_AUTO_RESET_PRESETS = [1, 2, 3, 7, 14] as const;
export const DEFAULT_FOLLOW_UP_PROMPT_DAYS = 7;

export type FollowUpRequirement = "optional" | "compulsory";

export interface FollowUpScheduleUpdate {
  followUpDate?: string;
  followUpNeeded: boolean;
}

export function normalizeFollowUpDateInput(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return undefined;
  }

  return parseLocalDate(trimmedValue) ? trimmedValue : null;
}

export function validateFollowUpSchedule(
  requirement: FollowUpRequirement,
  dateValue: string,
) {
  const date = normalizeFollowUpDateInput(dateValue);

  if (date === null) {
    return "Enter a valid follow-up date.";
  }

  if (requirement === "compulsory" && !date) {
    return "A follow-up date is required when follow-up is compulsory.";
  }

  return undefined;
}

export function createFollowUpScheduleUpdate(
  requirement: FollowUpRequirement,
  dateValue: string,
): FollowUpScheduleUpdate | null {
  if (validateFollowUpSchedule(requirement, dateValue)) {
    return null;
  }

  return {
    followUpDate: normalizeFollowUpDateInput(dateValue) ?? undefined,
    followUpNeeded: requirement === "compulsory",
  };
}

export function scheduleFollowUpAfterDays(days: number, now = new Date()) {
  if (!Number.isInteger(days) || days < 0) {
    return null;
  }

  const date = startOfLocalDay(now);
  date.setDate(date.getDate() + days);

  return formatLocalDate(date);
}

export function normalizeFollowUpPromptDays(
  value: string | number | undefined,
  fallback = DEFAULT_FOLLOW_UP_PROMPT_DAYS,
) {
  const normalizedValue =
    typeof value === "string" && !value.trim() ? fallback : Number(value ?? fallback);

  return Number.isInteger(normalizedValue) && normalizedValue >= 1
    ? normalizedValue
    : null;
}

export function validateFollowUpAutoReset(
  enabled: boolean,
  promptDays: string | number | undefined,
  fallback = DEFAULT_FOLLOW_UP_PROMPT_DAYS,
) {
  if (!enabled || normalizeFollowUpPromptDays(promptDays, fallback) !== null) {
    return undefined;
  }

  return "Auto-reset days must be a positive whole number.";
}

export function createHandledFollowUpUpdate(
  application: Pick<
    Application,
    | "followUpAutoResetEnabled"
    | "followUpNeeded"
    | "followUpPromptDays"
  >,
  now = new Date(),
): FollowUpScheduleUpdate {
  if (!application.followUpAutoResetEnabled) {
    return {
      followUpDate: undefined,
      followUpNeeded: false,
    };
  }

  const promptDays =
    normalizeFollowUpPromptDays(application.followUpPromptDays) ??
    DEFAULT_FOLLOW_UP_PROMPT_DAYS;

  return {
    followUpDate:
      scheduleFollowUpAfterDays(promptDays, now) ?? undefined,
    followUpNeeded: application.followUpNeeded,
  };
}

export function migrateLegacyFollowUpSchedule(
  application: Application,
  defaultPromptDays = DEFAULT_FOLLOW_UP_PROMPT_DAYS,
): Application {
  if (application.followUpAutoResetEnabled !== undefined) {
    return application;
  }

  const promptDays =
    typeof application.followUpPromptDays === "number" &&
    Number.isInteger(application.followUpPromptDays) &&
    application.followUpPromptDays >= 0
      ? application.followUpPromptDays
      : defaultPromptDays;
  const followUpDate =
    application.followUpDate ??
    (application.followUpNeeded
      ? addDaysToDateStamp(
          application.dateApplied || application.createdAt,
          promptDays,
        )
      : undefined);

  return {
    ...application,
    followUpAutoResetEnabled: false,
    followUpDate,
  };
}

function addDaysToDateStamp(value: string, days: number) {
  const dateStampMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const baseDate = dateStampMatch
    ? new Date(
        Date.UTC(
          Number(dateStampMatch[1]),
          Number(dateStampMatch[2]) - 1,
          Number(dateStampMatch[3]),
        ),
      )
    : new Date(value);

  if (Number.isNaN(baseDate.getTime())) {
    return undefined;
  }

  if (dateStampMatch) {
    const isValidDateStamp =
      baseDate.getUTCFullYear() === Number(dateStampMatch[1]) &&
      baseDate.getUTCMonth() === Number(dateStampMatch[2]) - 1 &&
      baseDate.getUTCDate() === Number(dateStampMatch[3]);

    if (!isValidDateStamp) {
      return undefined;
    }

    baseDate.setUTCDate(baseDate.getUTCDate() + days);
    return baseDate.toISOString().slice(0, 10);
  }

  const localDate = new Date(
    Date.UTC(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate()),
  );
  localDate.setUTCDate(localDate.getUTCDate() + days);

  return localDate.toISOString().slice(0, 10);
}

function parseLocalDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

  return date.getFullYear() === Number(match[1]) &&
    date.getMonth() === Number(match[2]) - 1 &&
    date.getDate() === Number(match[3])
    ? date
    : null;
}

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function formatLocalDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
