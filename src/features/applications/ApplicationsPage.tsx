import { type ReactNode, useEffect, useMemo, useState } from "react";
import { ApplicationDetailPanel } from "./ApplicationDetailPanel";
import {
  ApplicationsTable,
  DEFAULT_COLUMN_WIDTHS,
  type ApplicationColumnWidths,
} from "./ApplicationsTable";
import { ApplicationsToolbar } from "./ApplicationsToolbar";
import { ContactsPanel } from "./ContactsPanel";
import {
  countActiveFilters,
  applyApplicationFilters,
  DEFAULT_APPLICATION_FILTERS,
  DEFAULT_SORT_STATE,
  getApplicationFilterOptions,
  includeSelectedFilterOption,
  isNeedsAttention,
  normalizeApplicationFilters,
  normalizeApplicationSort,
  sortApplications,
  type ApplicationFilters,
  type SortColumn,
} from "./applicationFilters";
import {
  type SearchScope,
  searchApplications,
  selectSearchBase,
} from "./applicationSearch";
import { countApplicationSummary } from "./applicationSummary";
import { DEFAULT_VISIBLE_APPLICATION_COLUMNS } from "../../lib/domain";
import {
  deriveApplicationNotifications,
  selectUpcomingEvent,
} from "../../lib/reminders";
import { useResumeFileActions } from "../../hooks/useResumeFileActions";
import type {
  ApplicationUpdate,
  ContactInput,
  MutationResult,
  PendingResumeUpload,
} from "../../store/useTrackerStore";
import type {
  Activity,
  Assessment,
  Application,
  ApplicationContact,
  CoverLetterMetadata,
  Interview,
  InterviewInput,
  InterviewUpdate,
  ResumeMetadata,
} from "../../types/application";
import type { UserSettings } from "../../types/settings";
import type { TablePreferences } from "../../types/tablePreferences";

import type { AssessmentActions } from "../../lib/assessments";

interface ApplicationsPageProps {
  assessments: Assessment[];
  assessmentActions: AssessmentActions;
  activities: Activity[];
  addContact: (input: ContactInput) => Promise<MutationResult<ApplicationContact>>;
  addInterview: (input: InterviewInput) => Promise<MutationResult<Interview>>;
  applications: Application[];
  archiveApplication: (id: string) => Promise<MutationResult>;
  contacts: ApplicationContact[];
  coverLetters: CoverLetterMetadata[];
  deleteApplication: (id: string) => Promise<MutationResult>;
  deleteContact: (id: string) => Promise<MutationResult>;
  deleteInterview: (id: string) => Promise<MutationResult>;
  enableDeleteActiveApplications: boolean;
  getResumeFile: (id: string) => Promise<Blob>;
  getCoverLetterFile: (id: string) => Promise<Blob>;
  interviews: Interview[];
  now?: Date;
  openApplicationId?: string | null;
  onOpenApplicationHandled?: () => void;
  restoreApplication: (id: string) => Promise<MutationResult>;
  resumes: ResumeMetadata[];
  settings: UserSettings;
  tablePreferences: TablePreferences | null;
  viewMode?: "active" | "archive";
  resetTablePreferences: () => void;
  updateContact: (
    id: string,
    input: Partial<ContactInput>,
    expectedContact?: ApplicationContact,
  ) => Promise<MutationResult>;
  updateInterview: (
    id: string,
    input: InterviewUpdate,
    expectedInterview?: Interview,
  ) => Promise<MutationResult<Interview>>;
  updateApplication: (
    id: string,
    input: ApplicationUpdate,
    pendingResume?: PendingResumeUpload,
    pendingCoverLetter?: PendingResumeUpload,
    expectedApplication?: Application,
  ) => Promise<MutationResult>;
  updateSettings: (settings: Partial<UserSettings>) => void;
  updateTablePreferences: (preferences: Partial<TablePreferences>) => void;
}

