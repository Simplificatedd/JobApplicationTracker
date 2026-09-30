import {
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  Columns3,
  FileText,
  Info,
  MapPin,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useState,
} from "react";
import {
  APPLICATION_STATUSES,
  INTERVIEW_TYPE_OPTIONS,
} from "../../lib/constants";
import { APPLICATION_SOURCES } from "../../lib/domain";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import {
  APPLICATION_TABLE_COLUMNS,
  type ApplicationColumnId,
} from "./ApplicationsTable";
import {
  DEFAULT_APPLICATION_FILTERS,
  type ApplicationFilters,
} from "./applicationFilters";
import type {
  DeadlineEntryMode,
  InterviewType,
  JobType,
  Priority,
  WorkMode,
} from "../../types/application";

interface ApplicationsToolbarProps {
  companyOptions?: string[];
  filters?: ApplicationFilters;
  locationOptions?: string[];
  needsAttentionOnly?: boolean;
  onColumnVisibilityChange?: (columns: string[]) => void;
  onFilterChange?: (filters: Partial<ApplicationFilters>) => void;
  onNeedsAttentionOnlyChange?: (value: boolean) => void;
  onResetFilters?: () => void;
  onSearchQueryChange?: (value: string) => void;
  searchQuery?: string;
  visibleApplicationColumns?: string[];
}

export function ApplicationsToolbar({
  companyOptions = [],
  filters,
  locationOptions = [],
  needsAttentionOnly = false,
  onColumnVisibilityChange,
  onFilterChange,
  onNeedsAttentionOnlyChange,
  onResetFilters,
  onSearchQueryChange,
  searchQuery = "",
  visibleApplicationColumns = [],
}: ApplicationsToolbarProps) {
  const [isMoreFiltersOpen, setIsMoreFiltersOpen] = useState(false);
  const [isColumnsOpen, setIsColumnsOpen] = useState(false);
  const currentFilters = filters ?? DEFAULT_APPLICATION_FILTERS;
  const activeFilterCount = countActiveFilters(
    currentFilters,
    needsAttentionOnly,
  );
  const hiddenColumnCount = APPLICATION_TABLE_COLUMNS.filter(
    (column) =>
      column.canHide && !visibleApplicationColumns.includes(column.id),
  ).length;

  return (
    <section className="surface-panel applications-toolbar rounded-lg p-4">
      <div className="applications-toolbar-grid grid gap-3">
        <label className="relative block min-w-0">
          <Search
            aria-hidden="true"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            size={18}
          />
          <span className="sr-only">Search applications</span>
          <input
            className="h-10 w-full rounded-lg border border-border bg-surface pl-10 pr-3 text-sm text-foreground placeholder:text-muted"
            onChange={(event) => onSearchQueryChange?.(event.target.value)}
            placeholder="Search jobs or descriptions"
            type="search"
            value={searchQuery}
          />
          {searchQuery ? (
            <button
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-slate-100 hover:text-foreground"
              onClick={() => onSearchQueryChange?.("")}
              type="button"
            >
              <X aria-hidden="true" size={15} />
              <span className="sr-only">Clear search</span>
            </button>
          ) : null}
        </label>

        <div className="applications-toolbar-controls grid min-w-0 gap-2">
          <div className="applications-primary-filter min-w-0">
            <StatusFilter
              currentFilters={currentFilters}
              onFilterChange={onFilterChange}
            />
          </div>

          <div className="applications-primary-filter min-w-0">
            <FollowUpFilter
              currentFilters={currentFilters}
              onFilterChange={onFilterChange}
            />
          </div>

          <div className="applications-primary-filter min-w-0">
            <InterviewDateFilter
              currentFilters={currentFilters}
              onFilterChange={onFilterChange}
            />
          </div>

          <button
            aria-haspopup="dialog"
            className="inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-foreground hover:bg-slate-50"
            onClick={() => setIsMoreFiltersOpen(true)}
            type="button"
          >
            <SlidersHorizontal aria-hidden="true" size={16} />
            <span className="truncate">Filters</span>
            {activeFilterCount > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                {activeFilterCount}
              </span>
            ) : null}
          </button>

          <button
            className="applications-toolbar-reset h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-foreground hover:bg-slate-50"
            onClick={onResetFilters}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={16} />
            Reset
          </button>
        </div>
      </div>

      <div className="mt-3 flex justify-end border-t border-border pt-3">
        <button
          aria-haspopup="dialog"
          className="inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-foreground hover:bg-slate-50"
          onClick={() => setIsColumnsOpen(true)}
          type="button"
        >
          <Columns3 aria-hidden="true" size={16} />
          <span className="truncate">Columns</span>
          {hiddenColumnCount > 0 ? (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
              {hiddenColumnCount}
            </span>
          ) : null}
        </button>
      </div>

      {isMoreFiltersOpen ? (
        <MoreFiltersModal
          companyOptions={companyOptions}
          currentFilters={currentFilters}
          locationOptions={locationOptions}
          needsAttentionOnly={needsAttentionOnly}
          onClose={() => setIsMoreFiltersOpen(false)}
          onFilterChange={onFilterChange}
          onNeedsAttentionOnlyChange={onNeedsAttentionOnlyChange}
          onResetFilters={onResetFilters}
        />
      ) : null}

      {isColumnsOpen ? (
        <ColumnsModal
          onChange={onColumnVisibilityChange}
          onClose={() => setIsColumnsOpen(false)}
          visibleApplicationColumns={visibleApplicationColumns}
        />
      ) : null}
    </section>
  );
}

