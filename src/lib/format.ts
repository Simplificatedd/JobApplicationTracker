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

  return dateFormatter.format(new Date(value));
}

export function formatDateRange(start?: string, end?: string) {
  return [formatDate(start), formatDate(end)].filter(Boolean).join(" - ");
}

export function formatDeadline(value?: string) {
  if (!value) {
    return "";
  }

  return value.includes("T")
    ? dateTimeFormatter.format(new Date(value))
    : formatDate(value);
}

export function formatDateTime(value?: string) {
  if (!value) {
    return "Not scheduled";
  }

  return dateTimeFormatter.format(new Date(value));
}

export function formatUpdatedAt(value: string) {
  return dateTimeFormatter.format(new Date(value));
}