export function ApplicationsPage({
  assessments,
  assessmentActions,
  activities,
  addContact,
  addInterview,
  applications,
  archiveApplication,
  contacts,
  coverLetters,
  deleteApplication,
  deleteContact,
  deleteInterview,
  enableDeleteActiveApplications,
  getResumeFile,
  getCoverLetterFile,
  interviews,
  now = new Date(),
  openApplicationId,
  onOpenApplicationHandled,
  restoreApplication,
  resumes,
  settings,
  tablePreferences,
  viewMode = "active",
  resetTablePreferences,
  updateContact,
  updateInterview,
  updateApplication,
  updateSettings,
  updateTablePreferences,
}: ApplicationsPageProps) {
  const [selectedApplicationId, setSelectedApplicationId] = useState<
    string | null
  >(null);
  const [contactsApplicationId, setContactsApplicationId] = useState<
    string | null
  >(null);
  const {
    actionError: resumeActionError,
    downloadResume,
    previewResume,
    workingResumeId,
  } = useResumeFileActions(getResumeFile);
  const {
    actionError: coverLetterActionError,
    downloadResume: downloadCoverLetter,
    previewResume: previewCoverLetter,
    workingResumeId: workingCoverLetterId,
  } = useResumeFileActions(getCoverLetterFile, "Cover letter");
  const rememberedTablePreferences =
    settings.rememberTableState ? tablePreferences : null;
  const [columnWidths, setColumnWidths] = useState<ApplicationColumnWidths>(
    mergeColumnWidths(rememberedTablePreferences?.columnWidths),
  );
  const [filters, setFilters] = useState<ApplicationFilters>(
    normalizeApplicationFilters(rememberedTablePreferences?.filters),
  );
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(
    rememberedTablePreferences?.needsAttentionOnly ?? false,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState(
    normalizeApplicationSort(rememberedTablePreferences?.sort),
  );
  const activeApplications = applications.filter(
    (application) => !application.archivedAt,
  );
  const archivedApplications = applications.filter(
    (application) => application.archivedAt,
  );
  const baseApplications =
    viewMode === "archive" ? archivedApplications : activeApplications;
  const viewLabel = viewMode === "archive" ? "Archived" : "Active";
  const [countScope, setCountScope] = useState<"view" | "total">("view");
  // Kept out of the remembered table view so stored preferences keep their
  // shape. Like the search itself, it carries over between Applications and
  // Archive because both views share this page instance.
  const [searchScope, setSearchScope] = useState<SearchScope>("all");
  const searchBase = selectSearchBase(
    applications,
    viewMode,
    searchQuery,
    searchScope,
  );
  // A value picked from cross-archive results stays listed after the search
  // is cleared, so the active filter is never hidden from its own dropdown.
  const companyOptions = includeSelectedFilterOption(
    getApplicationFilterOptions(searchBase.applications, "company"),
    filters.company,
  );
  const locationOptions = includeSelectedFilterOption(
    getApplicationFilterOptions(searchBase.applications, "location"),
    filters.location,
  );
  // Search relevance takes priority; the selected column orders equal matches.
  const searchedApplications = searchApplications(
    sortApplications(searchBase.applications, sort),
    searchQuery,
  );
  const filteredApplications = applyApplicationFilters(
    searchedApplications,
    filters,
    interviews,
  );
  const focusedApplications = needsAttentionOnly
    ? filteredApplications.filter((application) =>
        isNeedsAttention(
          application,
          settings,
          now,
          interviews.filter(
            (interview) => interview.applicationId === application.id,
          ),
          assessments.filter((item) => item.applicationId === application.id),
        ),
      )
    : filteredApplications;
  const visibleApplications = focusedApplications;
  // Rows show the next event however far ahead it is, so the attention
  // window and the interview-attention setting are widened for this lookup.
  const upcomingEventSettings = {
    ...settings,
    dueSoonDays: 36500,
    includeUpcomingInterviewsInAttention: true,
  };
  const upcomingEvents = new Map(
    visibleApplications.flatMap((application) => {
      const event = selectUpcomingEvent(
        deriveApplicationNotifications(
          application,
          upcomingEventSettings,
          now,
          interviews.filter(
            (interview) => interview.applicationId === application.id,
          ),
          assessments.filter((item) => item.applicationId === application.id),
        ),
        now,
      );
      return event ? [[application.id, event] as const] : [];
    }),
  );
  const isFiltered =
    countActiveFilters(filters, needsAttentionOnly) > 0 &&
    searchBase.applications.length > 0;
  const attentionCount = baseApplications.filter(
    (application) =>
      deriveApplicationNotifications(
        application,
        settings,
        now,
        interviews.filter(
          (interview) => interview.applicationId === application.id,
        ),
        assessments.filter((item) => item.applicationId === application.id),
      ).length > 0,
  ).length;
  const summary = countApplicationSummary(
    countScope === "total" ? applications : baseApplications,
    interviews,
    assessments,
  );
  const selectedApplication = useMemo(
    () =>
      applications.find(
        (application) => application.id === selectedApplicationId,
      ),
    [applications, selectedApplicationId],
  );
  const contactsApplication = useMemo(
    () =>
      applications.find(
        (application) => application.id === contactsApplicationId,
      ),
    [applications, contactsApplicationId],
  );

  useEffect(() => {
    if (!openApplicationId) {
      return;
    }

    setSelectedApplicationId(openApplicationId);
    onOpenApplicationHandled?.();
  }, [openApplicationId, onOpenApplicationHandled]);

  useEffect(() => {
    if (!settings.rememberTableState) {
      return;
    }

    updateTablePreferences({
      columnWidths,
      filters,
      needsAttentionOnly,
      // Keep the stored shape compatible with existing backups.
      searchQuery: "",
      sort,
      visibleApplicationColumns: settings.visibleApplicationColumns,
    });
    // The store currently returns mutation functions by value. Including this
    // callback would re-run the persistence effect after every store render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    columnWidths,
    filters,
    needsAttentionOnly,
    settings.rememberTableState,
    settings.visibleApplicationColumns,
    sort,
  ]);

  async function deleteAndCloseApplication(id: string) {
    const result = await deleteApplication(id);
    if (result.ok && id === selectedApplicationId) {
      setSelectedApplicationId(null);
    }
    return result;
  }

  function resetTableView() {
    setColumnWidths(mergeColumnWidths(null));
    setFilters(DEFAULT_APPLICATION_FILTERS);
    setNeedsAttentionOnly(false);
    setSearchQuery("");
    setSort(DEFAULT_SORT_STATE);
    updateSettings({
      visibleApplicationColumns: DEFAULT_VISIBLE_APPLICATION_COLUMNS,
    });
    resetTablePreferences();
  }

  return (
    <div className="space-y-5 xl:flex xl:min-h-0 xl:flex-1 xl:flex-col xl:gap-3 xl:space-y-0">
      <section className="grid grid-cols-2 gap-3 max-md:gap-2 xl:grid-cols-4 xl:shrink-0">
        <SummaryMetric
          action={
            <CountScopeToggle
              onChange={setCountScope}
              scope={countScope}
              viewLabel={viewLabel}
            />
          }
          label={countScope === "total" ? "Total applications" : viewLabel}
          value={String(summary.applications)}
        />
        <SummaryMetric
          label="Needs attention"
          value={String(attentionCount)}
          tone="warning"
        />
        <SummaryMetric
          label="Interviews"
          value={String(summary.interviews)}
          tone="info"
        />
        <SummaryMetric
          label="Assessments"
          value={String(summary.assessments)}
          tone="info"
        />
      </section>

      <ApplicationsToolbar
        companyOptions={companyOptions}
        filters={filters}
        locationOptions={locationOptions}
        needsAttentionOnly={needsAttentionOnly}
        onColumnVisibilityChange={(visibleApplicationColumns) =>
          updateSettings({ visibleApplicationColumns })
        }
        onFilterChange={(nextFilters) =>
          setFilters((current) => ({
            ...current,
            ...nextFilters,
          }))
        }
        onNeedsAttentionOnlyChange={setNeedsAttentionOnly}
        onResetFilters={() => {
          resetTableView();
        }}
        onResetColumnWidths={
          settings.enableDraggableColumnWidths
            ? () => setColumnWidths(DEFAULT_COLUMN_WIDTHS)
            : undefined
        }
        onSearchQueryChange={setSearchQuery}
        onSearchScopeChange={setSearchScope}
        onSortChange={setSort}
        searchQuery={searchQuery}
        searchScope={searchScope}
        sort={sort}
        viewMode={viewMode}
        visibleApplicationColumns={settings.visibleApplicationColumns}
      />

      {resumeActionError ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {resumeActionError}
        </p>
      ) : null}
      {coverLetterActionError ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {coverLetterActionError}
        </p>
      ) : null}

      <ApplicationsTable
        applications={visibleApplications}
        coverLetters={coverLetters}
        columnWidths={columnWidths}
        emptyBody={
          searchQuery.trim()
            ? searchBase.searchesAll
              ? "No active or archived applications match that company, title, or description."
              : "No applications match that company, title, or description."
            : isFiltered
              ? "Clear or change the filters to see more applications."
              : viewMode === "archive"
              ? "Archived applications will appear here."
              : "New entries will appear here once they are added."
        }
        emptyTitle={
          searchQuery.trim()
            ? "No matching applications"
            : isFiltered
              ? "No applications match these filters"
              : viewMode === "archive"
              ? "No archived applications"
              : "No applications yet"
        }
        enableDraggableColumnWidths={settings.enableDraggableColumnWidths}
        enableDeleteActiveApplications={enableDeleteActiveApplications}
        markArchivedApplications={searchBase.searchesAll}
        onPreviewResume={previewResume}
        onArchiveApplication={archiveApplication}
        onDeleteApplication={deleteAndCloseApplication}
        onOpenApplication={setSelectedApplicationId}
        onOpenContacts={setContactsApplicationId}
        onColumnWidthsChange={setColumnWidths}
        onRestoreApplication={restoreApplication}
        onSortChange={(column) => setSort((current) => nextSort(current, column))}
        onUpdateApplication={updateApplication}
        resumes={resumes}
        workingResumeId={workingResumeId}
        sort={sort}
        upcomingEvents={upcomingEvents}
        visibleApplicationColumns={settings.visibleApplicationColumns}
      />

      {selectedApplication ? (
        <ApplicationDetailPanel
          activities={activities.filter(
            (activity) => activity.applicationId === selectedApplication.id,
          )}
          application={selectedApplication}
          coverLetter={
            selectedApplication.coverLetterId
              ? coverLetters.find(
                  (coverLetter) =>
                    coverLetter.id === selectedApplication.coverLetterId,
                )
              : undefined
          }
          coverLetterActionError={coverLetterActionError}
          coverLetters={coverLetters}
          contacts={contacts.filter(
            (contact) => contact.applicationId === selectedApplication.id,
          )}
          assessmentActions={assessmentActions}
          assessments={assessments.filter(
            (item) => item.applicationId === selectedApplication.id,
          )}
          interviews={interviews.filter(
            (interview) => interview.applicationId === selectedApplication.id,
          )}
          enableDeleteActiveApplications={enableDeleteActiveApplications}
          onAddInterview={addInterview}
          onArchive={archiveApplication}
          onClose={() => setSelectedApplicationId(null)}
          onDelete={deleteAndCloseApplication}
          onRestore={restoreApplication}
          onDeleteInterview={deleteInterview}
          onDownloadCoverLetter={downloadCoverLetter}
          onDownloadResume={downloadResume}
          onPreviewResume={previewResume}
          onPreviewCoverLetter={previewCoverLetter}
          onUpdate={updateApplication}
          onUpdateInterview={updateInterview}
          resume={
            selectedApplication.resumeId
              ? resumes.find((resume) => resume.id === selectedApplication.resumeId)
              : undefined
          }
          resumes={resumes}
          resumeActionError={resumeActionError}
          workingResumeId={workingResumeId}
          workingCoverLetterId={workingCoverLetterId}
        />
      ) : null}

      {contactsApplication ? (
        <ContactsPanel
          application={contactsApplication}
          contacts={contacts.filter(
            (contact) => contact.applicationId === contactsApplication.id,
          )}
          displayMode={settings.contactsDisplayMode}
          onAddContact={addContact}
          onClose={() => setContactsApplicationId(null)}
          onDeleteContact={deleteContact}
          onUpdateContact={updateContact}
        />
      ) : null}
    </div>
  );
}