function ColumnsModal({
  onChange,
  onClose,
  visibleApplicationColumns,
}: {
  onChange?: (columns: string[]) => void;
  onClose: () => void;
  visibleApplicationColumns: string[];
}) {
  const [draftColumns, setDraftColumns] = useState(visibleApplicationColumns);
  useEscapeKey(true, onClose);

  function closeFromBackdrop(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  function updateColumn(columnId: ApplicationColumnId, checked: boolean) {
    if (checked) {
      setDraftColumns((current) => [...new Set([...current, columnId])]);
      return;
    }

    setDraftColumns((current) =>
      current.filter((currentColumn) => currentColumn !== columnId),
    );
  }

  function applyChanges() {
    onChange?.(draftColumns);
    onClose();
  }

  return (
    <div
      aria-labelledby="columns-title"
      aria-modal="true"
      className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      onMouseDown={closeFromBackdrop}
      role="dialog"
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-surface shadow-popover">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
          <h2
            className="min-w-0 truncate text-lg font-semibold text-foreground"
            id="columns-title"
          >
            Columns
          </h2>
          <button className="icon-button" onClick={onClose} type="button">
            <X aria-hidden="true" size={18} />
            <span className="sr-only">Close columns</span>
          </button>
        </header>

        <div className="grid gap-2 overflow-y-auto px-4 py-5 sm:px-6">
          {APPLICATION_TABLE_COLUMNS.map((column) => {
            const checked =
              !column.canHide || draftColumns.includes(column.id);

            return (
              <label
                className={`flex h-10 min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground ${
                  column.canHide ? "" : "opacity-70"
                }`}
                key={column.id}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{column.label}</span>
                  <ColumnInfoTooltip columnId={column.id} />
                </span>
                <input
                  checked={checked}
                  className="h-4 w-4 shrink-0 rounded border-border text-primary"
                  disabled={!column.canHide}
                  onChange={(event) =>
                    updateColumn(column.id, event.target.checked)
                  }
                  type="checkbox"
                />
              </label>
            );
          })}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-4 sm:px-6">
          <button
            className="h-10 rounded-lg border border-border px-3 text-sm font-semibold text-foreground hover:bg-slate-50"
            onClick={() =>
              setDraftColumns(
                APPLICATION_TABLE_COLUMNS.filter((column) => !column.canHide).map(
                  (column) => column.id,
                ),
              )
            }
            type="button"
          >
            Hide all
          </button>
          <button
            className="h-10 rounded-lg border border-border px-3 text-sm font-semibold text-foreground hover:bg-slate-50"
            onClick={() =>
              setDraftColumns(
                APPLICATION_TABLE_COLUMNS.map((column) => column.id),
              )
            }
            type="button"
          >
            Show all
          </button>
          <button
            className="h-10 rounded-lg border border-border px-3 text-sm font-semibold text-foreground hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-blue-700"
            onClick={applyChanges}
            type="button"
          >
            Apply
          </button>
        </footer>
      </div>
    </div>
  );
}

function ColumnInfoTooltip({ columnId }: { columnId: ApplicationColumnId }) {
  const description = COLUMN_DESCRIPTIONS[columnId];

  return (
    <span
      aria-label={description}
      className="group relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted hover:bg-slate-100 hover:text-foreground focus-visible:bg-slate-100 focus-visible:text-foreground"
      tabIndex={0}
    >
      <Info aria-hidden="true" size={14} />
      <span className="pointer-events-none absolute left-1/2 top-6 z-20 hidden w-56 -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-xs font-medium normal-case leading-5 text-foreground shadow-popover group-hover:block group-focus-visible:block">
        {description}
      </span>
    </span>
  );
}

const COLUMN_DESCRIPTIONS: Record<ApplicationColumnId, string> = {
  actions: "Row menu for archive, restore, and delete actions.",
  applicationUrl: "Link to the job post or application portal.",
  company: "Employer, recruiter, or organization name.",
  contacts: "Number of people linked to this application.",
  coverLetterVersion: "Stored cover letter used for this application.",
  dateApplied: "Date you submitted the application.",
  deadline: "Application or assessment deadline.",
  deadlineEntryMode: "How the deadline timing was entered.",
  followUp: "Follow-up date and whether the follow-up is needed.",
  followUpNeeded: "Whether this application needs a follow-up.",
  followUpPromptDays: "Default reminder timing for follow-up prompts.",
  interviewDateTime: "Scheduled interview date and time.",
  interviewRound: "Current interview number for this application.",
  interviewType: "Interview format, such as technical or face-to-face.",
  jobDescription: "Saved description or notes from the job posting.",
  jobTitle: "Role title; clicking it opens the application details.",
  jobType: "Role category such as internship, full-time, or contract.",
  location: "Job location or remote location label.",
  notes: "Private notes about the application.",
  priority: "Your priority level for this application.",
  resume: "Resume assigned to this application.",
  roleEndDate: "Expected end date for the role.",
  roleStartDate: "Expected start date for the role.",
  salary: "Salary, stipend, or pay range.",
  source: "Where you found the opportunity.",
  status: "Current stage in the application process.",
  updatedAt: "Most recent edit time for this application.",
  workMode: "Remote, hybrid, onsite, or unknown work arrangement.",
};

function StatusFilter({
  currentFilters,
  onFilterChange,
}: {
  currentFilters: ApplicationFilters;
  onFilterChange?: (filters: Partial<ApplicationFilters>) => void;
}) {
  return (
    <FilterSelect
      icon={SlidersHorizontal}
      label="Status"
      onChange={(value) =>
        onFilterChange?.({
          status: value as ApplicationFilters["status"],
        })
      }
      value={currentFilters.status}
    >
      <option value="">Status</option>
      {APPLICATION_STATUSES.map((status) => (
        <option key={status} value={status}>
          {status}
        </option>
      ))}
    </FilterSelect>
  );
}

function FollowUpFilter({
  currentFilters,
  onFilterChange,
}: {
  currentFilters: ApplicationFilters;
  onFilterChange?: (filters: Partial<ApplicationFilters>) => void;
}) {
  return (
    <FilterSelect
      icon={ClipboardCheck}
      label="Follow-up"
      onChange={(value) =>
        onFilterChange?.({
          followUp: value as ApplicationFilters["followUp"],
        })
      }
      value={currentFilters.followUp}
    >
      <option value="">Follow-up</option>
      <option value="needed">Needed</option>
      <option value="optional">Optional</option>
    </FilterSelect>
  );
}

function InterviewDateFilter({
  currentFilters,
  onFilterChange,
}: {
  currentFilters: ApplicationFilters;
  onFilterChange?: (filters: Partial<ApplicationFilters>) => void;
}) {
  return (
    <FilterSelect
      icon={CalendarDays}
      label="Interview date"
      onChange={(value) =>
        onFilterChange?.({
          interview: value as ApplicationFilters["interview"],
        })
      }
      value={currentFilters.interview}
    >
      <option value="">Interview date</option>
      <option value="scheduled">Scheduled</option>
      <option value="unscheduled">Not scheduled</option>
    </FilterSelect>
  );
}

function MoreFiltersModal({
  companyOptions,
  currentFilters,
  locationOptions,
  needsAttentionOnly,
  onClose,
  onFilterChange,
  onNeedsAttentionOnlyChange,
  onResetFilters,
}: {
  companyOptions: string[];
  currentFilters: ApplicationFilters;
  locationOptions: string[];
  needsAttentionOnly: boolean;
  onClose: () => void;
  onFilterChange?: (filters: Partial<ApplicationFilters>) => void;
  onNeedsAttentionOnlyChange?: (value: boolean) => void;
  onResetFilters?: () => void;
}) {
  useEscapeKey(true, onClose);

  function closeFromBackdrop(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  return (
    <div
      aria-labelledby="more-filters-title"
      aria-modal="true"
      className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      onMouseDown={closeFromBackdrop}
      role="dialog"
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-surface shadow-popover">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2
              className="truncate text-lg font-semibold text-foreground"
              id="more-filters-title"
            >
              Filters
            </h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button">
            <X aria-hidden="true" size={18} />
            <span className="sr-only">Close filters</span>
          </button>
        </header>

        <div className="grid gap-3 overflow-y-auto px-4 py-5 sm:grid-cols-2 sm:px-6">
          <FilterSelect
            icon={SlidersHorizontal}
            label="Company"
            onChange={(value) => onFilterChange?.({ company: value })}
            value={currentFilters.company}
          >
            <option value="">Company</option>
            {companyOptions.map((company) => (
              <option key={company} value={company}>
                {company}
              </option>
            ))}
          </FilterSelect>

          <StatusFilter
            currentFilters={currentFilters}
            onFilterChange={onFilterChange}
          />

          <FollowUpFilter
            currentFilters={currentFilters}
            onFilterChange={onFilterChange}
          />

          <InterviewDateFilter
            currentFilters={currentFilters}
            onFilterChange={onFilterChange}
          />

          <PresenceFilterSelect
            label="Job description"
            onChange={(value) =>
              onFilterChange?.({
                jobDescription: value as ApplicationFilters["jobDescription"],
              })
            }
            value={currentFilters.jobDescription}
          />

          <PresenceFilterSelect
            label="Application URL"
            onChange={(value) =>
              onFilterChange?.({
                applicationUrl: value as ApplicationFilters["applicationUrl"],
              })
            }
            value={currentFilters.applicationUrl}
          />

          <PresenceFilterSelect
            label="Applied date"
            onChange={(value) =>
              onFilterChange?.({
                dateApplied: value as ApplicationFilters["dateApplied"],
              })
            }
            value={currentFilters.dateApplied}
          />

          <FilterSelect
            icon={CalendarDays}
            label="Deadline"
            onChange={(value) =>
              onFilterChange?.({
                deadline: value as ApplicationFilters["deadline"],
              })
            }
            value={currentFilters.deadline}
          >
            <option value="">Deadline</option>
            <option value="scheduled">Scheduled</option>
            <option value="blank">Blank</option>
            <option value="overdue">Overdue</option>
            <option value="upcoming">Next 7 days</option>
          </FilterSelect>

          <FilterSelect
            icon={SlidersHorizontal}
            label="Deadline timing"
            onChange={(value) =>
              onFilterChange?.({
                deadlineEntryMode: value as DeadlineEntryMode | "",
              })
            }
            value={currentFilters.deadlineEntryMode}
          >
            <option value="">Deadline timing</option>
            <option value="exact">Exact date/time</option>
            <option value="1_day">1 day</option>
            <option value="2_days">2 days</option>
            <option value="3_days">3 days</option>
            <option value="72_hours">72 hours</option>
          </FilterSelect>

          <PresenceFilterSelect
            label="Role start date"
            onChange={(value) =>
              onFilterChange?.({
                roleStartDate: value as ApplicationFilters["roleStartDate"],
              })
            }
            value={currentFilters.roleStartDate}
          />

          <PresenceFilterSelect
            label="Role end date"
            onChange={(value) =>
              onFilterChange?.({
                roleEndDate: value as ApplicationFilters["roleEndDate"],
              })
            }
            value={currentFilters.roleEndDate}
          />

          <FilterSelect
            icon={SlidersHorizontal}
            label="Follow-up prompt"
            onChange={(value) =>
              onFilterChange?.({
                followUpPromptDays: value as ApplicationFilters["followUpPromptDays"],
              })
            }
            value={currentFilters.followUpPromptDays}
          >
            <option value="">Follow-up prompt</option>
            <option value="1">1 day</option>
            <option value="3">3 days</option>
            <option value="7">7 days</option>
            <option value="14_plus">14+ days</option>
          </FilterSelect>

          <FilterSelect
            icon={SlidersHorizontal}
            label="Interview number"
            onChange={(value) =>
              onFilterChange?.({
                interviewRound: value as ApplicationFilters["interviewRound"],
              })
            }
            value={currentFilters.interviewRound}
          >
            <option value="">Interview number</option>
            <option value="1">Interview 1</option>
            <option value="2">Interview 2</option>
            <option value="3_plus">Interview 3+</option>
          </FilterSelect>

          <FilterSelect
            icon={SlidersHorizontal}
            label="Interview type"
            onChange={(value) =>
              onFilterChange?.({
                interviewType: value as InterviewType | "",
              })
            }
            value={currentFilters.interviewType}
          >
            <option value="">Interview type</option>
            {INTERVIEW_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            icon={FileText}
            label="Resume"
            onChange={(value) =>
              onFilterChange?.({
                resume: value as ApplicationFilters["resume"],
              })
            }
            value={currentFilters.resume}
          >
            <option value="">Resume</option>
            <option value="assigned">Assigned</option>
            <option value="unassigned">Unassigned</option>
          </FilterSelect>

          <FilterSelect
            icon={SlidersHorizontal}
            label="Contacts"
            onChange={(value) =>
              onFilterChange?.({
                contacts: value as ApplicationFilters["contacts"],
              })
            }
            value={currentFilters.contacts}
          >
            <option value="">Contacts</option>
            <option value="linked">Linked</option>
            <option value="none">None</option>
          </FilterSelect>

          <PresenceFilterSelect
            label="Cover letter"
            onChange={(value) =>
              onFilterChange?.({
                coverLetterVersion:
                  value as ApplicationFilters["coverLetterVersion"],
              })
            }
            value={currentFilters.coverLetterVersion}
          />

          <PresenceFilterSelect
            label="Salary / Pay"
            onChange={(value) =>
              onFilterChange?.({
                salary: value as ApplicationFilters["salary"],
              })
            }
            value={currentFilters.salary}
          />

          <PresenceFilterSelect
            label="Notes"
            onChange={(value) =>
              onFilterChange?.({
                notes: value as ApplicationFilters["notes"],
              })
            }
            value={currentFilters.notes}
          />

          <FilterSelect
            icon={CalendarDays}
            label="Last updated"
            onChange={(value) =>
              onFilterChange?.({
                updatedAt: value as ApplicationFilters["updatedAt"],
              })
            }
            value={currentFilters.updatedAt}
          >
            <option value="">Last updated</option>
            <option value="today">Today</option>
            <option value="7_days">Past 7 days</option>
            <option value="30_days">Past 30 days</option>
          </FilterSelect>

          <FilterSelect
            icon={SlidersHorizontal}
            label="Source"
            onChange={(value) => onFilterChange?.({ source: value })}
            value={currentFilters.source}
          >
            <option value="">Source</option>
            {APPLICATION_SOURCES.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            icon={SlidersHorizontal}
            label="Job type"
            onChange={(value) =>
              onFilterChange?.({ jobType: value as JobType | "" })
            }
            value={currentFilters.jobType}
          >
            <option value="">Job type</option>
            <option value="internship">Internship</option>
            <option value="part-time">Part-time</option>
            <option value="full-time">Full-time</option>
            <option value="contract">Contract</option>
            <option value="other">Other</option>
          </FilterSelect>

          <FilterSelect
            icon={MapPin}
            label="Location"
            onChange={(value) => onFilterChange?.({ location: value })}
            value={currentFilters.location}
          >
            <option value="">Location</option>
            {locationOptions.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            icon={SlidersHorizontal}
            label="Priority"
            onChange={(value) =>
              onFilterChange?.({ priority: value as Priority | "" })
            }
            value={currentFilters.priority}
          >
            <option value="">Priority</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </FilterSelect>

          <FilterSelect
            icon={SlidersHorizontal}
            label="Work mode"
            onChange={(value) =>
              onFilterChange?.({ workMode: value as WorkMode | "" })
            }
            value={currentFilters.workMode}
          >
            <option value="">Work mode</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">Onsite</option>
            <option value="unknown">Unknown</option>
          </FilterSelect>

          <label className="flex h-10 min-w-0 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground sm:col-span-2">
            <input
              checked={needsAttentionOnly}
              className="h-4 w-4 shrink-0 rounded border-border text-primary"
              onChange={(event) =>
                onNeedsAttentionOnlyChange?.(event.target.checked)
              }
              type="checkbox"
            />
            <span className="truncate">Needs attention</span>
          </label>
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-4 sm:px-6">
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-foreground hover:bg-slate-50"
            onClick={onResetFilters}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={16} />
            Reset
          </button>
          <button
            className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-blue-700"
            onClick={onClose}
            type="button"
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}

function countActiveFilters(
  filters: ApplicationFilters,
  needsAttentionOnly: boolean,
) {
  return [
    filters.applicationUrl,
    filters.contacts,
    filters.coverLetterVersion,
    filters.dateApplied,
    filters.deadline,
    filters.deadlineEntryMode,
    filters.status,
    filters.followUp,
    filters.followUpPromptDays,
    filters.interview,
    filters.interviewRound,
    filters.interviewType,
    filters.jobDescription,
    filters.resume,
    filters.source,
    filters.jobType,
    filters.location,
    filters.notes,
    filters.priority,
    filters.roleEndDate,
    filters.roleStartDate,
    filters.salary,
    filters.updatedAt,
    filters.workMode,
    needsAttentionOnly,
  ].filter(Boolean).length;
}

function PresenceFilterSelect({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange?: (value: string) => void;
  value?: string;
}) {
  return (
    <FilterSelect
      icon={FileText}
      label={label}
      onChange={onChange}
      value={value}
    >
      <option value="">{label}</option>
      <option value="filled">Has value</option>
      <option value="blank">Blank</option>
    </FilterSelect>
  );
}

function FilterSelect({
  children,
  icon: Icon,
  label,
  onChange,
  value,
}: {
  children: ReactNode;
  icon: typeof SlidersHorizontal;
  label: string;
  onChange?: (value: string) => void;
  value?: string;
}) {
  return (
    <label className="relative block min-w-0">
      <Icon
        aria-hidden="true"
        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        size={16}
      />
      <span className="sr-only">{label}</span>
      <select
        className="h-10 w-full appearance-none rounded-lg border border-border bg-surface pl-9 pr-8 text-sm font-medium text-foreground"
        onChange={(event) => onChange?.(event.target.value)}
        value={value}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
        size={16}
      />
    </label>
  );
}
