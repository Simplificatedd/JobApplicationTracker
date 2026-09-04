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
import { formatUpdatedAt } from "../../lib/format";
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
}

type ColumnId =
  | "jobTitle"
  | "company"
  | "status"
  | "followUp"
  | "interview"
  | "resume"
  | "contacts"
  | "updatedAt"
  | "actions";

const columns: Array<{
  id: ColumnId;
  key?: SortColumn;
  label: string;
  minWidth: number;
  width: number;
}> = [
  {
    id: "jobTitle",
    key: "jobTitle",
    label: "Job Title",
    minWidth: 180,
    width: 260,
  },
  {
    id: "company",
    key: "company",
    label: "Company",
    minWidth: 130,
    width: 160,
  },
  {
    id: "status",
    key: "status",
    label: "Status",
    minWidth: 150,
    width: 180,
  },
  {
    id: "followUp",
    key: "followUpDate",
    label: "Follow-up",
    minWidth: 130,
    width: 150,
  },
  {
    id: "interview",
    key: "interviewDateTime",
    label: "Interview Date/Time",
    minWidth: 150,
    width: 190,
  },
  { id: "resume", label: "Resume", minWidth: 120, width: 150 },
  { id: "contacts", label: "Contacts", minWidth: 95, width: 115 },
  {
    id: "updatedAt",
    key: "updatedAt",
    label: "Last Updated",
    minWidth: 125,
    width: 150,
  },
  { id: "actions", label: "Actions", minWidth: 90, width: 100 },
];

const DEFAULT_COLUMN_WIDTHS = columns.reduce(
  (widths, column) => ({
    ...widths,
    [column.id]: column.width,
  }),
  {} as Record<ColumnId, number>,
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
}: ApplicationsTableProps) {
  const [columnWidths, setColumnWidths] = useState(DEFAULT_COLUMN_WIDTHS);
  const resumeById = new Map(resumes.map((resume) => [resume.id, resume]));
  const tableWidth = columns.reduce(
    (width, column) => width + columnWidths[column.id],
    0,
  );

  function resizeColumn(columnId: ColumnId, nextWidth: number) {
    const column = columns.find((currentColumn) => currentColumn.id === columnId);

    if (!column) {
      return;
    }

    setColumnWidths((current) => ({
      ...current,
      [columnId]: Math.max(column.minWidth, nextWidth),
    }));
  }

  function startColumnResize(
    columnId: ColumnId,
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
                {columns.map((column) => (
                  <col
                    key={column.id}
                    style={{ width: `${columnWidths[column.id]}px` }}
                  />
                ))}
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
                      className="relative px-4 py-3 pr-5 text-xs font-semibold uppercase tracking-[0.08em] text-muted"
                      key={column.id}
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
                              sort.column === column.key
                                ? sort.direction
                                : "none"
                            }
                          />
                        </button>
                      ) : (
                        <span>{column.label}</span>
                      )}
                      {enableDraggableColumnWidths ? (
                        <button
                          aria-label={`Resize ${column.label} column`}
                          aria-orientation="vertical"
                          aria-valuemin={column.minWidth}
                          aria-valuenow={columnWidths[column.id]}
                          className="absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none bg-transparent transition hover:bg-primary/15 focus-visible:bg-primary/15"
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
