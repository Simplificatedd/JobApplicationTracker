import type { Application } from "../../types/application";

export interface DuplicateApplicationMatch {
  application: Application;
  matchedBy: "application URL" | "company and job title";
}

export const INTERVIEW_ROUND_SOFT_LIMIT = 99;

export interface InterviewRoundValidation {
  error?: string;
  round?: number;
  warnings: string[];
}

export function validateInterviewRound(
  value: string,
  existingRounds: number[] = [],
): InterviewRoundValidation {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return { round: undefined, warnings: [] };
  }

  const round = Number(trimmedValue);

  if (!Number.isInteger(round) || round < 1) {
    return {
      error: "Round must be a positive whole number or left blank.",
      warnings: [],
    };
  }

  const warnings = [];

  if (round > INTERVIEW_ROUND_SOFT_LIMIT) {
    warnings.push(
      `Round ${round} is unusually high; the recommended maximum is ${INTERVIEW_ROUND_SOFT_LIMIT}.`,
    );
  }

  if (existingRounds.includes(round)) {
    warnings.push(`Round ${round} already exists for this application.`);
  }

  return { round, warnings };
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
