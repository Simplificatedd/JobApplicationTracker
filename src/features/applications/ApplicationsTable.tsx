import type { JobApplication, ResumeFile } from "../../types/application";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowDownWideNarrow,
  ArrowUpDown,
  ArrowUpWideNarrow,
  RotateCcw,
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
import { formatDate, formatUpdatedAt } from "../../lib/format";
import type { ApplicationUpdate } from "../../store/useTrackerStore";
import type { SortColumn, SortState } from "./applicationFilters";

interface ApplicationsTableProps {
  applications: JobApplication[];
  columnWidths: ApplicationColumnWidths;
  emptyBody?: string;
  emptyTitle?: string;
  enableDraggableColumnWidths: boolean;
  enableDeleteActiveApplications: boolean;
  onArchiveApplication: (applicationId: string) => void;
  onDeleteApplication: (applicationId: string) => void;
  onOpenApplication: (applicationId: string) => void;
  onOpenContacts: (applicationId: string) => void;
  onColumnWidthsChange: (widths: ApplicationColumnWidths) => void;
  onRestoreApplication: (applicationId: string) => void;
  onSortChange: (column: SortColumn) => void;
  onUpdateApplication: (applicationId: string, input: ApplicationUpdate) => void;
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

export type ApplicationColumnWidths = Record<ApplicationColumnId, number>;

export const DEFAULT_COLUMN_WIDTHS = APPLICATION_TABLE_COLUMNS.reduce(
  (widths, column) => ({
    ...widths,
    [column.id]: column.width,
  }),
  {} as ApplicationColumnWidths,
);

export function ApplicationsTable({
  applications,
  columnWidths,
  emptyBody = "New entries will appear here once they are added.",
  emptyTitle = "No applications yet",
  enableDraggableColumnWidths,
  enableDeleteActiveApplications,
  onArchiveApplication,
  onDeleteApplication,
  onOpenApplication,
  onOpenContacts,
  onColumnWidthsChange,
  onRestoreApplication,
  onSortChange,
  onUpdateApplication,
  resumes,
  sort,
  visibleApplicationColumns,
}: ApplicationsTableProps) {
  const [tableViewportWidth, setTableViewportWidth] = useState(0);
  const tableViewportRef = useRef<HTMLDivElement>(null);
  const resumeById = new Map(resumes.map((resume) => [resume.id, resume]));
  const visibleColumns = APPLICATION_TABLE_COLUMNS.filter(
    (column) =>
      !column.canHide || visibleApplicationColumns.includes(column.id),
  );
  const visibleColumnIds = visibleColumns.map((column) => column.id);
  const visibleColumnKey = visibleColumnIds.join("|");
  const tableWidth = visibleColumns.reduce(
    (width, column) => width + columnWidths[column.id],
    0,
  );

  useEffect(() => {
    const viewport = tableViewportRef.current;

    if (!viewport) {
      return;
    }

    const viewportElement = viewport;

    function updateTableViewportWidth() {
      setTableViewportWidth(viewportElement.clientWidth);
    }

    updateTableViewportWidth();

    const resizeObserver = new ResizeObserver(updateTableViewportWidth);
    resizeObserver.observe(viewportElement);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (tableViewportWidth <= 0) {
      return;
    }

    onColumnWidthsChange(
      stretchColumnWidthsToViewport(
        visibleColumns,
        columnWidths,
        tableViewportWidth,
      ),
    );
    // Width changes should only be recalculated when the viewport or visible
    // column set changes, not after this effect writes the next widths.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableViewportWidth, visibleColumnKey]);

  function resizeColumnPair(
    leftColumnId: ApplicationColumnId,
    rightColumnId: ApplicationColumnId,
    delta: number,
  ) {
    const leftColumn = APPLICATION_TABLE_COLUMNS.find(
      (currentColumn) => currentColumn.id === leftColumnId,
    );
    const rightColumn = APPLICATION_TABLE_COLUMNS.find(
      (currentColumn) => currentColumn.id === rightColumnId,
    );

    if (!leftColumn || !rightColumn) {
      return;
    }

    updateColumnWidths((current) => {
      const nextWidths = getColumnPairWidths({
        delta,
        leftColumn,
        leftWidth: current[leftColumnId],
        rightColumn,
        rightWidth: current[rightColumnId],
      });

      return {
        ...current,
        [leftColumnId]: nextWidths.leftWidth,
        [rightColumnId]: nextWidths.rightWidth,
      };
    });
  }

  function resetColumnPair(
    leftColumn: (typeof APPLICATION_TABLE_COLUMNS)[number],
    rightColumn: (typeof APPLICATION_TABLE_COLUMNS)[number],
  ) {
    updateColumnWidths((current) => {
      const pairWidth = current[leftColumn.id] + current[rightColumn.id];
      const defaultPairWidth = leftColumn.width + rightColumn.width;
      const leftTargetWidth = Math.round(
        (pairWidth * leftColumn.width) / defaultPairWidth,
      );
      const nextWidths = getColumnPairWidths({
        delta: leftTargetWidth - current[leftColumn.id],
        leftColumn,
        leftWidth: current[leftColumn.id],
        rightColumn,
        rightWidth: current[rightColumn.id],
      });

      return {
        ...current,
        [leftColumn.id]: nextWidths.leftWidth,
        [rightColumn.id]: nextWidths.rightWidth,
      };
    });
  }

  function resetColumnWidths() {
    onColumnWidthsChange(
      stretchColumnWidthsToViewport(
        visibleColumns,
        DEFAULT_COLUMN_WIDTHS,
        tableViewportRef.current?.clientWidth ?? tableViewportWidth,
      ),
    );
  }

  function updateColumnWidths(
    updater: (current: ApplicationColumnWidths) => ApplicationColumnWidths,
  ) {
    onColumnWidthsChange(updater(columnWidths));
  }

  function startColumnResize(
    leftColumnId: ApplicationColumnId,
    rightColumnId: ApplicationColumnId,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startLeftWidth = columnWidths[leftColumnId];
    const startRightWidth = columnWidths[rightColumnId];
    const leftColumn = APPLICATION_TABLE_COLUMNS.find(
      (currentColumn) => currentColumn.id === leftColumnId,
    );
    const rightColumn = APPLICATION_TABLE_COLUMNS.find(
      (currentColumn) => currentColumn.id === rightColumnId,
    );

    if (!leftColumn || !rightColumn) {
      return;
    }

    const leftColumnDef = leftColumn;
    const rightColumnDef = rightColumn;

    function handlePointerMove(pointerEvent: PointerEvent) {
      const nextWidths = getColumnPairWidths({
        delta: pointerEvent.clientX - startX,
        leftColumn: leftColumnDef,
        leftWidth: startLeftWidth,
        rightColumn: rightColumnDef,
        rightWidth: startRightWidth,
      });

      updateColumnWidths((current) => ({
        ...current,
        [leftColumnId]: nextWidths.leftWidth,
        [rightColumnId]: nextWidths.rightWidth,
      }));
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
          {enableDraggableColumnWidths ? (
            <div className="hidden items-center justify-end border-b border-border px-3 py-2 xl:flex">
              <button
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-foreground hover:bg-slate-50"
                onClick={resetColumnWidths}
                type="button"
              >
                <RotateCcw aria-hidden="true" size={16} />
                Reset column sizes
              </button>
            </div>
          ) : null}
          <div
            className="hidden min-w-0 overflow-x-auto xl:block"
            ref={tableViewportRef}
          >
            <table
              className="table-fixed border-collapse text-left"
              style={{ width: `${tableWidth}px` }}
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
                  {visibleColumns.map((column, columnIndex) => {
                    const resizeHandle = getResizeHandle(
                      visibleColumns,
                      columnIndex,
                      enableDraggableColumnWidths,
                    );

                    return (
                      <th
                        aria-sort={
                          column.key && sort.column === column.key
                            ? sort.direction
                            : undefined
                        }
                        className={getHeaderClassName()}
                        key={column.id}
                        scope="col"
                      >
                        {column.key ? (
                          <button
                            className="flex w-full min-w-0 items-center justify-center gap-1.5 overflow-hidden text-center hover:text-foreground"
                            onClick={() =>
                              onSortChange(column.key as SortColumn)
                            }
                            type="button"
                          >
                            <span className="min-w-0 truncate">
                              {column.label}
                            </span>
                            <SortIcon
                              state={
                                sort.column === column.key
                                  ? sort.direction
                                  : "none"
                              }
                            />
                          </button>
                        ) : (
                          <span className="block min-w-0 truncate">
                            {column.label}
                          </span>
                        )}
                        {resizeHandle ? (
                          <button
                            aria-label={`Resize ${resizeHandle.leftColumn.label} and ${resizeHandle.rightColumn.label} columns`}
                            aria-orientation="vertical"
                            aria-valuemin={resizeHandle.leftColumn.minWidth}
                            aria-valuenow={
                              columnWidths[resizeHandle.leftColumn.id]
                            }
                            className="absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none bg-transparent transition after:absolute after:inset-y-2 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-border hover:bg-primary/15 hover:after:bg-primary focus-visible:bg-primary/15 focus-visible:after:bg-primary"
                            onDoubleClick={() =>
                              resetColumnPair(
                                resizeHandle.leftColumn,
                                resizeHandle.rightColumn,
                              )
                            }
                            onKeyDown={(event) => {
                              if (event.key === "ArrowLeft") {
                                resizeColumnPair(
                                  resizeHandle.leftColumn.id,
                                  resizeHandle.rightColumn.id,
                                  -16,
                                );
                              }

                              if (event.key === "ArrowRight") {
                                resizeColumnPair(
                                  resizeHandle.leftColumn.id,
                                  resizeHandle.rightColumn.id,
                                  16,
                                );
                              }
                            }}
                            onPointerDown={(event) =>
                              startColumnResize(
                                resizeHandle.leftColumn.id,
                                resizeHandle.rightColumn.id,
                                event,
                              )
                            }
                            role="separator"
                            type="button"
                          />
                        ) : null}
                      </th>
                    );
                  })}
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

function stretchColumnWidthsToViewport(
  visibleColumns: typeof APPLICATION_TABLE_COLUMNS,
  columnWidths: Record<ApplicationColumnId, number>,
  viewportWidth: number,
) {
  const baseTableWidth = visibleColumns.reduce(
    (width, column) => width + columnWidths[column.id],
    0,
  );
  const extraWidth = Math.max(0, Math.floor(viewportWidth - baseTableWidth));

  if (extraWidth === 0 || visibleColumns.length === 0) {
    return columnWidths;
  }

  const stretchedWidths = { ...columnWidths };
  const stretchBasis = visibleColumns.reduce(
    (width, column) => width + columnWidths[column.id],
    0,
  );

  if (stretchBasis === 0) {
    return stretchedWidths;
  }

  let assignedExtraWidth = 0;

  visibleColumns.forEach((column, index) => {
    const isLastStretchColumn = index === visibleColumns.length - 1;
    const columnExtraWidth = isLastStretchColumn
      ? extraWidth - assignedExtraWidth
      : Math.floor((extraWidth * columnWidths[column.id]) / stretchBasis);

    assignedExtraWidth += columnExtraWidth;
    stretchedWidths[column.id] = columnWidths[column.id] + columnExtraWidth;
  });

  return stretchedWidths;
}

function getColumnPairWidths({
  delta,
  leftColumn,
  leftWidth,
  rightColumn,
  rightWidth,
}: {
  delta: number;
  leftColumn: (typeof APPLICATION_TABLE_COLUMNS)[number];
  leftWidth: number;
  rightColumn: (typeof APPLICATION_TABLE_COLUMNS)[number];
  rightWidth: number;
}) {
  const minimumDelta = leftColumn.minWidth - leftWidth;
  const maximumDelta = rightWidth - rightColumn.minWidth;
  const clampedDelta = Math.max(
    minimumDelta,
    Math.min(maximumDelta, delta),
  );

  return {
    leftWidth: leftWidth + clampedDelta,
    rightWidth: rightWidth - clampedDelta,
  };
}

function SortIcon({
  state,
}: {
  state: "ascending" | "descending" | "none";
}) {
  if (state === "ascending") {
    return (
      <ArrowUpWideNarrow aria-hidden="true" className="shrink-0" size={14} />
    );
  }

  if (state === "descending") {
    return (
      <ArrowDownWideNarrow aria-hidden="true" className="shrink-0" size={14} />
    );
  }

  return <ArrowUpDown aria-hidden="true" className="shrink-0" size={14} />;
}

function getHeaderClassName() {
  return "relative overflow-hidden px-2.5 py-3 pr-4 text-center text-xs font-semibold uppercase tracking-[0.08em] text-muted";
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
  onUpdateApplication: (applicationId: string, input: ApplicationUpdate) => void;
  resume?: ResumeFile;
  visibleColumnIds: ApplicationColumnId[];
}) {
  function openFromRowClick(event: ReactMouseEvent<HTMLTableRowElement>) {
    if (!shouldIgnoreEntryOpen(event.target, event.currentTarget)) {
      event.currentTarget.blur();
      onOpenApplication(application.id);
    }
  }

  function openFromRowKeyDown(event: ReactKeyboardEvent<HTMLTableRowElement>) {
    if (
      (event.key === "Enter" || event.key === " ") &&
      !shouldIgnoreEntryOpen(event.target, event.currentTarget)
    ) {
      event.preventDefault();
      onOpenApplication(application.id);
    }
  }

  return (
    <tr
      aria-label={`Open details for ${application.jobTitle}`}
      className="table-row-hover cursor-pointer align-top focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      onClick={openFromRowClick}
      onKeyDown={openFromRowKeyDown}
      role="button"
      tabIndex={0}
    >
      {visibleColumnIds.map((columnId) => {
        return (
          <td className={getCellClassName(columnId)} key={columnId}>
            <div className={getCellContentClassName(columnId)}>
              <ApplicationColumnCell
                application={application}
                columnId={columnId}
                enableDeleteActiveApplications={enableDeleteActiveApplications}
                onArchiveApplication={onArchiveApplication}
                onDeleteApplication={onDeleteApplication}
                onOpenContacts={onOpenContacts}
                onRestoreApplication={onRestoreApplication}
                onUpdateApplication={onUpdateApplication}
                resume={resume}
              />
            </div>
          </td>
        );
      })}
    </tr>
  );
}

function getResizeHandle(
  visibleColumns: typeof APPLICATION_TABLE_COLUMNS,
  columnIndex: number,
  enableDraggableColumnWidths: boolean,
) {
  const leftColumn = visibleColumns[columnIndex];
  const nextColumn = visibleColumns[columnIndex + 1];

  if (!enableDraggableColumnWidths || !leftColumn || !nextColumn) {
    return null;
  }

  return {
    leftColumn,
    rightColumn: nextColumn,
  };
}

function getCellClassName(columnId: ApplicationColumnId) {
  const isActions = columnId === "actions";
  const isUtilityCell = isActions || columnId === "contacts";

  return [
    "py-4 align-top",
    isUtilityCell ? "px-1" : "overflow-hidden px-2.5",
    isActions ? "overflow-visible" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function getCellContentClassName(columnId: ApplicationColumnId) {
  const isUtilityCell = columnId === "actions" || columnId === "contacts";

  return [
    "min-w-0 max-w-full",
    isUtilityCell
      ? "flex justify-center"
      : "overflow-hidden",
  ].join(" ");
}

function ApplicationColumnCell({
  application,
  columnId,
  enableDeleteActiveApplications,
  onArchiveApplication,
  onDeleteApplication,
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
  onOpenContacts: (applicationId: string) => void;
  onRestoreApplication: (applicationId: string) => void;
  onUpdateApplication: (applicationId: string, input: ApplicationUpdate) => void;
  resume?: ResumeFile;
}) {
  if (columnId === "jobTitle") {
    return (
      <span className="block max-w-full truncate text-left text-sm font-semibold text-foreground">
        {application.jobTitle}
      </span>
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
    return <StatusBadge status={application.status} />;
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
    return <FollowUpCell application={application} />;
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
      onUpdateApplication={onUpdateApplication}
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
  onUpdateApplication: (applicationId: string, input: ApplicationUpdate) => void;
  resume?: ResumeFile;
  visibleColumnIds: ApplicationColumnId[];
}) {
  function openFromCardClick(event: ReactMouseEvent<HTMLElement>) {
    if (!shouldIgnoreEntryOpen(event.target, event.currentTarget)) {
      event.currentTarget.blur();
      onOpenApplication(application.id);
    }
  }

  function openFromCardKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (
      (event.key === "Enter" || event.key === " ") &&
      !shouldIgnoreEntryOpen(event.target, event.currentTarget)
    ) {
      event.preventDefault();
      onOpenApplication(application.id);
    }
  }

  const isColumnVisible = (columnId: ApplicationColumnId) =>
    visibleColumnIds.includes(columnId);
  const detailColumns = visibleColumnIds.filter(
    (columnId) =>
      !["jobTitle", "jobDescription", "company", "actions"].includes(columnId),
  );

  return (
    <article
      aria-label={`Open details for ${application.jobTitle}`}
      className="cursor-pointer rounded-lg border border-border bg-surface px-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      onClick={openFromCardClick}
      onKeyDown={openFromCardKeyDown}
      role="button"
      tabIndex={0}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="block max-w-full text-left text-sm font-semibold leading-5 text-foreground">
            {application.jobTitle}
          </p>
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
          onUpdateApplication={onUpdateApplication}
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

function shouldIgnoreEntryOpen(
  target: EventTarget,
  currentTarget: EventTarget,
) {
  if (!(target instanceof Element) || !(currentTarget instanceof Element)) {
    return false;
  }

  const interactiveElement = target.closest(
    "a,button,input,select,textarea,[role='button'],[role='menuitem'],[role='separator']",
  );

  return Boolean(interactiveElement && interactiveElement !== currentTarget);
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
