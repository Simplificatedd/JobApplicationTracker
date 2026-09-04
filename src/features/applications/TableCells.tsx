import {
  Archive,
  CalendarClock,
  FileText,
  MoreHorizontal,
  MessageSquareText,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatDate, formatDateTime } from "../../lib/format";
import type { JobApplication, ResumeFile } from "../../types/application";

export function DescriptionPreview({ description }: { description: string }) {
  return (
    <button
      className="mt-1 line-clamp-2 w-full min-w-0 max-w-full text-left text-xs leading-5 text-muted hover:text-foreground"
      type="button"
    >
      {description}
    </button>
  );
}

export function FollowUpCell({
  application,
}: {
  application: JobApplication;
}) {
  return (
    <div className="min-w-0 max-w-full overflow-hidden">
      <p
        className={`truncate text-sm font-medium ${
          application.followUpNeeded ? "text-warning" : "text-foreground"
        }`}
      >
        {formatDate(application.followUpDate)}
      </p>
      <p className="mt-1 truncate text-xs text-muted">
        {application.followUpNeeded ? "Needed" : "Optional"}
      </p>
    </div>
  );
}

export function InterviewCell({
  application,
}: {
  application: JobApplication;
}) {
  return (
    <div className="flex min-w-0 max-w-full gap-2 overflow-hidden">
      <CalendarClock
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-muted"
        size={16}
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {formatDateTime(application.interviewDateTime)}
        </p>
        <p className="mt-1 truncate text-xs text-muted">
          {application.interviewType ?? "Type blank"}
        </p>
      </div>
    </div>
  );
}

export function ResumeCell({ resume }: { resume?: ResumeFile }) {
  if (!resume) {
    return <p className="truncate text-sm text-muted">Unassigned</p>;
  }

  return (
    <button
      className="flex w-full min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-md text-left text-sm font-medium text-foreground hover:text-primary"
      type="button"
    >
      <FileText aria-hidden="true" className="shrink-0 text-muted" size={16} />
      <span className="truncate">{resume.displayName}</span>
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
      className="inline-flex h-9 max-w-full items-center gap-1.5 overflow-hidden rounded-lg border border-border px-2 text-left text-sm font-medium text-foreground hover:bg-slate-50"
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
}: {
  application: JobApplication;
  enableDeleteActiveApplications: boolean;
  onArchiveApplication: (applicationId: string) => void;
  onDeleteApplication: (applicationId: string) => void;
  onRestoreApplication: (applicationId: string) => void;
}) {
  const canDelete = Boolean(application.archivedAt) || enableDeleteActiveApplications;
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
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

  return (
    <div className="relative" ref={menuRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="icon-button h-9 w-9 max-w-full"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <MoreHorizontal aria-hidden="true" size={18} />
        <span className="sr-only">Open row actions</span>
      </button>
      {isOpen ? (
      <div
        className="absolute right-0 top-11 z-10 w-44 rounded-lg border border-border bg-surface p-1 shadow-popover"
        role="menu"
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
      </div>
      ) : null}
    </div>
  );
}