function mergeColumnWidths(
  columnWidths: Record<string, number> | null | undefined,
) {
  return {
    ...DEFAULT_COLUMN_WIDTHS,
    ...columnWidths,
  };
}

function nextSort(
  current: typeof DEFAULT_SORT_STATE,
  column: SortColumn,
): typeof DEFAULT_SORT_STATE {
  if (current.column === column && current.direction === "descending") {
    return {
      column,
      direction: "ascending",
    };
  }

  // A third click on the same header returns to the default ordering.
  if (current.column === column) {
    return DEFAULT_SORT_STATE;
  }

  return {
    column,
    direction: "descending",
  };
}

function SummaryMetric({
  action,
  label,
  value,
  tone = "neutral",
}: {
  action?: ReactNode;
  label: string;
  value: string;
  tone?: "neutral" | "warning" | "info";
}) {
  const toneClass =
    tone === "warning"
      ? "text-warning"
      : tone === "info"
        ? "text-info"
        : "text-foreground";

  return (
    // Phones put the value beside its label so the list starts higher up.
    <div className="surface-panel rounded-lg px-4 py-3 max-md:flex max-md:flex-wrap max-md:items-center max-md:justify-between max-md:gap-x-2 max-md:px-3 max-md:py-2">
      {/* min-h matches the count scope toggle so paired metrics line up. */}
      {/* On phones the label wraps before the value drops to its own line:
          a zero basis with an automatic minimum makes wrapping use the
          label's narrowest width rather than its single-line width. */}
      <div className="flex min-h-[26px] min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 max-md:min-w-[auto] max-md:flex-1">
        {/* The scope toggle already names the count on phones, where the
            label would push it onto a second line, so the label is only
            visually hidden there. */}
        <p
          className={`min-w-0 truncate text-sm font-medium text-muted max-md:whitespace-normal max-md:text-[13px] max-md:leading-4 ${
            action ? "max-sm:sr-only" : ""
          }`}
        >
          {label}
        </p>
        {action}
      </div>
      <p className={`mt-1 text-2xl font-semibold max-md:mt-0 max-md:text-xl ${toneClass}`}>{value}</p>
    </div>
  );
}

function CountScopeToggle({
  onChange,
  scope,
  viewLabel,
}: {
  onChange: (scope: "view" | "total") => void;
  scope: "view" | "total";
  viewLabel: string;
}) {
  const options = [
    { value: "view", label: viewLabel },
    { value: "total", label: "Total" },
  ] as const;

  return (
    <div
      aria-label="Application count scope"
      className="inline-flex shrink-0 rounded-md border border-border bg-background p-0.5"
      role="group"
    >
      {options.map((option) => (
        <button
          aria-pressed={scope === option.value}
          className={`touch-target rounded px-2 py-0.5 text-xs font-semibold transition ${
            scope === option.value
              ? "bg-surface text-foreground shadow-sm"
              : "text-muted hover:text-foreground"
          }`}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
