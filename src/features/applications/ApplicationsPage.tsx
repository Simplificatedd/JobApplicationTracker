import { useMemo, useState } from "react";
import { ApplicationDetailPanel } from "./ApplicationDetailPanel";
import { ApplicationsTable } from "./ApplicationsTable";
import { ApplicationsToolbar } from "./ApplicationsToolbar";
import { ContactsPanel } from "./ContactsPanel";
import {
  applyApplicationFilters,
  DEFAULT_APPLICATION_FILTERS,
  DEFAULT_SORT_STATE,
  isNeedsAttention,
  sortApplications,
  type ApplicationFilters,
  type SortColumn,
} from "./applicationFilters";
import { searchApplications } from "./applicationSearch";
import type { ApplicationUpdate } from "../../store/useTrackerStore";
import type { ContactInput } from "../../store/useTrackerStore";
import type {
  Activity,
  Application,
  ApplicationContact,
  ResumeMetadata,
} from "../../types/application";
import type { UserSettings } from "../../types/settings";

interface ApplicationsPageProps {
  activities: Activity[];
  addContact: (input: ContactInput) => ApplicationContact;
  applications: Application[];
  archiveApplication: (id: string) => void;
  contacts: ApplicationContact[];
  deleteApplication: (id: string) => void;
  deleteContact: (id: string) => void;
  enableDeleteActiveApplications: boolean;
  restoreApplication: (id: string) => void;
  resumes: ResumeMetadata[];
  settings: UserSettings;
  viewMode?: "active" | "archive";
  updateContact: (id: string, input: Partial<ContactInput>) => void;
  updateApplication: (id: string, input: ApplicationUpdate) => void;
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
  restoreApplication,
  resumes,
  settings,
  viewMode = "active",
  updateContact,
  updateApplication,
}: ApplicationsPageProps) {
  const [selectedApplicationId, setSelectedApplicationId] = useState<
    string | null
  >(null);
  const [contactsApplicationId, setContactsApplicationId] = useState<
    string | null
  >(null);
  const [filters, setFilters] = useState<ApplicationFilters>(
    DEFAULT_APPLICATION_FILTERS,
  );
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState(DEFAULT_SORT_STATE);
  const activeApplications = applications.filter(
    (application) => !application.archivedAt,
  );
  const archivedApplications = applications.filter(
    (application) => application.archivedAt,
  );
  const baseApplications =
    viewMode === "archive" ? archivedApplications : activeApplications;
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
    (application) => application.followUpNeeded || application.interviewDateTime,
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
        filters={filters}
        needsAttentionOnly={needsAttentionOnly}
        onFilterChange={(nextFilters) =>
          setFilters((current) => ({
            ...current,
            ...nextFilters,
          }))
        }
        onNeedsAttentionOnlyChange={setNeedsAttentionOnly}
        onResetFilters={() => {
          setFilters(DEFAULT_APPLICATION_FILTERS);
          setNeedsAttentionOnly(false);
        }}
        onSearchQueryChange={setSearchQuery}
        searchQuery={searchQuery}
      />

      <ApplicationsTable
        applications={visibleApplications}
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
        enableDeleteActiveApplications={enableDeleteActiveApplications}
        onArchiveApplication={archiveApplication}
        onDeleteApplication={(id) => {
          deleteApplication(id);
          if (id === selectedApplicationId) {
            setSelectedApplicationId(null);
          }
        }}
        onOpenApplication={setSelectedApplicationId}
        onOpenContacts={setContactsApplicationId}
        onRestoreApplication={restoreApplication}
        onSortChange={(column) => setSort((current) => nextSort(current, column))}
        onUpdateApplication={updateApplication}
        resumes={resumes}
        sort={sort}
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
          onUpdate={updateApplication}
          resume={
            selectedApplication.resumeId
              ? resumes.find((resume) => resume.id === selectedApplication.resumeId)
              : undefined
          }
          resumes={resumes}
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
