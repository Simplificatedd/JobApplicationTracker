import type { JobApplication, ResumeFile } from "../../types/application";
import { type ReactNode, useState } from "react";
import {
  ArrowDownWideNarrow,
  ArrowUpDown,
  ArrowUpWideNarrow,
  Check,
  Pencil,
  X,
} from "lucide-react";
import {
  ContactsButton,
  DescriptionPreview,
  FollowUpCell,
  InterviewCell,
  ResumeCell,
  RowActionsMenu,
} from "./TableCells";
import { StatusBadge } from "./StatusBadge";
import { formatUpdatedAt } from "../../lib/format";
import { APPLICATION_STATUSES } from "../../lib/constants";
import type { ApplicationUpdate } from "../../store/useTrackerStore";
import type { SortColumn, SortState } from "./applicationFilters";

interface ApplicationsTableProps {
  applications: JobApplication[];
  emptyBody?: string;
  emptyTitle?: string;
  enableDeleteActiveApplications: boolean;
  onArchiveApplication: (applicationId: string) => void;
  onDeleteApplication: (applicationId: string) => void;
  onOpenApplication: (applicationId: string) => void;
  onOpenContacts: (applicationId: string) => void;
  onRestoreApplication: (applicationId: string) => void;
  onSortChange: (column: SortColumn) => void;
  onUpdateApplication: (id: string, input: ApplicationUpdate) => void;
  resumes: ResumeFile[];
  sort: SortState;
}

const columns: Array<{
  key?: SortColumn;
  label: string;
}> = [
  { key: "jobTitle", label: "Job Title" },
  { key: "company", label: "Company" },
  { key: "status", label: "Status" },
  { key: "followUpDate", label: "Follow-up" },
  { key: "interviewDateTime", label: "Interview Date/Time" },
  { label: "Resume" },
  { label: "Contacts" },
  { key: "updatedAt", label: "Last Updated" },
  { label: "Actions" },
];

