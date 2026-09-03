import {
  Archive,
  CalendarClock,
  FileText,
  MoreHorizontal,
  MessageSquareText,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { formatDate, formatDateTime } from "../../lib/format";
import type { JobApplication, ResumeFile } from "../../types/application";

export function DescriptionPreview({ description }: { description: string }) {
  return (
    <button
      className="mt-1 line-clamp-2 max-w-full text-left text-xs leading-5 text-muted hover:text-foreground"
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
    <div>
      <p
        className={`text-sm font-medium ${
          application.followUpNeeded ? "text-warning" : "text-foreground"
        }`}
      >
        {formatDate(application.followUpDate)}
      </p>
      <p className="mt-1 text-xs text-muted">
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
    <div className="flex gap-2">
      <CalendarClock
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-muted"
        size={16}
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">
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
    return <p className="text-sm text-muted">Unassigned</p>;
  }

  return (
    <button
      className="flex max-w-full items-center gap-2 rounded-md text-left text-sm font-medium text-foreground hover:text-primary"
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
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-slate-50"
      onClick={onClick}
      type="button"
    >
      <MessageSquareText aria-hidden="true" size={16} />
      <span>{count}</span>
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

  function confirmDelete() {
    const confirmed = window.confirm(
      `Delete "${application.jobTitle}" permanently? This also removes linked contacts, interviews, and activity.`,
    );

    if (confirmed) {
      onDeleteApplication(application.id);
    }
  }

  return (
    <details className="group relative">
      <summary className="icon-button list-none [&::-webkit-details-marker]:hidden">
        <MoreHorizontal aria-hidden="true" size={18} />
        <span className="sr-only">Open row actions</span>
      </summary>
      <div className="absolute right-0 top-11 z-10 w-44 rounded-lg border border-border bg-surface p-1 shadow-popover">
        {application.archivedAt ? (
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-slate-50"
            onClick={() => onRestoreApplication(application.id)}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={16} />
            Restore
          </button>
        ) : (
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-slate-50"
            onClick={() => onArchiveApplication(application.id)}
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
            type="button"
          >
            <Trash2 aria-hidden="true" size={16} />
            Delete
          </button>
        ) : null}
      </div>
    </details>
  );
}
