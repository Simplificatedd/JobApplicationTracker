import type {
  Application,
  ApplicationStatus,
  Interview,
  InterviewType,
  JobType,
  Priority,
  WorkMode,
} from "../../types/application";
import type { UserSettings } from "../../types/settings";
import { normalizeInterviewType } from "../../lib/interviews";
import { deriveApplicationNotifications } from "../../lib/reminders";

export type FollowUpFilter = "" | "needed" | "optional";
export type InterviewFilter = "" | "scheduled" | "unscheduled";
export type ContactFilter = "" | "linked" | "none";
export type DeadlineFilter = "" | "scheduled" | "blank" | "overdue" | "upcoming";
export type FollowUpPromptFilter = "" | "off" | "1" | "3" | "7" | "14_plus";
export type InterviewRoundFilter = "" | "1" | "2" | "3_plus";
export type PresenceFilter = "" | "filled" | "blank";
export type ResumeFilter = "" | "assigned" | "unassigned";
export type UpdatedAtFilter = "" | "today" | "7_days" | "30_days";
export type SortColumn =
  | "jobTitle"
  | "jobDescription"
  | "company"
  | "location"
  | "workMode"
  | "jobType"
  | "source"
  | "applicationUrl"
  | "status"
  | "dateApplied"
  | "offerDeadline"
  | "roleStartDate"
  | "roleEndDate"
  | "followUp"
  | "followUpPromptDays"
  | "interviewRound"
  | "interviewDateTime"
  | "interviewType"
  | "priority"
  | "resume"
  | "contacts"
  | "coverLetterVersion"
  | "salary"
  | "notes"
  | "updatedAt"
  | "actions";
export type SortDirection = "ascending" | "descending";

export interface ApplicationFilters {
  applicationUrl: PresenceFilter;
  company: string;
  contacts: ContactFilter;
  coverLetterVersion: PresenceFilter;
  dateApplied: PresenceFilter;
  offerDeadline: DeadlineFilter;
  followUp: FollowUpFilter;
  followUpPromptDays: FollowUpPromptFilter;
  interview: InterviewFilter;
  interviewRound: InterviewRoundFilter;
  interviewType: InterviewType | "";
  jobDescription: PresenceFilter;
  jobType: JobType | "";
  location: string;
  notes: PresenceFilter;
  priority: Priority | "";
  resume: ResumeFilter;
  roleEndDate: PresenceFilter;
  roleStartDate: PresenceFilter;
  salary: PresenceFilter;
  source: string;
  status: ApplicationStatus | "";
  updatedAt: UpdatedAtFilter;
  workMode: WorkMode | "";
}

export interface SortState {
  column: SortColumn;
  direction: SortDirection;
}

export const DEFAULT_APPLICATION_FILTERS: ApplicationFilters = {
  applicationUrl: "",
  company: "",
  contacts: "",
  coverLetterVersion: "",
  dateApplied: "",
  offerDeadline: "",
  followUp: "",
  followUpPromptDays: "",
  interview: "",
  interviewRound: "",
  interviewType: "",
  jobDescription: "",
  jobType: "",
  location: "",
  notes: "",
  priority: "",
  resume: "",
  roleEndDate: "",
  roleStartDate: "",
  salary: "",
  source: "",
  status: "",
  updatedAt: "",
  workMode: "",
};

export const DEFAULT_SORT_STATE: SortState = {
  column: "updatedAt",
  direction: "descending",
};

const APPLICATION_SORT_COLUMNS: SortColumn[] = [
  "jobTitle",
  "jobDescription",
  "company",
  "location",
  "workMode",
  "jobType",
  "source",
  "applicationUrl",
  "status",
  "dateApplied",
  "offerDeadline",
  "roleStartDate",
  "roleEndDate",
  "followUp",
  "followUpPromptDays",
  "interviewRound",
  "interviewDateTime",
  "interviewType",
  "priority",
  "resume",
  "contacts",
  "coverLetterVersion",
  "salary",
  "notes",
  "updatedAt",
  "actions",
];

export function normalizeApplicationSort(
  sort: { column?: string; direction?: string } | null | undefined,
): SortState {
  if (
    !sort?.column ||
    !APPLICATION_SORT_COLUMNS.includes(sort.column as SortColumn) ||
    (sort.direction !== "ascending" && sort.direction !== "descending")
  ) {
    return DEFAULT_SORT_STATE;
  }

  return {
    column: sort.column as SortColumn,
    direction: sort.direction,
  };
}

