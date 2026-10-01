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

  return {
    followUpDate:
      scheduleFollowUpAfterDays(
        application.followUpPromptDays ?? DEFAULT_FOLLOW_UP_PROMPT_DAYS,
        now,
      ) ?? undefined,
    followUpNeeded: application.followUpNeeded,
  };
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