export function ApplicationsTable({
  applications,
  emptyBody = "New entries will appear here once they are added.",
  emptyTitle = "No applications yet",
  enableDeleteActiveApplications,
  onArchiveApplication,
  onDeleteApplication,
  onOpenApplication,
  onOpenContacts,
  onRestoreApplication,
  onSortChange,
  onUpdateApplication,
  resumes,
  sort,
}: ApplicationsTableProps) {
  const resumeById = new Map(resumes.map((resume) => [resume.id, resume]));

  return (
    <section className="surface-panel overflow-hidden rounded-lg">
      {applications.length === 0 ? (
        <div className="flex min-h-[280px] items-center justify-center px-6 py-12 text-center">
          <div className="max-w-sm">
            <h2 className="text-xl font-semibold text-foreground">
              {emptyTitle}
            </h2>
            <p className="mt-2 text-sm text-muted">
              {emptyBody}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-3 p-3 xl:hidden">
            {applications.map((application) => (
              <ApplicationCard
                application={application}
                enableDeleteActiveApplications={enableDeleteActiveApplications}
                key={application.id}
                onArchiveApplication={onArchiveApplication}
                onDeleteApplication={onDeleteApplication}
                onOpenApplication={onOpenApplication}
                onOpenContacts={onOpenContacts}
                onRestoreApplication={onRestoreApplication}
                onUpdateApplication={onUpdateApplication}
                resume={
                  application.resumeId
                    ? resumeById.get(application.resumeId)
                    : undefined
                }
              />
            ))}
          </div>
          <div className="hidden overflow-x-auto xl:block">
            <table className="w-full min-w-[1040px] table-fixed border-collapse text-left">
              <colgroup>
                <col className="w-[19%]" />
                <col className="w-[11%]" />
                <col className="w-[14%]" />
                <col className="w-[10%]" />
                <col className="w-[13%]" />
                <col className="w-[8%]" />
                <col className="w-[7%]" />
                <col className="w-[11%]" />
                <col className="w-[7%]" />
              </colgroup>
            <thead className="border-b border-border bg-slate-50">
              <tr>
                {columns.map((column) => (
                  <th
                    aria-sort={
                      column.key && sort.column === column.key
                        ? sort.direction
                        : undefined
                    }
                    className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted"
                    key={column.label}
                    scope="col"
                  >
                    {column.key ? (
                      <button
                        className="flex items-center gap-1.5 text-left hover:text-foreground"
                        onClick={() => onSortChange(column.key as SortColumn)}
                        type="button"
                      >
                        <span>{column.label}</span>
                        <SortIcon
                          state={
                            sort.column === column.key ? sort.direction : "none"
                          }
                        />
                      </button>
                    ) : (
                      <span>{column.label}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {applications.map((application) => (
                <ApplicationRow
                  application={application}
                  enableDeleteActiveApplications={enableDeleteActiveApplications}
                  key={application.id}
                  onArchiveApplication={onArchiveApplication}
                  onDeleteApplication={onDeleteApplication}
                  onOpenApplication={onOpenApplication}
                  onOpenContacts={onOpenContacts}
                  onRestoreApplication={onRestoreApplication}
                  onUpdateApplication={onUpdateApplication}
                  resume={
                    application.resumeId
                      ? resumeById.get(application.resumeId)
                      : undefined
                  }
                />
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}
    </section>
  );
}

function SortIcon({
  state,
}: {
  state: "ascending" | "descending" | "none";
}) {
  if (state === "ascending") {
    return <ArrowUpWideNarrow aria-hidden="true" size={14} />;
  }

  if (state === "descending") {
    return <ArrowDownWideNarrow aria-hidden="true" size={14} />;
  }

  return <ArrowUpDown aria-hidden="true" size={14} />;
}

function ApplicationRow({
  application,
  enableDeleteActiveApplications,
  onArchiveApplication,
  onDeleteApplication,
  onOpenApplication,
  onOpenContacts,
  onRestoreApplication,
  onUpdateApplication,
  resume,
}: {
  application: JobApplication;
  enableDeleteActiveApplications: boolean;
  onArchiveApplication: (applicationId: string) => void;
  onDeleteApplication: (applicationId: string) => void;
  onOpenApplication: (applicationId: string) => void;
  onOpenContacts: (applicationId: string) => void;
  onRestoreApplication: (applicationId: string) => void;
  onUpdateApplication: (id: string, input: ApplicationUpdate) => void;
  resume?: ResumeFile;
}) {
  return (
    <tr className="table-row-hover align-top">
      <td className="px-4 py-4">
        <div className="min-w-0">
          <button
            className="block max-w-full truncate text-left text-sm font-semibold text-foreground hover:text-primary"
            onClick={() => onOpenApplication(application.id)}
            type="button"
          >
            {application.jobTitle}
          </button>
          <DescriptionPreview description={application.jobDescription} />
        </div>
      </td>
      <td className="px-4 py-4">
        <p className="truncate text-sm font-medium text-foreground">
          {application.company}
        </p>
        <p className="mt-1 truncate text-xs text-muted">
          {application.location ?? "Location blank"}
        </p>
      </td>
      <td className="px-4 py-4">
        <InlineStatusEditor
          application={application}
          onUpdateApplication={onUpdateApplication}
        />
      </td>
      <td className="px-4 py-4">
        <InlineFollowUpEditor
          application={application}
          onUpdateApplication={onUpdateApplication}
        />
      </td>
      <td className="px-4 py-4">
        <InterviewCell application={application} />
      </td>
      <td className="px-4 py-4">
        <ResumeCell resume={resume} />
      </td>
      <td className="px-4 py-4">
        <ContactsButton
          count={application.contactsCount}
          onClick={() => onOpenContacts(application.id)}
        />
      </td>
      <td className="px-4 py-4">
        <p className="text-sm text-foreground">
          {formatUpdatedAt(application.updatedAt)}
        </p>
      </td>
      <td className="px-4 py-4">
        <RowActionsMenu
          application={application}
          enableDeleteActiveApplications={enableDeleteActiveApplications}
          onArchiveApplication={onArchiveApplication}
          onDeleteApplication={onDeleteApplication}
          onRestoreApplication={onRestoreApplication}
        />
      </td>
    </tr>
  );
}

function ApplicationCard({
  application,
  enableDeleteActiveApplications,
  onArchiveApplication,
  onDeleteApplication,
  onOpenApplication,
  onOpenContacts,
  onRestoreApplication,
  onUpdateApplication,
  resume,
}: {
  application: JobApplication;
  enableDeleteActiveApplications: boolean;
  onArchiveApplication: (applicationId: string) => void;
  onDeleteApplication: (applicationId: string) => void;
  onOpenApplication: (applicationId: string) => void;
  onOpenContacts: (applicationId: string) => void;
  onRestoreApplication: (applicationId: string) => void;
  onUpdateApplication: (id: string, input: ApplicationUpdate) => void;
  resume?: ResumeFile;
}) {
  return (
    <article className="rounded-lg border border-border bg-surface px-4 py-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            className="block max-w-full text-left text-sm font-semibold leading-5 text-foreground hover:text-primary"
            onClick={() => onOpenApplication(application.id)}
            type="button"
          >
            {application.jobTitle}
          </button>
          <p className="mt-1 truncate text-xs font-medium text-muted">
            {application.company || "Company blank"}
          </p>
        </div>
        <RowActionsMenu
          application={application}
          enableDeleteActiveApplications={enableDeleteActiveApplications}
          onArchiveApplication={onArchiveApplication}
          onDeleteApplication={onDeleteApplication}
          onRestoreApplication={onRestoreApplication}
        />
      </div>

      <DescriptionPreview description={application.jobDescription} />

      <div className="mt-4 grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
        <CardField label="Status">
          <InlineStatusEditor
            application={application}
            onUpdateApplication={onUpdateApplication}
          />
        </CardField>
        <CardField label="Follow-up">
          <InlineFollowUpEditor
            application={application}
            onUpdateApplication={onUpdateApplication}
          />
        </CardField>
        <CardField label="Interview">
          <InterviewCell application={application} />
        </CardField>
        <CardField label="Resume">
          <ResumeCell resume={resume} />
        </CardField>
        <CardField label="Contacts">
          <ContactsButton
            count={application.contactsCount}
            onClick={() => onOpenContacts(application.id)}
          />
        </CardField>
        <CardField label="Updated">
          <p className="text-sm text-foreground">
            {formatUpdatedAt(application.updatedAt)}
          </p>
        </CardField>
      </div>
    </article>
  );
}

function CardField({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        {label}
      </p>
      {children}
    </div>
  );
}

function InlineStatusEditor({
  application,
  onUpdateApplication,
}: {
  application: JobApplication;
  onUpdateApplication: (id: string, input: ApplicationUpdate) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftStatus, setDraftStatus] = useState(application.status);

  function startEditing() {
    setDraftStatus(application.status);
    setIsEditing(true);
  }

  function confirm() {
    onUpdateApplication(application.id, { status: draftStatus });
    setIsEditing(false);
  }

  if (!isEditing) {
    return (
      <div className="flex items-center gap-2">
        <StatusBadge status={application.status} />
        <button className="icon-button h-8 w-8" onClick={startEditing} type="button">
          <Pencil aria-hidden="true" size={15} />
          <span className="sr-only">Edit status</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <select
        className="field-control min-h-9 px-2 py-1 text-xs"
        onChange={(event) =>
          setDraftStatus(event.target.value as JobApplication["status"])
        }
        value={draftStatus}
      >
        {APPLICATION_STATUSES.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
      <button className="icon-button h-8 w-8" onClick={confirm} type="button">
        <Check aria-hidden="true" size={15} />
        <span className="sr-only">Confirm status</span>
      </button>
      <button
        className="icon-button h-8 w-8"
        onClick={() => setIsEditing(false)}
        type="button"
      >
        <X aria-hidden="true" size={15} />
        <span className="sr-only">Cancel status edit</span>
      </button>
    </div>
  );
}

function InlineFollowUpEditor({
  application,
  onUpdateApplication,
}: {
  application: JobApplication;
  onUpdateApplication: (id: string, input: ApplicationUpdate) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftNeeded, setDraftNeeded] = useState(application.followUpNeeded);
  const [draftDate, setDraftDate] = useState(application.followUpDate ?? "");

  function startEditing() {
    setDraftNeeded(application.followUpNeeded);
    setDraftDate(application.followUpDate ?? "");
    setIsEditing(true);
  }

  function confirm() {
    onUpdateApplication(application.id, {
      followUpNeeded: draftNeeded,
      followUpDate: draftDate || undefined,
    });
    setIsEditing(false);
  }

  if (!isEditing) {
    return (
      <div className="flex items-start gap-2">
        <FollowUpCell application={application} />
        <button className="icon-button h-8 w-8" onClick={startEditing} type="button">
          <Pencil aria-hidden="true" size={15} />
          <span className="sr-only">Edit follow-up</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        className="field-control min-h-9 px-2 py-1 text-xs"
        onChange={(event) => setDraftDate(event.target.value)}
        type="date"
        value={draftDate}
      />
      <label className="flex items-center gap-2 text-xs font-medium text-foreground">
        <input
          checked={draftNeeded}
          className="h-4 w-4 rounded border-border text-primary"
          onChange={(event) => setDraftNeeded(event.target.checked)}
          type="checkbox"
        />
        Needed
      </label>
      <div className="flex gap-1.5">
        <button className="icon-button h-8 w-8" onClick={confirm} type="button">
          <Check aria-hidden="true" size={15} />
          <span className="sr-only">Confirm follow-up</span>
        </button>
        <button
          className="icon-button h-8 w-8"
          onClick={() => setIsEditing(false)}
          type="button"
        >
          <X aria-hidden="true" size={15} />
          <span className="sr-only">Cancel follow-up edit</span>
        </button>
      </div>
    </div>
  );
}