export function applyApplicationFilters(
  applications: Application[],
  filters: ApplicationFilters,
  interviews?: Interview[],
) {
  return applications.filter((application) => {
    const applicationInterviews = interviews?.filter(
      (interview) => interview.applicationId === application.id,
    );
    const hasScheduledInterview = applicationInterviews
      ? applicationInterviews.some((interview) => interview.dateTime)
      : Boolean(application.interviewDateTime);
    if (
      filters.company &&
      normalizeFilterValue(application.company) !==
        normalizeFilterValue(filters.company)
    ) {
      return false;
    }

    if (filters.status && application.status !== filters.status) {
      return false;
    }

    if (
      filters.followUp === "needed" &&
      !application.followUpNeeded
    ) {
      return false;
    }

    if (
      filters.followUp === "optional" &&
      application.followUpNeeded
    ) {
      return false;
    }

    if (filters.interview === "scheduled" && !hasScheduledInterview) {
      return false;
    }

    if (filters.interview === "unscheduled" && hasScheduledInterview) {
      return false;
    }

    if (
      filters.applicationUrl &&
      !matchesPresence(application.applicationUrl, filters.applicationUrl)
    ) {
      return false;
    }

    if (
      filters.coverLetterVersion &&
      !matchesPresence(
        application.coverLetterId ?? application.coverLetterVersion,
        filters.coverLetterVersion,
      )
    ) {
      return false;
    }

    if (
      filters.dateApplied &&
      !matchesPresence(application.dateApplied, filters.dateApplied)
    ) {
      return false;
    }

    if (
      filters.offerDeadline &&
      !matchesDeadline(application.offerDeadline, filters.offerDeadline)
    ) {
      return false;
    }

    if (
      filters.followUpPromptDays &&
      !matchesFollowUpPromptDays(
        application.followUpAutoResetEnabled ?? false,
        application.followUpPromptDays,
        filters.followUpPromptDays,
      )
    ) {
      return false;
    }

    if (
      filters.interviewRound &&
      !(applicationInterviews
        ? applicationInterviews.some((interview) =>
            matchesInterviewRound(interview.round, filters.interviewRound),
          )
        : matchesInterviewRound(
            application.interviewRound,
            filters.interviewRound,
          ))
    ) {
      return false;
    }

    if (
      filters.interviewType &&
      !(applicationInterviews
        ? applicationInterviews.some(
            (interview) => interview.type === filters.interviewType,
          )
        : application.interviewType === filters.interviewType)
    ) {
      return false;
    }

    if (
      filters.jobDescription &&
      !matchesPresence(application.jobDescription, filters.jobDescription)
    ) {
      return false;
    }

    if (filters.notes && !matchesPresence(application.notes, filters.notes)) {
      return false;
    }

    if (filters.resume === "assigned" && !application.resumeId) {
      return false;
    }

    if (filters.resume === "unassigned" && application.resumeId) {
      return false;
    }

    if (filters.source && application.source !== filters.source) {
      return false;
    }

    if (filters.jobType && application.jobType !== filters.jobType) {
      return false;
    }

    if (
      filters.location &&
      normalizeFilterValue(application.location) !==
        normalizeFilterValue(filters.location)
    ) {
      return false;
    }

    if (filters.priority && application.priority !== filters.priority) {
      return false;
    }

    if (filters.workMode && application.workMode !== filters.workMode) {
      return false;
    }

    if (
      filters.roleEndDate &&
      !matchesPresence(application.roleEndDate, filters.roleEndDate)
    ) {
      return false;
    }

    if (
      filters.roleStartDate &&
      !matchesPresence(application.roleStartDate, filters.roleStartDate)
    ) {
      return false;
    }

    if (filters.salary && !matchesPresence(application.salary, filters.salary)) {
      return false;
    }

    if (filters.contacts === "linked" && application.contactsCount <= 0) {
      return false;
    }

    if (filters.contacts === "none" && application.contactsCount > 0) {
      return false;
    }

    if (
      filters.updatedAt &&
      !matchesUpdatedAt(application.updatedAt, filters.updatedAt)
    ) {
      return false;
    }

    return true;
  });
}

export function normalizeApplicationFilters(
  filters: Partial<ApplicationFilters> | null | undefined,
): ApplicationFilters {
  return {
    ...DEFAULT_APPLICATION_FILTERS,
    ...filters,
    interviewType: filters?.interviewType
      ? normalizeInterviewType(filters.interviewType)
      : "",
  };
}

