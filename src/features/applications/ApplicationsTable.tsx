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
  CalendarClock,
  ArrowUpWideNarrow,
} from "lucide-react";
import {
  ContactsButton,
  DescriptionPreview,
  FollowUpAutoResetCell,
  FollowUpCell,
  InterviewCell,
  ResumeCell,
  RowActionsMenu,
  StatusQuickEditCell,
} from "./TableCells";
import {
  formatDate,
  formatDateTime,
  formatDeadline,
  formatUpdatedAt,
} from "../../lib/format";
import type { NotificationType, ReminderNotification } from "../../lib/reminders";
import { StatusBadge } from "./StatusBadge";
import { getInterviewTypeLabel } from "../../lib/constants";
import { getSafeHttpUrl } from "../../lib/urls";
import { getScrollEdges } from "../../hooks/useScrollStrip";
import type { ApplicationUpdate } from "../../store/useTrackerStore";
import type { SortColumn, SortState } from "./applicationFilters";

interface ApplicationsTableProps {
  applications: JobApplication[];
  coverLetters: ResumeFile[];
  columnWidths: ApplicationColumnWidths;
  emptyBody?: string;
  emptyTitle?: string;
  enableDraggableColumnWidths: boolean;
  enableDeleteActiveApplications: boolean;
  // Cross-archive search results label archived entries.
  markArchivedApplications?: boolean;
  onArchiveApplication: (applicationId: string) => void;
  onDeleteApplication: (applicationId: string) => void;
  onOpenApplication: (applicationId: string) => void;
  onOpenContacts: (applicationId: string) => void;
  onPreviewResume: (resume: ResumeFile) => Promise<void>;
  onColumnWidthsChange: (widths: ApplicationColumnWidths) => void;
  onRestoreApplication: (applicationId: string) => void;
  onSortChange: (column: SortColumn) => void;
  onUpdateApplication: (applicationId: string, input: ApplicationUpdate) => void;
  resumes: ResumeFile[];
  sort: SortState;
  // Phone rows show each application's next event, keyed by application id.
  upcomingEvents?: Map<string, ReminderNotification>;
  visibleApplicationColumns: string[];
  workingResumeId: string | null;
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
  | "offerDeadline"
  | "roleStartDate"
  | "roleEndDate"
  | "followUp"
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
    canHide: false,
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
    id: "offerDeadline",
    key: "offerDeadline",
    label: "Offer Deadline",
    minWidth: 96,
    width: 160,
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
    id: "followUpPromptDays",
    key: "followUpPromptDays",
    label: "Auto-reset",
    minWidth: 104,
    width: 180,
  },
  {
    canHide: true,
    id: "interviewRound",
    key: "interviewRound",
    label: "Round",
    minWidth: 92,
    width: 150,
  },
  {
    canHide: true,
    id: "interviewDateTime",
    key: "interviewDateTime",
    label: "Scheduled Date/Time",
    minWidth: 104,
    width: 190,
  },
  {
    canHide: true,
    id: "interviewType",
    key: "interviewType",
    label: "Stage Type",
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
    label: "Cover Letter",
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
  coverLetters,
  columnWidths: savedColumnWidths,
  emptyBody = "New entries will appear here once they are added.",
  emptyTitle = "No applications yet",
  enableDraggableColumnWidths,
  enableDeleteActiveApplications,
  markArchivedApplications = false,
  onArchiveApplication,
  onDeleteApplication,
  onOpenApplication,
  onOpenContacts,
  onPreviewResume,
  onColumnWidthsChange,
  onRestoreApplication,
  onSortChange,
  onUpdateApplication,
  resumes,
  sort,
  upcomingEvents,
  visibleApplicationColumns,
  workingResumeId,
}: ApplicationsTableProps) {
  const [tableViewportWidth, setTableViewportWidth] = useState(0);
  // Widths shown while dragging; they are saved once the pointer is released.
  const [draftColumnWidths, setDraftColumnWidths] =
    useState<ApplicationColumnWidths | null>(null);
  // The user's own widths. Stretching to fill the viewport is applied only for
  // display below, so it is never saved and can shrink back on narrower screens.
  const baseColumnWidths = draftColumnWidths ?? savedColumnWidths;
  const tableViewportRef = useRef<HTMLDivElement>(null);
  const resumeById = new Map(resumes.map((resume) => [resume.id, resume]));
  const coverLetterById = new Map(
    coverLetters.map((coverLetter) => [coverLetter.id, coverLetter]),
  );
  const visibleColumns = APPLICATION_TABLE_COLUMNS.filter(
    (column) =>
      !column.canHide || visibleApplicationColumns.includes(column.id),
  );
  const visibleColumnIds = visibleColumns.map((column) => column.id);
  const columnWidths = stretchColumnWidthsToViewport(
    visibleColumns,
    baseColumnWidths,
    tableViewportWidth,
  );
  const tableWidth = visibleColumns.reduce(
    (width, column) => width + columnWidths[column.id],
    0,
  );
  // Whether content is scrolled under the pinned Job Title (before) or
  // Actions (after) column, so those columns can show an edge.
  const [scrollEdges, setScrollEdges] = useState({
    hasMoreAfter: false,
    hasMoreBefore: false,
  });

  function updateScrollEdges() {
    const viewport = tableViewportRef.current;

    if (!viewport) {
      return;
    }

    const next = getScrollEdges(viewport);
    setScrollEdges((current) =>
      current.hasMoreAfter === next.hasMoreAfter &&
      current.hasMoreBefore === next.hasMoreBefore
        ? current
        : next,
    );
  }

  // The scroll extent also changes when the table or its viewport resizes, and
  // the viewport remounts at scrollLeft 0 after an empty result.
  const hasApplications = applications.length > 0;
  useEffect(updateScrollEdges, [hasApplications, tableWidth, tableViewportWidth]);

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

  // The base widths that make `column` display at `displayedWidth` once the
  // other columns are stretched, so a resize lands where the pointer is.
  function withDisplayedWidth(
    baseWidths: ApplicationColumnWidths,
    column: (typeof APPLICATION_TABLE_COLUMNS)[number],
    displayedWidth: number,
  ) {
    return {
      ...baseWidths,
      [column.id]: clampColumnWidth(
        column,
        getBaseWidthForDisplayedWidth(
          visibleColumns,
          baseWidths,
          column.id,
          displayedWidth,
          tableViewportWidth,
        ),
      ),
    };
  }

  function resizeColumn(
    column: (typeof APPLICATION_TABLE_COLUMNS)[number],
    displayedWidth: number,
  ) {
    onColumnWidthsChange(
      withDisplayedWidth(savedColumnWidths, column, displayedWidth),
    );
  }

  function resetColumnWidth(column: (typeof APPLICATION_TABLE_COLUMNS)[number]) {
    onColumnWidthsChange({ ...savedColumnWidths, [column.id]: column.width });
  }

  function startColumnResize(
    column: (typeof APPLICATION_TABLE_COLUMNS)[number],
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startBaseWidths = savedColumnWidths;
    const startDisplayedWidth = columnWidths[column.id];
    let latestWidths: ApplicationColumnWidths | null = null;

    function handlePointerMove(pointerEvent: PointerEvent) {
      latestWidths = withDisplayedWidth(
        startBaseWidths,
        column,
        startDisplayedWidth + pointerEvent.clientX - startX,
      );
      setDraftColumnWidths(latestWidths);
    }

    function stopColumnResize() {
      if (latestWidths) {
        onColumnWidthsChange(latestWidths);
      }

      setDraftColumnWidths(null);
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
    <section className={`surface-panel overflow-hidden rounded-lg xl:flex xl:flex-col ${applications.length > 0 ? "xl:min-h-64" : "xl:min-h-0 xl:overflow-y-auto"}`}>
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
          <ul className="divide-y divide-border md:hidden">
            {applications.map((application) => (
              <MobileApplicationRow
                application={application}
                key={application.id}
                onOpenApplication={onOpenApplication}
                showArchivedBadge={
                  markArchivedApplications && Boolean(application.archivedAt)
                }
                upcomingEvent={upcomingEvents?.get(application.id)}
              />
            ))}
          </ul>
          <div className="hidden gap-3 p-3 md:grid lg:grid-cols-2 xl:hidden">
            {applications.map((application) => (
              <ApplicationCard
                application={application}
                coverLetter={
                  application.coverLetterId
                    ? coverLetterById.get(application.coverLetterId)
                    : undefined
                }
                enableDeleteActiveApplications={enableDeleteActiveApplications}
                key={application.id}
                onArchiveApplication={onArchiveApplication}
                onDeleteApplication={onDeleteApplication}
                onOpenApplication={onOpenApplication}
                onOpenContacts={onOpenContacts}
                onPreviewResume={onPreviewResume}
                onRestoreApplication={onRestoreApplication}
                onUpdateApplication={onUpdateApplication}
                showArchivedBadge={
                  markArchivedApplications && Boolean(application.archivedAt)
                }
                visibleColumnIds={visibleColumnIds}
                resume={
                  application.resumeId
                    ? resumeById.get(application.resumeId)
                    : undefined
                }
                workingResumeId={workingResumeId}
              />
            ))}
          </div>
          <div
            className="hidden min-h-0 min-w-0 overflow-auto overscroll-contain xl:block xl:flex-1"
            data-pinned-edge-end={scrollEdges.hasMoreAfter}
            data-pinned-edge-start={scrollEdges.hasMoreBefore}
            onScroll={updateScrollEdges}
            ref={tableViewportRef}
          >
            <table
              className="table-fixed border-separate border-spacing-0 text-left"
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
              <thead>
                <tr>
                  {visibleColumns.map((column) => {
                    return (
                      <th
                        aria-sort={
                          column.key && sort.column === column.key
                            ? sort.direction
                            : undefined
                        }
                        className={getHeaderClassName(column.id)}
                        key={column.id}
                        scope="col"
                        title={column.label}
                      >
                        {column.key ? (
                          <button
                            className={`flex w-full min-w-0 items-center gap-1.5 overflow-hidden hover:text-foreground ${
                              isUtilityColumn(column.id)
                                ? "justify-center text-center"
                                : "justify-start text-left"
                            }`}
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
                        {enableDraggableColumnWidths ? (
                          <button
                            aria-label={`Resize ${column.label} column`}
                            aria-orientation="vertical"
                            aria-valuemin={column.minWidth}
                            aria-valuenow={columnWidths[column.id]}
                            className="absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none bg-transparent transition after:absolute after:inset-y-2 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent hover:bg-primary/15 hover:after:bg-primary focus-visible:bg-primary/15 focus-visible:after:bg-primary"
                            onDoubleClick={() => resetColumnWidth(column)}
                            onKeyDown={(event) => {
                              if (event.key === "ArrowLeft") {
                                resizeColumn(
                                  column,
                                  columnWidths[column.id] - 16,
                                );
                              }

                              if (event.key === "ArrowRight") {
                                resizeColumn(
                                  column,
                                  columnWidths[column.id] + 16,
                                );
                              }
                            }}
                            onPointerDown={(event) =>
                              startColumnResize(column, event)
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
              <tbody className="bg-surface">
                {applications.map((application) => (
                  <ApplicationRow
                    application={application}
                    coverLetter={
                      application.coverLetterId
                        ? coverLetterById.get(application.coverLetterId)
                        : undefined
                    }
                    enableDeleteActiveApplications={
                      enableDeleteActiveApplications
                    }
                    key={application.id}
                    onArchiveApplication={onArchiveApplication}
                    onDeleteApplication={onDeleteApplication}
                    onOpenApplication={onOpenApplication}
                    onOpenContacts={onOpenContacts}
                    onPreviewResume={onPreviewResume}
                    onRestoreApplication={onRestoreApplication}
                    onUpdateApplication={onUpdateApplication}
                    showArchivedBadge={
                      markArchivedApplications &&
                      Boolean(application.archivedAt)
                    }
                    visibleColumnIds={visibleColumnIds}
                    resume={
                      application.resumeId
                        ? resumeById.get(application.resumeId)
                        : undefined
                    }
                    workingResumeId={workingResumeId}
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

export function stretchColumnWidthsToViewport(
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

// Inverse of stretchColumnWidthsToViewport for one column: the base width that
// displays as `displayedWidth` when the table is stretched to the viewport.
export function getBaseWidthForDisplayedWidth(
  visibleColumns: typeof APPLICATION_TABLE_COLUMNS,
  baseWidths: Record<ApplicationColumnId, number>,
  columnId: ApplicationColumnId,
  displayedWidth: number,
  viewportWidth: number,
) {
  const otherBaseWidth = visibleColumns.reduce(
    (width, column) =>
      column.id === columnId ? width : width + baseWidths[column.id],
    0,
  );

  // Without stretching the column simply shows its base width.
  if (otherBaseWidth + displayedWidth >= viewportWidth) {
    return displayedWidth;
  }

  // Stretching scales every base width by viewport / total, so solve
  // base * viewport / (others + base) = displayed for base.
  return (displayedWidth * otherBaseWidth) / (viewportWidth - displayedWidth);
}

function clampColumnWidth(
  column: (typeof APPLICATION_TABLE_COLUMNS)[number],
  width: number,
) {
  return Math.max(column.minWidth, Math.round(width));
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

function getHeaderClassName(columnId: ApplicationColumnId) {
  return [
    "sticky top-0 overflow-hidden border-b border-border bg-slate-50 px-2.5 py-3 pr-4 text-xs font-semibold uppercase tracking-[0.08em] text-muted",
    isUtilityColumn(columnId) ? "text-center" : "text-left",
    isPinnedColumn(columnId) ? "z-20" : "z-10",
    getPinnedColumnClassName(columnId),
  ].join(" ");
}

function isUtilityColumn(columnId: ApplicationColumnId) {
  return columnId === "actions" || columnId === "contacts";
}

function isPinnedColumn(columnId: ApplicationColumnId) {
  return columnId === "jobTitle" || columnId === "actions";
}

// Job title and actions stay visible while the table scrolls horizontally.
// While content is scrolled under them they show a hairline and a soft
// shadow, so cut-off cells read as passing beneath rather than as clipped.
function getPinnedColumnClassName(columnId: ApplicationColumnId) {
  if (columnId === "jobTitle") {
    return "sticky left-0 [[data-pinned-edge-start=true]_&]:shadow-[inset_-1px_0_0_var(--color-border),6px_0_8px_-6px_rgb(15_23_42/0.16)]";
  }

  if (columnId === "actions") {
    return "sticky right-0 [[data-pinned-edge-end=true]_&]:shadow-[inset_1px_0_0_var(--color-border),-6px_0_8px_-6px_rgb(15_23_42/0.16)]";
  }

  return "";
}

function ApplicationRow({
  application,
  coverLetter,
  enableDeleteActiveApplications,
  onArchiveApplication,
  onDeleteApplication,
  onOpenApplication,
  onOpenContacts,
  onPreviewResume,
  onRestoreApplication,
  onUpdateApplication,
  resume,
  showArchivedBadge = false,
  visibleColumnIds,
  workingResumeId,
}: {
  application: JobApplication;
  coverLetter?: ResumeFile;
  enableDeleteActiveApplications: boolean;
  onArchiveApplication: (applicationId: string) => void;
  onDeleteApplication: (applicationId: string) => void;
  onOpenApplication: (applicationId: string) => void;
  onOpenContacts: (applicationId: string) => void;
  onPreviewResume: (resume: ResumeFile) => Promise<void>;
  onRestoreApplication: (applicationId: string) => void;
  onUpdateApplication: (applicationId: string, input: ApplicationUpdate) => void;
  resume?: ResumeFile;
  showArchivedBadge?: boolean;
  visibleColumnIds: ApplicationColumnId[];
  workingResumeId: string | null;
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
      data-application-id={application.id}
      className="group cursor-pointer align-top [&:last-child>td]:border-b-0 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
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
                coverLetter={coverLetter}
                columnId={columnId}
                enableDeleteActiveApplications={enableDeleteActiveApplications}
                onArchiveApplication={onArchiveApplication}
                onDeleteApplication={onDeleteApplication}
                onOpenContacts={onOpenContacts}
                onPreviewResume={onPreviewResume}
                onRestoreApplication={onRestoreApplication}
                onUpdateApplication={onUpdateApplication}
                resume={resume}
                showArchivedBadge={showArchivedBadge}
                workingResumeId={workingResumeId}
              />
            </div>
          </td>
        );
      })}
    </tr>
  );
}

function getCellClassName(columnId: ApplicationColumnId) {
  const isActions = columnId === "actions";
  const isUtilityCell = isUtilityColumn(columnId);

  return [
    "border-b border-border bg-surface py-4 align-top transition-colors group-hover:bg-slate-50",
    isUtilityCell ? "px-1" : "overflow-hidden px-2.5",
    isActions ? "overflow-visible" : "",
    isPinnedColumn(columnId) ? "z-[5]" : "",
    getPinnedColumnClassName(columnId),
  ]
    .filter(Boolean)
    .join(" ");
}

function getCellContentClassName(columnId: ApplicationColumnId) {
  const isUtilityCell = isUtilityColumn(columnId);

  return [
    "min-w-0 max-w-full",
    isUtilityCell
      ? "flex justify-center"
      : "overflow-hidden",
  ].join(" ");
}

function ApplicationColumnCell({
  application,
  coverLetter,
  columnId,
  enableDeleteActiveApplications,
  onArchiveApplication,
  onDeleteApplication,
  onOpenContacts,
  onPreviewResume,
  onRestoreApplication,
  onUpdateApplication,
  resume,
  showArchivedBadge = false,
  workingResumeId,
}: {
  application: JobApplication;
  coverLetter?: ResumeFile;
  columnId: ApplicationColumnId;
  enableDeleteActiveApplications: boolean;
  onArchiveApplication: (applicationId: string) => void;
  onDeleteApplication: (applicationId: string) => void;
  onOpenContacts: (applicationId: string) => void;
  onPreviewResume: (resume: ResumeFile) => Promise<void>;
  onRestoreApplication: (applicationId: string) => void;
  onUpdateApplication: (applicationId: string, input: ApplicationUpdate) => void;
  resume?: ResumeFile;
  showArchivedBadge?: boolean;
  workingResumeId: string | null;
}) {
  if (columnId === "jobTitle") {
    const title = (
      <span className="block max-w-full truncate text-left text-sm font-semibold text-foreground underline-offset-2 group-hover:text-primary group-hover:underline">
        {application.jobTitle}
      </span>
    );

    return showArchivedBadge ? (
      <span className="flex min-w-0 items-center gap-2">
        {title}
        <ArchivedBadge />
      </span>
    ) : (
      title
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
      <StatusQuickEditCell
        application={application}
        onUpdate={(input) => onUpdateApplication(application.id, input)}
      />
    );
  }

  if (columnId === "dateApplied") {
    return <TextCell value={formatDate(application.dateApplied)} />;
  }

  if (columnId === "offerDeadline") {
    return <TextCell value={formatDateTime(application.offerDeadline)} />;
  }

  if (columnId === "roleStartDate") {
    return <TextCell value={formatDate(application.roleStartDate)} />;
  }

  if (columnId === "roleEndDate") {
    return <TextCell value={formatDate(application.roleEndDate)} />;
  }

  if (columnId === "followUp") {
    return (
      <FollowUpCell
        application={application}
        onUpdate={(input) => onUpdateApplication(application.id, input)}
      />
    );
  }

  if (columnId === "followUpPromptDays") {
    return (
      <FollowUpAutoResetCell
        application={application}
        onUpdate={(input) => onUpdateApplication(application.id, input)}
      />
    );
  }

  if (columnId === "interviewRound") {
    return (
      <TextCell
        value={
          application.interviewRound
            ? `Round ${application.interviewRound}`
            : undefined
        }
      />
    );
  }

  if (columnId === "interviewDateTime") {
    return (
      <InterviewCell
        application={application}
        onUpdate={(input) => onUpdateApplication(application.id, input)}
      />
    );
  }

  if (columnId === "interviewType") {
    return <TextCell value={getInterviewTypeLabel(application.interviewType)} />;
  }

  if (columnId === "priority") {
    return <TextCell value={formatOption(application.priority)} />;
  }

  if (columnId === "resume") {
    return (
      <ResumeCell
        isWorking={resume?.id === workingResumeId}
        onPreview={onPreviewResume}
        resume={resume}
      />
    );
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
    return (
      <TextCell
        value={coverLetter?.displayName ?? application.coverLetterVersion}
      />
    );
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
  coverLetter,
  enableDeleteActiveApplications,
  onArchiveApplication,
  onDeleteApplication,
  onOpenApplication,
  onOpenContacts,
  onPreviewResume,
  onRestoreApplication,
  onUpdateApplication,
  resume,
  showArchivedBadge = false,
  visibleColumnIds,
  workingResumeId,
}: {
  application: JobApplication;
  coverLetter?: ResumeFile;
  enableDeleteActiveApplications: boolean;
  onArchiveApplication: (applicationId: string) => void;
  onDeleteApplication: (applicationId: string) => void;
  onOpenApplication: (applicationId: string) => void;
  onOpenContacts: (applicationId: string) => void;
  onPreviewResume: (resume: ResumeFile) => Promise<void>;
  onRestoreApplication: (applicationId: string) => void;
  onUpdateApplication: (applicationId: string, input: ApplicationUpdate) => void;
  resume?: ResumeFile;
  showArchivedBadge?: boolean;
  visibleColumnIds: ApplicationColumnId[];
  workingResumeId: string | null;
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
      data-application-id={application.id}
      className="application-card cursor-pointer rounded-lg border border-border bg-surface px-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
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
          {showArchivedBadge ? (
            <div className="mt-1">
              <ArchivedBadge />
            </div>
          ) : null}
          {isColumnVisible("company") && application.company ? (
            <p className="mt-1 truncate text-xs font-medium text-muted">
              {application.company}
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

      <div className="application-card-fields mt-4 grid gap-3 border-t border-border pt-3">
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
                coverLetter={coverLetter}
                columnId={column.id}
                enableDeleteActiveApplications={enableDeleteActiveApplications}
                onArchiveApplication={onArchiveApplication}
                onDeleteApplication={onDeleteApplication}
                onOpenContacts={onOpenContacts}
                onPreviewResume={onPreviewResume}
                onRestoreApplication={onRestoreApplication}
                onUpdateApplication={onUpdateApplication}
                resume={resume}
                workingResumeId={workingResumeId}
              />
            </CardField>
          );
        })}
      </div>
    </article>
  );
}

const UPCOMING_EVENT_LABELS: Record<NotificationType, string> = {
  assessment_deadline: "Assessment due",
  assessment_start: "Assessment",
  deadline: "Stage deadline",
  flagged: "Reminder",
  follow_up: "Follow up",
  interview: "Interview",
  offer_deadline: "Offer deadline",
};

function MobileApplicationRow({
  application,
  onOpenApplication,
  showArchivedBadge,
  upcomingEvent,
}: {
  application: JobApplication;
  onOpenApplication: (applicationId: string) => void;
  showArchivedBadge: boolean;
  upcomingEvent?: ReminderNotification;
}) {
  const details = [
    application.dateApplied
      ? `Applied ${formatDate(application.dateApplied)}`
      : undefined,
    application.location?.trim(),
    formatOption(application.workMode),
  ].filter(Boolean);

  return (
    <li>
      <button
        className="flex w-full min-w-0 flex-col gap-1 px-4 py-3 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        data-application-id={application.id}
        onClick={() => onOpenApplication(application.id)}
        type="button"
      >
        <span className="flex w-full min-w-0 items-center justify-between gap-3">
          <span className="min-w-0 truncate text-sm font-semibold text-foreground">
            {application.company || application.jobTitle}
          </span>
          <span className="flex max-w-[55%] shrink-0">
            <StatusBadge status={application.status} />
          </span>
        </span>
        {application.company ? (
          <span className="w-full truncate text-sm text-foreground">
            {application.jobTitle}
          </span>
        ) : null}
        {details.length > 0 ? (
          <span className="w-full truncate text-xs text-muted">
            {details.join(" · ")}
          </span>
        ) : null}
        {showArchivedBadge || upcomingEvent ? (
          <span className="flex flex-wrap items-center gap-2 pt-1">
            {showArchivedBadge ? <ArchivedBadge /> : null}
            {upcomingEvent ? (
              <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-background px-2 py-0.5 text-xs font-medium text-foreground">
                <CalendarClock aria-hidden="true" className="shrink-0 text-muted" size={13} />
                <span className="truncate">
                  {UPCOMING_EVENT_LABELS[upcomingEvent.type]} ·{" "}
                  {formatDeadline(upcomingEvent.dueAt)}
                </span>
              </span>
            ) : null}
          </span>
        ) : null}
      </button>
    </li>
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

function ArchivedBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-border bg-slate-100 px-2 py-0.5 text-xs font-semibold text-muted">
      Archived
    </span>
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
    <div className="application-card-field min-w-0">
      <p className="application-card-field-label text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        {label}
      </p>
      {children}
    </div>
  );
}

function TextCell({ value }: { value?: string | number }) {
  const isEmpty = value === undefined || value === "";

  return (
    <p
      aria-label={isEmpty ? "No value" : undefined}
      className="min-h-5 truncate text-sm text-foreground"
    >
      {isEmpty ? "" : value}
    </p>
  );
}

function LongTextCell({ value }: { value?: string }) {
  return (
    <p className="line-clamp-2 text-sm leading-5 text-foreground">
      {value ?? ""}
    </p>
  );
}

function UrlCell({ value }: { value?: string }) {
  const safeUrl = getSafeHttpUrl(value);

  if (!value) {
    return <TextCell value={undefined} />;
  }

  if (!safeUrl) {
    return <TextCell value={value} />;
  }

  return (
    <a
      className="block truncate text-sm font-medium text-primary hover:text-blue-700"
      href={safeUrl}
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
