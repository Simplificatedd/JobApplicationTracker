import { isValidDateTime } from "./dateTime";
import { normalizeFollowUpDateInput } from "./followUps";

const dateFormatter = new Intl.DateTimeFormat("en-SG", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-SG", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
  year: "numeric",
});

export function formatDate(value?: string) {
  if (!value) {
    return "";
  }

  return normalizeFollowUpDateInput(value.split("T")[0]) && (!value.includes("T") || isValidDateTime(value))
    ? dateFormatter.format(new Date(value)) : "Invalid date";
}

export function formatDateRange(start?: string, end?: string) {
  return [formatDate(start), formatDate(end)].filter(Boolean).join(" - ");
}

export function formatDeadline(value?: string) {
  if (!value) {
    return "";
  }

  return value.includes("T")
    ? formatSafeDateTime(value)
    : formatDate(value);
}

export function formatDateTime(value?: string) {
  if (!value) {
    return "Not scheduled";
  }

  return formatSafeDateTime(value);
}

export function formatUpdatedAt(value: string) {
  return formatSafeDateTime(value);
}

function formatSafeDateTime(value: string) {
  return isValidDateTime(value) ? dateTimeFormatter.format(new Date(value)) : "Invalid date";
}