export function getApplicationFilterOptions(
  applications: Application[],
  field: "company" | "location",
) {
  const optionsByNormalizedValue = new Map<string, string>();

  for (const application of applications) {
    const displayValue = application[field]?.trim().replace(/\s+/g, " ");
    const normalizedValue = normalizeFilterValue(displayValue);

    if (displayValue && !optionsByNormalizedValue.has(normalizedValue)) {
      optionsByNormalizedValue.set(normalizedValue, displayValue);
    }
  }

  return [...optionsByNormalizedValue.values()].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

export function isNeedsAttention(
  application: Application,
  settings: UserSettings,
  now = new Date(),
  interviews?: Interview[],
) {
  return deriveApplicationNotifications(
    application,
    settings,
    now,
    interviews,
  ).length > 0;
}

export function sortApplications(
  applications: Application[],
  sort: SortState,
) {
  const directionMultiplier = sort.direction === "ascending" ? 1 : -1;

  return [...applications].sort((left, right) => {
    const leftValue = getSortValue(left, sort.column);
    const rightValue = getSortValue(right, sort.column);

    if (leftValue < rightValue) {
      return -1 * directionMultiplier;
    }

    if (leftValue > rightValue) {
      return 1 * directionMultiplier;
    }

    return left.jobTitle.localeCompare(right.jobTitle);
  });
}

function getSortValue(application: Application, column: SortColumn) {
  if (column === "followUp") {
    return application.followUpDate ? new Date(application.followUpDate).getTime() : 0;
  }

  if (
    column === "dateApplied" ||
    column === "offerDeadline" ||
    column === "roleStartDate" ||
    column === "roleEndDate" ||
    column === "interviewDateTime" ||
    column === "updatedAt"
  ) {
    return application[column] ? new Date(application[column]).getTime() : 0;
  }

  if (column === "followUpPromptDays") {
    return application.followUpAutoResetEnabled
      ? application.followUpPromptDays ?? 7
      : 0;
  }

  if (column === "interviewRound") {
    return application.interviewRound ?? 0;
  }

  if (column === "contacts") {
    return application.contactsCount;
  }

  if (column === "resume") {
    return application.resumeId ?? "";
  }

  if (column === "actions") {
    return application.archivedAt ?? "";
  }

  return String(application[column] ?? "").toLowerCase();
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function matchesPresence(value: string | undefined, filter: PresenceFilter) {
  const hasValue = Boolean(value?.trim());

  if (filter === "filled") {
    return hasValue;
  }

  if (filter === "blank") {
    return !hasValue;
  }

  return true;
}

function normalizeFilterValue(value: string | undefined) {
  return value?.trim().replace(/\s+/g, " ").toLocaleLowerCase() ?? "";
}

function matchesDeadline(value: string | undefined, filter: DeadlineFilter) {
  if (filter === "scheduled" || filter === "blank") {
    return matchesPresence(value, filter === "scheduled" ? "filled" : "blank");
  }

  if (!value) {
    return false;
  }

  const today = startOfDay(new Date());
  const deadline = startOfDay(new Date(value));

  if (filter === "overdue") {
    return deadline < today;
  }

  return deadline >= today && deadline <= addDays(today, 7);
}

function matchesFollowUpPromptDays(
  enabled: boolean,
  value: number | undefined,
  filter: FollowUpPromptFilter,
) {
  if (filter === "off") {
    return !enabled;
  }

  if (!enabled) {
    return false;
  }

  const days = value ?? 7;

  if (filter === "14_plus") {
    return days >= 14;
  }

  return days === Number(filter);
}

function matchesInterviewRound(
  value: number | undefined,
  filter: InterviewRoundFilter,
) {
  const round = value ?? 0;

  if (filter === "3_plus") {
    return round >= 3;
  }

  return round === Number(filter);
}

function matchesUpdatedAt(value: string, filter: UpdatedAtFilter) {
  const today = startOfDay(new Date());
  const updatedAt = startOfDay(new Date(value));

  if (filter === "today") {
    return updatedAt.getTime() === today.getTime();
  }

  if (filter === "7_days") {
    return updatedAt >= addDays(today, -7);
  }

  if (filter === "30_days") {
    return updatedAt >= addDays(today, -30);
  }

  return true;
}
