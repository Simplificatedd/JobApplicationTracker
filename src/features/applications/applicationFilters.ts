import type {
  Application,
  ApplicationStatus,
  JobType,
  Priority,
  WorkMode,
} from "../../types/application";
import type { UserSettings } from "../../types/settings";

export type FollowUpFilter = "" | "needed" | "optional";
export type InterviewFilter = "" | "scheduled" | "unscheduled";
export type ResumeFilter = "" | "assigned" | "unassigned";
export type SortColumn =
  | "jobTitle"
  | "company"
  | "status"
  | "followUpDate"
  | "interviewDateTime"
  | "updatedAt";
export type SortDirection = "ascending" | "descending";

export interface ApplicationFilters {
  followUp: FollowUpFilter;
  interview: InterviewFilter;
  jobType: JobType | "";
  location: string;
  priority: Priority | "";
  resume: ResumeFilter;
  source: string;
  status: ApplicationStatus | "";
  workMode: WorkMode | "";
}

export interface SortState {
  column: SortColumn;
  direction: SortDirection;
}

export const DEFAULT_APPLICATION_FILTERS: ApplicationFilters = {
  followUp: "",
  interview: "",
  jobType: "",
  location: "",
  priority: "",
  resume: "",
  source: "",
  status: "",
  workMode: "",
};

export const DEFAULT_SORT_STATE: SortState = {
  column: "updatedAt",
  direction: "descending",
};

export function applyApplicationFilters(
  applications: Application[],
  filters: ApplicationFilters,
) {
  return applications.filter((application) => {
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

    if (filters.interview === "scheduled" && !application.interviewDateTime) {
      return false;
    }

    if (filters.interview === "unscheduled" && application.interviewDateTime) {
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

    if (filters.location && application.location !== filters.location) {
      return false;
    }

    if (filters.priority && application.priority !== filters.priority) {
      return false;
    }

    if (filters.workMode && application.workMode !== filters.workMode) {
      return false;
    }

    return true;
  });
}

export function isNeedsAttention(
  application: Application,
  settings: UserSettings,
  now = new Date(),
) {
  const today = startOfDay(now);
  const dueSoon = addDays(today, settings.dueSoonDays);

  if (application.followUpNeeded) {
    return true;
  }

  if (application.followUpDate) {
    const followUpDate = startOfDay(new Date(application.followUpDate));

    if (followUpDate <= dueSoon) {
      return true;
    }
  }

  if (settings.includeUpcomingInterviewsInAttention && application.interviewDateTime) {
    const interviewDate = new Date(application.interviewDateTime);

    if (interviewDate >= now && interviewDate <= addDays(now, settings.dueSoonDays)) {
      return true;
    }
  }

  return false;
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
  if (column === "followUpDate" || column === "interviewDateTime" || column === "updatedAt") {
    return application[column] ? new Date(application[column]).getTime() : 0;
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
