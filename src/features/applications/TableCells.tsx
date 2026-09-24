import {
  Archive,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  CalendarX,
  Check,
  FileText,
  MoreHorizontal,
  Pencil,
  MessageSquareText,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import {
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { APPLICATION_STATUSES } from "../../lib/constants";
import { getAnchoredMenuPosition } from "../../lib/anchoredMenu";
import { formatDate, formatDateTime } from "../../lib/format";
import { calculateFollowUpDueDate } from "../../lib/reminders";
import type { ApplicationUpdate } from "../../store/useTrackerStore";
import type {
  ApplicationStatus,
  JobApplication,
  ResumeFile,
} from "../../types/application";
import {
  createFollowUpQuickEdit,
  createInterviewQuickEdit,
  createStatusQuickEdit,
} from "./applicationQuickEdits";
import { StatusBadge } from "./StatusBadge";

export function DescriptionPreview({ description }: { description: string }) {
  return (
    <p
      className="mt-1 line-clamp-2 w-full min-w-0 max-w-full text-left text-xs leading-5 text-muted hover:text-foreground"
    >
      {description}
    </p>
  );
}

export function FollowUpCell({
  application,
  onUpdate,
}: {
  application: JobApplication;
  onUpdate: (input: ApplicationUpdate) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftDate, setDraftDate] = useState(application.followUpDate ?? "");
  const [draftNeeded, setDraftNeeded] = useState(application.followUpNeeded);
  const dueDate = calculateFollowUpDueDate(
    application,
    application.followUpPromptDays ?? 7,
  );

  function startEditing() {
    setDraftDate(application.followUpDate ?? "");
    setDraftNeeded(application.followUpNeeded);
    setIsEditing(true);
  }

  if (isEditing) {
    return (
      <QuickEditContainer onCancel={() => setIsEditing(false)}>
        <input
          aria-label="Follow-up date"
          className="field-control h-9 w-full min-w-0 text-xs"
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
        <QuickEditActions
          label="follow-up"
          onCancel={() => setIsEditing(false)}
          onConfirm={() => {
            onUpdate(createFollowUpQuickEdit(draftNeeded, draftDate));
            setIsEditing(false);
          }}
        />
      </QuickEditContainer>
    );
  }

  return (
    <button
      aria-label="Quick edit follow-up"
      className="group flex w-full min-w-0 items-start justify-between gap-2 rounded-md text-left"
      onClick={startEditing}
      type="button"
    >
      <span className="min-w-0 max-w-full overflow-hidden">
        <span
          className={`block truncate text-sm font-medium ${
            application.followUpNeeded ? "text-warning" : "text-foreground"
          }`}
        >
          {formatDate(dueDate)}
        </span>
        <span className="mt-1 block truncate text-xs text-muted">
          {application.followUpNeeded ? "Needed" : "Optional"}
        </span>
      </span>
      <Pencil
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-muted"
        size={14}
      />
    </button>
  );
}

export function InterviewCell({
  application,
  onUpdate,
}: {
  application: JobApplication;
  onUpdate: (input: ApplicationUpdate) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftDateTime, setDraftDateTime] = useState(
    application.interviewDateTime?.slice(0, 16) ?? "",
  );

  function startEditing() {
    setDraftDateTime(application.interviewDateTime?.slice(0, 16) ?? "");
    setIsEditing(true);
  }

  if (isEditing) {
    return (
      <QuickEditContainer onCancel={() => setIsEditing(false)}>
        <input
          aria-label="Interview date and time"
          className="field-control h-9 w-full min-w-0 text-xs"
          onChange={(event) => setDraftDateTime(event.target.value)}
          type="datetime-local"
          value={draftDateTime}
        />
        <QuickEditActions
          label="interview date and time"
          onCancel={() => setIsEditing(false)}
          onConfirm={() => {
            onUpdate(createInterviewQuickEdit(application, draftDateTime));
            setIsEditing(false);
          }}
        />
      </QuickEditContainer>
    );
  }

  return (
    <button
      aria-label="Quick edit interview date and time"
      className="group flex w-full min-w-0 max-w-full gap-2 overflow-hidden rounded-md text-left"
      onClick={startEditing}
      type="button"
    >
      <CalendarClock
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-muted"
        size={16}
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {formatDateTime(application.interviewDateTime)}
        </p>
        {application.interviewType ? (
          <p className="mt-1 truncate text-xs text-muted">
            {application.interviewType}
          </p>
        ) : null}
      </div>
      <Pencil
        aria-hidden="true"
        className="ml-auto mt-0.5 shrink-0 text-muted"
        size={14}
      />
    </button>
  );
}

export function StatusQuickEditCell({
  application,
  onUpdate,
}: {
  application: JobApplication;
  onUpdate: (input: ApplicationUpdate) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftStatus, setDraftStatus] = useState(application.status);

  function startEditing() {
    setDraftStatus(application.status);
    setIsEditing(true);
  }

  if (isEditing) {
    return (
      <QuickEditContainer onCancel={() => setIsEditing(false)}>
        <select
          aria-label="Application status"
          className="field-control h-9 w-full min-w-0 text-xs"
          onChange={(event) =>
            setDraftStatus(event.target.value as ApplicationStatus)
          }
          value={draftStatus}
        >
          {APPLICATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <QuickEditActions
          label="status"
          onCancel={() => setIsEditing(false)}
          onConfirm={() => {
            onUpdate(createStatusQuickEdit(draftStatus));
            setIsEditing(false);
          }}
        />
      </QuickEditContainer>
    );
  }

  return (
    <button
      aria-label="Quick edit status"
      className="group flex w-full min-w-0 items-center justify-between gap-2 rounded-md text-left"
      onClick={startEditing}
      type="button"
    >
      <StatusBadge status={application.status} />
      <Pencil
        aria-hidden="true"
        className="shrink-0 text-muted"
        size={14}
      />
    </button>
  );
}

export function FollowUpNeededQuickEditCell({
  application,
  onUpdate,
}: {
  application: JobApplication;
  onUpdate: (input: ApplicationUpdate) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftNeeded, setDraftNeeded] = useState(application.followUpNeeded);

  if (isEditing) {
    return (
      <QuickEditContainer onCancel={() => setIsEditing(false)}>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            checked={draftNeeded}
            className="h-4 w-4 rounded border-border text-primary"
            onChange={(event) => setDraftNeeded(event.target.checked)}
            type="checkbox"
          />
          {draftNeeded ? "Yes" : "No"}
        </label>
        <QuickEditActions
          label="follow-up needed"
          onCancel={() => setIsEditing(false)}
          onConfirm={() => {
            onUpdate(
              createFollowUpQuickEdit(
                draftNeeded,
                application.followUpDate ?? "",
              ),
            );
            setIsEditing(false);
          }}
        />
      </QuickEditContainer>
    );
  }

  return (
    <button
      aria-label="Quick edit follow-up needed"
      className="group flex w-full items-center justify-between gap-2 rounded-md text-sm text-foreground"
      onClick={() => {
        setDraftNeeded(application.followUpNeeded);
        setIsEditing(true);
      }}
      type="button"
    >
      <span>{application.followUpNeeded ? "Yes" : "No"}</span>
      <Pencil
        aria-hidden="true"
        className="shrink-0 text-muted"
        size={14}
      />
    </button>
  );
}

function QuickEditContainer({
  children,
  onCancel,
}: {
  children: ReactNode;
  onCancel: () => void;
}) {
  return (
    <div
      className="space-y-2"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      {children}
    </div>
  );
}

function QuickEditActions({
  label,
  onCancel,
  onConfirm,
}: {
  label: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        aria-label={`Save ${label}`}
        className="icon-button h-8 w-8 text-success"
        onClick={onConfirm}
        type="button"
      >
        <Check aria-hidden="true" size={15} />
      </button>
      <button
        aria-label={`Cancel ${label} edit`}
        className="icon-button h-8 w-8"
        onClick={onCancel}
        type="button"
      >
        <X aria-hidden="true" size={15} />
      </button>
    </div>
  );
}

export function ResumeCell({
  isWorking,
  onPreview,
  resume,
}: {
  isWorking: boolean;
  onPreview: (resume: ResumeFile) => Promise<void>;
  resume?: ResumeFile;
}) {
  if (!resume) {
    return <p className="truncate text-sm text-muted">Unassigned</p>;
  }

  return (
    <button
      aria-label={`Preview ${resume.displayName}`}
      className="flex w-full min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-md text-left text-sm font-medium text-foreground hover:text-primary"
      disabled={isWorking}
      onClick={() => void onPreview(resume)}
      type="button"
    >
      <FileText aria-hidden="true" className="shrink-0 text-muted" size={16} />
      <span className="truncate">
        {isWorking ? "Opening…" : resume.displayName}
      </span>
    </button>
  );
}

export function ContactsButton({
  count,
  onClick,
}: {
  count: number;
  onClick?: () => void;
}) {
  return (
    <button
      className="inline-flex h-9 max-w-full items-center justify-center gap-1.5 overflow-hidden rounded-lg border border-border px-2 text-center text-sm font-medium text-foreground hover:bg-slate-50"
      onClick={onClick}
      type="button"
    >
      <MessageSquareText aria-hidden="true" size={16} />
      <span className="truncate">{count}</span>
    </button>
  );
}

export function RowActionsMenu({
  application,
  enableDeleteActiveApplications,
  onArchiveApplication,
  onDeleteApplication,
  onRestoreApplication,
  onUpdateApplication,
}: {
  application: JobApplication;
  enableDeleteActiveApplications: boolean;
  onArchiveApplication: (applicationId: string) => void;
  onDeleteApplication: (applicationId: string) => void;
  onRestoreApplication: (applicationId: string) => void;
  onUpdateApplication: (applicationId: string, input: ApplicationUpdate) => void;
}) {
  const canDelete = Boolean(application.archivedAt) || enableDeleteActiveApplications;
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 });
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEscapeKey(isOpen, () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target as Node;

      if (
        !menuRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    function updatePosition() {
      const trigger = triggerRef.current;
      const menu = menuRef.current;

      if (!trigger || !menu) {
        return;
      }

      setMenuPosition(
        getAnchoredMenuPosition({
          anchor: trigger.getBoundingClientRect(),
          menuHeight: menu.offsetHeight,
          menuWidth: menu.offsetWidth,
          viewportHeight: window.innerHeight,
          viewportWidth: window.innerWidth,
        }),
      );
    }

    updatePosition();
    menuRef.current
      ?.querySelector<HTMLElement>("[role='menuitem']")
      ?.focus();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  function confirmDelete() {
    const confirmed = window.confirm(
      `Delete "${application.jobTitle}" permanently? This also removes linked contacts, interviews, and activity.`,
    );

    if (confirmed) {
      setIsOpen(false);
      onDeleteApplication(application.id);
    }
  }

  function changeFollowUpDate() {
    const nextDate = window.prompt(
      "Set follow-up date (YYYY-MM-DD)",
      application.followUpDate ?? "",
    );

    if (nextDate === null) {
      return;
    }

    const trimmedDate = nextDate.trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
      window.alert("Use a date in YYYY-MM-DD format.");
      return;
    }

    setIsOpen(false);
    onUpdateApplication(application.id, {
      followUpDate: trimmedDate,
      followUpNeeded: true,
    });
  }

  function clearFollowUpDate() {
    setIsOpen(false);
    onUpdateApplication(application.id, {
      followUpDate: undefined,
      followUpNeeded: false,
    });
  }

  function markFollowUpDone() {
    setIsOpen(false);
    onUpdateApplication(application.id, {
      followUpDate: undefined,
      followUpNeeded: false,
    });
  }

  return (
    <div className="relative" onClick={(event) => event.stopPropagation()}>
      <button
        aria-controls={isOpen ? menuId : undefined}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="icon-button h-9 w-9 max-w-full"
        onClick={() => setIsOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        <MoreHorizontal aria-hidden="true" size={18} />
        <span className="sr-only">Open row actions</span>
      </button>
      {isOpen
        ? createPortal(
            <div
              className="fixed z-[60] w-44 rounded-lg border border-border bg-surface p-1 shadow-popover"
              id={menuId}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={moveMenuFocus}
              ref={menuRef}
              role="menu"
              style={{ left: menuPosition.left, top: menuPosition.top }}
            >
        {application.archivedAt ? (
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-slate-50"
            onClick={() => {
              setIsOpen(false);
              onRestoreApplication(application.id);
            }}
            role="menuitem"
            type="button"
          >
            <RotateCcw aria-hidden="true" size={16} />
            Restore
          </button>
        ) : (
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-slate-50"
            onClick={() => {
              setIsOpen(false);
              onArchiveApplication(application.id);
            }}
            role="menuitem"
            type="button"
          >
            <Archive aria-hidden="true" size={16} />
            Archive
          </button>
        )}
        {!application.archivedAt ? (
          <>
            <MenuButton onClick={changeFollowUpDate}>
              <CalendarPlus aria-hidden="true" size={16} />
              Change follow-up
            </MenuButton>
            <MenuButton onClick={clearFollowUpDate}>
              <CalendarX aria-hidden="true" size={16} />
              Clear follow-up
            </MenuButton>
            <MenuButton onClick={markFollowUpDone}>
              <CalendarCheck aria-hidden="true" size={16} />
              Mark done
            </MenuButton>
          </>
        ) : null}
        {canDelete ? (
          <button
            className="mt-1 flex w-full items-center gap-2 rounded-md bg-red-600 px-3 py-2 text-left text-sm font-semibold text-white hover:bg-red-700"
            onClick={confirmDelete}
            role="menuitem"
            type="button"
          >
            <Trash2 aria-hidden="true" size={16} />
            Delete
          </button>
        ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function moveMenuFocus(event: React.KeyboardEvent<HTMLDivElement>) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    return;
  }

  const items = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>("[role='menuitem']"),
  );

  if (items.length === 0) {
    return;
  }

  event.preventDefault();
  const currentIndex = items.indexOf(document.activeElement as HTMLElement);
  const nextIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowUp"
          ? (currentIndex - 1 + items.length) % items.length
          : (currentIndex + 1) % items.length;

  items[nextIndex]?.focus();
}

function MenuButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-slate-50"
      onClick={onClick}
      role="menuitem"
      type="button"
    >
      {children}
    </button>
  );
}
