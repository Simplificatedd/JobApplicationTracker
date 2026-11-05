import { normalizeFollowUpDateInput } from "./followUps";

export function isValidDateTime(value: string) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.exec(value);
  return Boolean(match && normalizeFollowUpDateInput(match[1]) &&
    Number(match[2]) <= 23 && Number(match[3]) <= 59 &&
    Number(match[4] ?? 0) <= 59 && Number.isFinite(Date.parse(value)));
}

// Date-only values ("2026-11-05") are calendar days: parse them as local
// midnight rather than UTC midnight. Other values are parsed as given.
export function parseDateValue(value?: string) {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  const [year, monthIndex, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const date = new Date(year, monthIndex, day);
  return date.getFullYear() === year && date.getMonth() === monthIndex && date.getDate() === day
    ? date : undefined;
}

export function toDateTimeLocal(value?: string) {
  if (!value || !isValidDateTime(value)) return "";
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return value.slice(0, 16);
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function dateTimeEditValue(value: string, original?: string) {
  const trimmed = value.trim();
  // Preserve original offsets, seconds and precision on a no-op edit.
  if (original && isValidDateTime(original) && trimmed === toDateTimeLocal(original)) return original;
  if (!trimmed) return undefined;
  // An edited absolute timestamp still represents an instant in the local UI.
  return original && /(?:Z|[+-]\d{2}:\d{2})$/.test(original) && isValidDateTime(trimmed)
    ? new Date(trimmed).toISOString() : trimmed;
}
