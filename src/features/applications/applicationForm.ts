import type {
  Application,
  DeadlineEntryMode,
} from "../../types/application";

export interface DuplicateApplicationMatch {
  application: Application;
  matchedBy: "application URL" | "company and job title";
}

export function deadlineValueForEntryMode(
  value: string,
  entryMode: DeadlineEntryMode,
) {
  if (!value) {
    return "";
  }

  if (entryMode === "exact") {
    return value.includes("T") ? value.slice(0, 16) : `${value.slice(0, 10)}T23:59`;
  }

  return value.slice(0, 10);
}

export function findDuplicateApplication(
  applications: Application[],
  candidate: Pick<Application, "applicationUrl" | "company" | "jobTitle">,
): DuplicateApplicationMatch | null {
  const candidateUrl = normalizeUrl(candidate.applicationUrl);
  const candidateCompany = normalizeText(candidate.company);
  const candidateTitle = normalizeText(candidate.jobTitle);

  for (const application of applications) {
    if (
      candidateUrl &&
      normalizeUrl(application.applicationUrl) === candidateUrl
    ) {
      return { application, matchedBy: "application URL" };
    }
  }

  if (!candidateCompany || !candidateTitle) {
    return null;
  }

  const match = applications.find(
    (application) =>
      normalizeText(application.company) === candidateCompany &&
      normalizeText(application.jobTitle) === candidateTitle,
  );

  return match
    ? { application: match, matchedBy: "company and job title" }
    : null;
}

export function suggestFollowUpDate(
  dateApplied: string,
  promptDays: number,
  now = new Date(),
) {
  const baseDate = parseLocalDate(dateApplied) ?? startOfLocalDay(now);
  baseDate.setDate(baseDate.getDate() + promptDays);

  return formatLocalDate(baseDate);
}

function normalizeText(value: string | undefined) {
  return value?.trim().replace(/\s+/g, " ").toLocaleLowerCase() ?? "";
}

function normalizeUrl(value: string | undefined) {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    return "";
  }

  try {
    const url = new URL(normalized);
    url.hash = "";
    url.hostname = url.hostname.toLocaleLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";

    return url.toString();
  } catch {
    return normalized.toLocaleLowerCase().replace(/\/+$/, "");
  }
}

function parseLocalDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

  if (
    date.getFullYear() !== Number(match[1]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[3])
  ) {
    return null;
  }

  return date;
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
