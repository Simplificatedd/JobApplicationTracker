import type { JobApplication, ResumeFile } from "../../types/application";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useState,
} from "react";
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
import { formatDate, formatDateTime, formatUpdatedAt } from "../../lib/format";
import { APPLICATION_STATUSES } from "../../lib/constants";
import type { ApplicationUpdate } from "../../store/useTrackerStore";
import type { SortColumn, SortState } from "./applicationFilters";

interface ApplicationsTableProps {
  applications: JobApplication[];
  emptyBody?: string;
  emptyTitle?: string;
  enableDraggableColumnWidths: boolean;
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
  visibleApplicationColumns: string[];
}

export type ApplicationColumnId =
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
  | "deadline"
  | "deadlineEntryMode"
  | "roleStartDate"
  | "roleEndDate"
  | "followUp"
  | "followUpNeeded"
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

export const APPLICATION_TABLE_COLUMNS: Array<{
  canHide: boolean;
  id: ApplicationColumnId;
  key?: SortColumn;
  label: string;
  minWidth: number;
  width: number;
}> = [
  {
    canHide: false,
    id: "jobTitle",
    key: "jobTitle",
    label: "Job Title",
    minWidth: 96,
    width: 260,
  },
  {
    canHide: true,
    id: "jobDescription",
    key: "jobDescription",
    label: "Job Description",
    minWidth: 120,
    width: 280,
  },
  {
    canHide: true,
    id: "company",
    key: "company",
    label: "Company",
    minWidth: 72,
    width: 160,
  },
  {
    canHide: true,
    id: "location",
    key: "location",
    label: "Location",
    minWidth: 72,
    width: 140,
  },
  {
    canHide: true,
    id: "workMode",
    key: "workMode",
    label: "Work Mode",
    minWidth: 64,
    width: 115,
  },
  {
    canHide: true,
    id: "jobType",
    key: "jobType",
    label: "Job Type",
    minWidth: 68,
    width: 125,
  },
  {
    canHide: true,
    id: "source",
    key: "source",
    label: "Source",
    minWidth: 72,
    width: 160,
  },
  {
    canHide: true,
    id: "applicationUrl",
    key: "applicationUrl",
    label: "Application URL",
    minWidth: 88,
    width: 220,
  },
  {
    canHide: true,
    id: "status",
    key: "status",
    label: "Status",
    minWidth: 88,
    width: 180,
  },
  {
    canHide: true,
    id: "dateApplied",
    key: "dateApplied",
    label: "Applied Date",
    minWidth: 80,
    width: 135,
  },
  {
    canHide: true,
    id: "deadline",
    key: "deadline",
    label: "Deadline",
    minWidth: 80,
    width: 135,
  },
  {
    canHide: true,
    id: "deadlineEntryMode",
    key: "deadlineEntryMode",
    label: "Deadline Timing",
    minWidth: 96,
    width: 170,
  },
  {
    canHide: true,
    id: "roleStartDate",
    key: "roleStartDate",
    label: "Role Start Date",
    minWidth: 80,
    width: 140,
  },
  {
    canHide: true,
    id: "roleEndDate",
    key: "roleEndDate",
    label: "Role End Date",
    minWidth: 80,
    width: 140,
  },
  {
    canHide: true,
    id: "followUp",
    key: "followUp",
    label: "Follow-up",
    minWidth: 84,
    width: 150,
  },
  {
    canHide: true,
    id: "followUpNeeded",
    key: "followUpNeeded",
    label: "Follow-up Needed",
    minWidth: 92,
    width: 150,
  },
  {
    canHide: true,
    id: "followUpPromptDays",
    key: "followUpPromptDays",
    label: "Follow-up Prompt Days",
    minWidth: 104,
    width: 180,
  },
  {
    canHide: true,
    id: "interviewRound",
    key: "interviewRound",
    label: "Interview Number",
    minWidth: 92,
    width: 150,
  },
  {
    canHide: true,
    id: "interviewDateTime",
    key: "interviewDateTime",
    label: "Interview Date/Time",
    minWidth: 104,
    width: 190,
  },
  {
    canHide: true,
    id: "interviewType",
    key: "interviewType",
    label: "Interview Type",
    minWidth: 88,
    width: 145,
  },
  {
    canHide: true,
    id: "priority",
    key: "priority",
    label: "Priority",
    minWidth: 56,
    width: 115,
  },
  {
    canHide: true,
    id: "resume",
    key: "resume",
    label: "Resume",
    minWidth: 72,
    width: 150,
  },
  {
    canHide: true,
    id: "contacts",
    key: "contacts",
    label: "Contacts",
    minWidth: 56,
    width: 115,
  },
  {
    canHide: true,
    id: "coverLetterVersion",
    key: "coverLetterVersion",
    label: "Cover Letter Version",
    minWidth: 96,
    width: 190,
  },
  {
    canHide: true,
    id: "salary",
    key: "salary",
    label: "Salary / Pay",
    minWidth: 80,
    width: 160,
  },
  {
    canHide: true,
    id: "notes",
    key: "notes",
    label: "Notes",
    minWidth: 96,
    width: 240,
  },
  {
    canHide: true,
    id: "updatedAt",
    key: "updatedAt",
    label: "Last Updated",
    minWidth: 88,
    width: 150,
  },
  {
    canHide: false,
    id: "actions",
    key: "actions",
    label: "Actions",
    minWidth: 56,
    width: 100,
  },
];

