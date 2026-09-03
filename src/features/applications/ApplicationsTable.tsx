import type { JobApplication, ResumeFile } from "../../types/application";
import { useState } from "react";
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

interface ApplicationsTableProps {
  applications: JobApplication[];
  enableDeleteActiveApplications: boolean;
  onArchiveApplication: (applicationId: string) => void;
  onDeleteApplication: (applicationId: string) => void;
  onOpenApplication: (applicationId: string) => void;
  onRestoreApplication: (applicationId: string) => void;
  onUpdateApplication: (id: string, input: ApplicationUpdate) => void;
  resumes: ResumeFile[];
}

const columns: Array<{
  label: string;
  sort?: "ascending" | "descending" | "none";
}> = [
  { label: "Job Title", sort: "ascending" },
  { label: "Company", sort: "none" },
  { label: "Status", sort: "none" },
  { label: "Follow-up", sort: "descending" },
  { label: "Interview Date/Time", sort: "none" },
  { label: "Resume" },
  { label: "Contacts" },
  { label: "Last Updated", sort: "descending" },
  { label: "Actions" },
];

export function ApplicationsTable({
  applications,
  enableDeleteActiveApplications,
  onArchiveApplication,
  onDeleteApplication,
  onOpenApplication,
  onRestoreApplication,
  onUpdateApplication,
  resumes,
}: ApplicationsTableProps) {
  const resumeById = new Map(resumes.map((resume) => [resume.id, resume]));

  return (
    <section className="surface-panel overflow-hidden rounded-lg">
      {applications.length === 0 ? (
        <div className="flex min-h-[280px] items-center justify-center px-6 py-12 text-center">
          <div className="max-w-sm">
            <h2 className="text-xl font-semibold text-foreground">
              No applications yet
            </h2>
            <p className="mt-2 text-sm text-muted">
              New entries will appear here once they are added.
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[1120px] table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[260px]" />
              <col className="w-[150px]" />
              <col className="w-[180px]" />
              <col className="w-[150px]" />
              <col className="w-[185px]" />
              <col className="w-[170px]" />
              <col className="w-[120px]" />
              <col className="w-[155px]" />
              <col className="w-[90px]" />
            </colgroup>
            <thead className="border-b border-border bg-slate-50">
              <tr>
                {columns.map((column) => (
                  <th
                    className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted"
                    key={column.label}
                    scope="col"
                  >
                    <span className="flex items-center gap-1.5">
                      <span>{column.label}</span>
                      {column.sort ? <SortIcon state={column.sort} /> : null}
                    </span>
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
  onRestoreApplication,
  onUpdateApplication,
  resume,
}: {
  application: JobApplication;
  enableDeleteActiveApplications: boolean;
  onArchiveApplication: (applicationId: string) => void;
  onDeleteApplication: (applicationId: string) => void;
  onOpenApplication: (applicationId: string) => void;
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
        <ContactsButton count={application.contactsCount} />
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
