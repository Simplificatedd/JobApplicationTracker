import { useEffect, useMemo, useState } from "react";
import { ApplicationDetailPanel } from "./ApplicationDetailPanel";
import {
  ApplicationsTable,
  DEFAULT_COLUMN_WIDTHS,
  type ApplicationColumnWidths,
} from "./ApplicationsTable";
import { ApplicationsToolbar } from "./ApplicationsToolbar";
import { ContactsPanel } from "./ContactsPanel";
import {
  applyApplicationFilters,
  DEFAULT_APPLICATION_FILTERS,
  DEFAULT_SORT_STATE,
  getApplicationFilterOptions,
  isNeedsAttention,
  normalizeApplicationFilters,
  sortApplications,
  type ApplicationFilters,
  type SortColumn,
} from "./applicationFilters";
import { searchApplications } from "./applicationSearch";
import { DEFAULT_VISIBLE_APPLICATION_COLUMNS } from "../../lib/domain";
import { deriveApplicationNotifications } from "../../lib/reminders";
import { useResumeFileActions } from "../../hooks/useResumeFileActions";
import type {
  ApplicationUpdate,
  ContactInput,
  MutationResult,
  PendingResumeUpload,
} from "../../store/useTrackerStore";
import type {
  Activity,
  Application,
  ApplicationContact,
  ResumeMetadata,
} from "../../types/application";
import type { UserSettings } from "../../types/settings";
import type { TablePreferences } from "../../types/tablePreferences";

interface ApplicationsPageProps {
  activities: Activity[];
  addContact: (input: ContactInput) => Promise<MutationResult<ApplicationContact>>;
  applications: Application[];
  archiveApplication: (id: string) => void;
  contacts: ApplicationContact[];
  deleteApplication: (id: string) => Promise<MutationResult>;
  deleteContact: (id: string) => Promise<MutationResult>;
  enableDeleteActiveApplications: boolean;
  getResumeFile: (id: string) => Promise<Blob>;
  openApplicationId?: string | null;
  onOpenApplicationHandled?: () => void;
  restoreApplication: (id: string) => void;
  resumes: ResumeMetadata[];
  settings: UserSettings;
  tablePreferences: TablePreferences | null;
  viewMode?: "active" | "archive";
  resetTablePreferences: () => void;
  updateContact: (
    id: string,
    input: Partial<ContactInput>,
  ) => Promise<MutationResult>;
  updateApplication: (
    id: string,
    input: ApplicationUpdate,
    pendingResume?: PendingResumeUpload,
  ) => Promise<MutationResult>;
  updateSettings: (settings: Partial<UserSettings>) => void;
  updateTablePreferences: (preferences: Partial<TablePreferences>) => void;
}

export function ApplicationsPage({
  activities,
  addContact,
  applications,
  archiveApplication,
  contacts,
  deleteApplication,
  deleteContact,
  enableDeleteActiveApplications,
  getResumeFile,
  openApplicationId,
  onOpenApplicationHandled,
  restoreApplication,
  resumes,
  settings,
  tablePreferences,
  viewMode = "active",
  resetTablePreferences,
  updateContact,
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
  const [searchQuery, setSearchQuery] = useState(
    rememberedTablePreferences?.searchQuery ?? "",
  );
  const [sort, setSort] = useState(
    rememberedTablePreferences?.sort ?? DEFAULT_SORT_STATE,
  );
  const activeApplications = applications.filter(
    (application) => !application.archivedAt,
  );
  const archivedApplications = applications.filter(
    (application) => application.archivedAt,
  );
  const baseApplications =
    viewMode === "archive" ? archivedApplications : activeApplications;
  const companyOptions = getApplicationFilterOptions(baseApplications, "company");
  const locationOptions = getApplicationFilterOptions(
    baseApplications,
    "location",
  );
  const searchedApplications = searchApplications(baseApplications, searchQuery);
  const filteredApplications = applyApplicationFilters(
    searchedApplications,
    filters,
  );
  const focusedApplications = needsAttentionOnly
    ? filteredApplications.filter((application) =>
        isNeedsAttention(application, settings),
      )
    : filteredApplications;
  const visibleApplications = sortApplications(focusedApplications, sort);
  const attentionCount = baseApplications.filter(
    (application) =>
      deriveApplicationNotifications(application, settings).length > 0,
  ).length;
  const interviewCount = baseApplications.filter(
    (application) => application.interviewDateTime,
  ).length;
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
      searchQuery,
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
    searchQuery,
    settings.rememberTableState,
    settings.visibleApplicationColumns,
    sort,
  ]);

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
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-3">
        <SummaryMetric
          label={viewMode === "archive" ? "Archived" : "Active"}
          value={String(baseApplications.length)}
        />
        <SummaryMetric
          label="Needs attention"
          value={String(attentionCount)}
          tone="warning"
        />
        <SummaryMetric label="Interviews" value={String(interviewCount)} tone="info" />
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
        onSearchQueryChange={setSearchQuery}
        searchQuery={searchQuery}
        visibleApplicationColumns={settings.visibleApplicationColumns}
      />

      {resumeActionError ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {resumeActionError}
        </p>
      ) : null}

      <ApplicationsTable
        applications={visibleApplications}
        columnWidths={columnWidths}
        emptyBody={
          searchQuery
            ? "No applications match that title or description."
            : viewMode === "archive"
              ? "Archived applications will appear here."
              : "New entries will appear here once they are added."
        }
        emptyTitle={
          searchQuery
            ? "No matching applications"
            : viewMode === "archive"
              ? "No archived applications"
              : "No applications yet"
        }
        enableDraggableColumnWidths={settings.enableDraggableColumnWidths}
        enableDeleteActiveApplications={enableDeleteActiveApplications}
        onPreviewResume={previewResume}
        onArchiveApplication={archiveApplication}
        onDeleteApplication={async (id) => {
          const result = await deleteApplication(id);
          if (result.ok && id === selectedApplicationId) {
            setSelectedApplicationId(null);
          }
        }}
        onOpenApplication={setSelectedApplicationId}
        onOpenContacts={setContactsApplicationId}
        onColumnWidthsChange={setColumnWidths}
        onRestoreApplication={restoreApplication}
        onSortChange={(column) => setSort((current) => nextSort(current, column))}
        onUpdateApplication={updateApplication}
        resumes={resumes}
        workingResumeId={workingResumeId}
        sort={sort}
        visibleApplicationColumns={settings.visibleApplicationColumns}
      />

      {selectedApplication ? (
        <ApplicationDetailPanel
          activities={activities.filter(
            (activity) => activity.applicationId === selectedApplication.id,
          )}
          application={selectedApplication}
          contacts={contacts.filter(
            (contact) => contact.applicationId === selectedApplication.id,
          )}
          onClose={() => setSelectedApplicationId(null)}
          onDownloadResume={downloadResume}
          onPreviewResume={previewResume}
          onUpdate={updateApplication}
          resume={
            selectedApplication.resumeId
              ? resumes.find((resume) => resume.id === selectedApplication.resumeId)
              : undefined
          }
          resumes={resumes}
          resumeActionError={resumeActionError}
          workingResumeId={workingResumeId}
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

  return {
    column,
    direction: "descending",
  };
}

function SummaryMetric({
  label,
  value,
  tone = "neutral",
}: {
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
    <div className="surface-panel rounded-lg px-4 py-3">
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