const DEFAULT_COLUMN_WIDTHS = APPLICATION_TABLE_COLUMNS.reduce(
  (widths, column) => ({
    ...widths,
    [column.id]: column.width,
  }),
  {} as Record<ApplicationColumnId, number>,
);

export function ApplicationsTable({
  applications,
  emptyBody = "New entries will appear here once they are added.",
  emptyTitle = "No applications yet",
  enableDraggableColumnWidths,
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
  visibleApplicationColumns,
}: ApplicationsTableProps) {
  const [columnWidths, setColumnWidths] = useState(DEFAULT_COLUMN_WIDTHS);
  const resumeById = new Map(resumes.map((resume) => [resume.id, resume]));
  const visibleColumns = APPLICATION_TABLE_COLUMNS.filter(
    (column) =>
      !column.canHide || visibleApplicationColumns.includes(column.id),
  );
  const visibleColumnIds = visibleColumns.map((column) => column.id);
  const tableWidth = visibleColumns.reduce(
    (width, column) => width + columnWidths[column.id],
    0,
  );

  function resizeColumn(columnId: ApplicationColumnId, nextWidth: number) {
    const column = APPLICATION_TABLE_COLUMNS.find(
      (currentColumn) => currentColumn.id === columnId,
    );

    if (!column) {
      return;
    }

    setColumnWidths((current) => ({
      ...current,
      [columnId]: Math.max(column.minWidth, nextWidth),
    }));
  }

  function startColumnResize(
    columnId: ApplicationColumnId,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = columnWidths[columnId];

    function handlePointerMove(pointerEvent: PointerEvent) {
      resizeColumn(columnId, startWidth + pointerEvent.clientX - startX);
    }

    function stopColumnResize() {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", stopColumnResize);
      document.removeEventListener("pointercancel", stopColumnResize);
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", stopColumnResize);
    document.addEventListener("pointercancel", stopColumnResize);
  }

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
                visibleColumnIds={visibleColumnIds}
                resume={
                  application.resumeId
                    ? resumeById.get(application.resumeId)
                    : undefined
                }
              />
            ))}
          </div>
          <div className="hidden overflow-x-auto xl:block">
            <table
              className="table-fixed border-collapse text-left"
              style={
                {
                  minWidth: "100%",
                  width: `${tableWidth}px`,
                } as CSSProperties
              }
            >
              <colgroup>
                {visibleColumns.map((column) => (
                  <col
                    key={column.id}
                    style={{ width: `${columnWidths[column.id]}px` }}
                  />
                ))}
              </colgroup>
              <thead className="border-b border-border bg-slate-50">
                <tr>
                  {visibleColumns.map((column) => (
                    <th
                      aria-sort={
                        column.key && sort.column === column.key
                          ? sort.direction
                          : undefined
                      }
                      className="relative px-2.5 py-3 pr-4 text-xs font-semibold uppercase tracking-[0.08em] text-muted"
                      key={column.id}
                      scope="col"
                    >
                      {column.key ? (
                        <button
                          className="flex min-w-0 items-center gap-1.5 text-left hover:text-foreground"
                          onClick={() => onSortChange(column.key as SortColumn)}
                          type="button"
                        >
                          <span className="truncate">{column.label}</span>
                          <SortIcon
                            state={
                              sort.column === column.key
                                ? sort.direction
                                : "none"
                            }
                          />
                        </button>
                      ) : (
                        <span className="block truncate">{column.label}</span>
                      )}
                      {enableDraggableColumnWidths ? (
                        <button
                          aria-label={`Resize ${column.label} column`}
                          aria-orientation="vertical"
                          aria-valuemin={column.minWidth}
                          aria-valuenow={columnWidths[column.id]}
                          className="absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none bg-transparent transition after:absolute after:inset-y-2 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-border hover:bg-primary/15 hover:after:bg-primary focus-visible:bg-primary/15 focus-visible:after:bg-primary"
                          onDoubleClick={() =>
                            resizeColumn(column.id, column.width)
                          }
                          onKeyDown={(event) => {
                            if (event.key === "ArrowLeft") {
                              resizeColumn(
                                column.id,
                                columnWidths[column.id] - 16,
                              );
                            }

                            if (event.key === "ArrowRight") {
                              resizeColumn(
                                column.id,
                                columnWidths[column.id] + 16,
                              );
                            }
                          }}
                          onPointerDown={(event) =>
                            startColumnResize(column.id, event)
                          }
                          role="separator"
                          type="button"
                        />
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface">
                {applications.map((application) => (
                  <ApplicationRow
                    application={application}
                    enableDeleteActiveApplications={
                      enableDeleteActiveApplications
                    }
                    key={application.id}
                    onArchiveApplication={onArchiveApplication}
                    onDeleteApplication={onDeleteApplication}
                    onOpenApplication={onOpenApplication}
                    onOpenContacts={onOpenContacts}
                    onRestoreApplication={onRestoreApplication}
                    onUpdateApplication={onUpdateApplication}
                    visibleColumnIds={visibleColumnIds}
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
  visibleColumnIds,
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
  visibleColumnIds: ApplicationColumnId[];
}) {
  return (
    <tr className="table-row-hover align-top">
      {visibleColumnIds.map((columnId) => (
        <td className="px-2.5 py-4" key={columnId}>
          <ApplicationColumnCell
            application={application}
            columnId={columnId}
            enableDeleteActiveApplications={enableDeleteActiveApplications}
            onArchiveApplication={onArchiveApplication}
            onDeleteApplication={onDeleteApplication}
            onOpenApplication={onOpenApplication}
            onOpenContacts={onOpenContacts}
            onRestoreApplication={onRestoreApplication}
            onUpdateApplication={onUpdateApplication}
            resume={resume}
          />
        </td>
      ))}
    </tr>
  );
}

function ApplicationColumnCell({
  application,
  columnId,
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
  columnId: ApplicationColumnId;
  enableDeleteActiveApplications: boolean;
  onArchiveApplication: (applicationId: string) => void;
  onDeleteApplication: (applicationId: string) => void;
  onOpenApplication: (applicationId: string) => void;
  onOpenContacts: (applicationId: string) => void;
  onRestoreApplication: (applicationId: string) => void;
  onUpdateApplication: (id: string, input: ApplicationUpdate) => void;
  resume?: ResumeFile;
}) {
  if (columnId === "jobTitle") {
    return (
      <button
        className="block max-w-full truncate text-left text-sm font-semibold text-foreground hover:text-primary"
        onClick={() => onOpenApplication(application.id)}
        type="button"
      >
        {application.jobTitle}
      </button>
    );
  }

  if (columnId === "jobDescription") {
    return <DescriptionPreview description={application.jobDescription} />;
  }

  if (columnId === "company") {
    return <TextCell value={application.company} />;
  }

  if (columnId === "location") {
    return <TextCell value={application.location} />;
  }

  if (columnId === "workMode") {
    return <TextCell value={formatOption(application.workMode)} />;
  }

  if (columnId === "jobType") {
    return <TextCell value={formatOption(application.jobType)} />;
  }

  if (columnId === "source") {
    return <TextCell value={application.source} />;
  }

  if (columnId === "applicationUrl") {
    return <UrlCell value={application.applicationUrl} />;
  }

  if (columnId === "status") {
    return (
      <InlineStatusEditor
        application={application}
        onUpdateApplication={onUpdateApplication}
      />
    );
  }

  if (columnId === "dateApplied") {
    return <TextCell value={formatDate(application.dateApplied)} />;
  }

  if (columnId === "deadline") {
    return <TextCell value={formatDate(application.deadline)} />;
  }

  if (columnId === "deadlineEntryMode") {
    return <TextCell value={formatOption(application.deadlineEntryMode)} />;
  }

  if (columnId === "roleStartDate") {
    return <TextCell value={formatDate(application.roleStartDate)} />;
  }

  if (columnId === "roleEndDate") {
    return <TextCell value={formatDate(application.roleEndDate)} />;
  }

  if (columnId === "followUp") {
    return (
      <InlineFollowUpEditor
        application={application}
        onUpdateApplication={onUpdateApplication}
      />
    );
  }

  if (columnId === "followUpNeeded") {
    return <TextCell value={application.followUpNeeded ? "Yes" : "No"} />;
  }

  if (columnId === "followUpPromptDays") {
    return <TextCell value={`${application.followUpPromptDays ?? 7} days`} />;
  }

  if (columnId === "interviewRound") {
    return (
      <TextCell
        value={
          application.interviewRound
            ? `Interview ${application.interviewRound}`
            : undefined
        }
      />
    );
  }

  if (columnId === "interviewDateTime") {
    return <InterviewCell application={application} />;
  }

  if (columnId === "interviewType") {
    return <TextCell value={formatOption(application.interviewType)} />;
  }

  if (columnId === "priority") {
    return <TextCell value={formatOption(application.priority)} />;
  }

  if (columnId === "resume") {
    return <ResumeCell resume={resume} />;
  }

  if (columnId === "contacts") {
    return (
      <ContactsButton
        count={application.contactsCount}
        onClick={() => onOpenContacts(application.id)}
      />
    );
  }

  if (columnId === "coverLetterVersion") {
    return <TextCell value={application.coverLetterVersion} />;
  }

  if (columnId === "salary") {
    return <TextCell value={application.salary} />;
  }

  if (columnId === "notes") {
    return <LongTextCell value={application.notes} />;
  }

  if (columnId === "updatedAt") {
    return <TextCell value={formatUpdatedAt(application.updatedAt)} />;
  }

  return (
    <RowActionsMenu
      application={application}
      enableDeleteActiveApplications={enableDeleteActiveApplications}
      onArchiveApplication={onArchiveApplication}
      onDeleteApplication={onDeleteApplication}
      onRestoreApplication={onRestoreApplication}
    />
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
  visibleColumnIds,
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
  visibleColumnIds: ApplicationColumnId[];
}) {
  const isColumnVisible = (columnId: ApplicationColumnId) =>
    visibleColumnIds.includes(columnId);
  const detailColumns = visibleColumnIds.filter(
    (columnId) =>
      !["jobTitle", "jobDescription", "company", "actions"].includes(columnId),
  );

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
          {isColumnVisible("company") ? (
            <p className="mt-1 truncate text-xs font-medium text-muted">
              {application.company || "Company blank"}
            </p>
          ) : null}
        </div>
        <RowActionsMenu
          application={application}
          enableDeleteActiveApplications={enableDeleteActiveApplications}
          onArchiveApplication={onArchiveApplication}
          onDeleteApplication={onDeleteApplication}
          onRestoreApplication={onRestoreApplication}
        />
      </div>

      {isColumnVisible("jobDescription") ? (
        <DescriptionPreview description={application.jobDescription} />
      ) : null}

      <div className="mt-4 grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
        {detailColumns.map((columnId) => {
          const column = APPLICATION_TABLE_COLUMNS.find(
            (currentColumn) => currentColumn.id === columnId,
          );

          if (!column) {
            return null;
          }

          return (
            <CardField key={column.id} label={column.label}>
              <ApplicationColumnCell
                application={application}
                columnId={column.id}
                enableDeleteActiveApplications={enableDeleteActiveApplications}
                onArchiveApplication={onArchiveApplication}
                onDeleteApplication={onDeleteApplication}
                onOpenApplication={onOpenApplication}
                onOpenContacts={onOpenContacts}
                onRestoreApplication={onRestoreApplication}
                onUpdateApplication={onUpdateApplication}
                resume={resume}
              />
            </CardField>
          );
        })}
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

function TextCell({ value }: { value?: string | number }) {
  return (
    <p className="truncate text-sm text-foreground">
      {value === undefined || value === "" ? "Blank" : value}
    </p>
  );
}

function LongTextCell({ value }: { value?: string }) {
  return (
    <p className="line-clamp-2 text-sm leading-5 text-foreground">
      {value || "Blank"}
    </p>
  );
}

function UrlCell({ value }: { value?: string }) {
  if (!value) {
    return <TextCell value={undefined} />;
  }

  return (
    <a
      className="block truncate text-sm font-medium text-primary hover:text-blue-700"
      href={value}
      rel="noreferrer"
      target="_blank"
    >
      {value}
    </a>
  );
}

function formatOption(value?: string) {
  if (!value || value === "unknown") {
    return undefined;
  }

  return value
    .split(/[-_]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
