import {
  Bell,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  ExternalLink,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { formatDate, formatDateTime } from "../lib/format";
import {
  createHandledFollowUpUpdate,
  normalizeFollowUpDateInput,
  validateFollowUpSchedule,
} from "../lib/followUps";
import {
  severityLabel,
  type NotificationGroup,
  type ReminderNotification,
} from "../lib/reminders";
import type { ApplicationUpdate } from "../store/useTrackerStore";
import type { InterviewUpdate } from "../types/application";

interface NotificationBellProps {
  grouped: boolean;
  notifications: ReminderNotification[];
  onDismiss: (id: string) => void;
  onMarkOpened: () => void;
  onOpenApplication: (id: string) => void;
  onUpdateApplication: (id: string, input: ApplicationUpdate) => void;
  onUpdateInterview: (id: string, input: InterviewUpdate) => void;
}

const groupLabels: Record<NotificationGroup, string> = {
  followups: "Follow-ups",
  interviews: "Interviews & assessments",
  offers: "Offers",
  other: "Other",
};

export function NotificationBell({
  grouped,
  notifications,
  onDismiss,
  onMarkOpened,
  onOpenApplication,
  onUpdateApplication,
  onUpdateInterview,
}: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const count = notifications.length;

  useEscapeKey(isOpen, () => setIsOpen(false));

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!panelRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [isOpen]);

  function togglePanel() {
    setIsOpen((current) => {
      const next = !current;

      if (next) {
        onMarkOpened();
      }

      return next;
    });
  }

  return (
    <div className="relative shrink-0" ref={panelRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={`Notifications${count > 0 ? `, ${count} needs attention` : ""}`}
        className="icon-button relative"
        onClick={togglePanel}
        title="Notifications"
        type="button"
      >
        <Bell aria-hidden="true" size={18} />
        {count > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-warning px-1.5 py-0.5 text-center text-[0.6875rem] font-bold leading-4 text-white">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div
          aria-label="Notifications"
          className="absolute right-0 top-12 z-50 max-h-[min(34rem,calc(100vh-6rem))] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-border bg-surface p-3 shadow-popover"
          role="dialog"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Needs attention
              </p>
              <p className="text-xs text-muted">
                {count === 0 ? "All clear" : `${count} active reminder${count === 1 ? "" : "s"}`}
              </p>
            </div>
            <button
              aria-label="Close notifications"
              className="icon-button h-8 w-8"
              onClick={() => setIsOpen(false)}
              title="Close notifications"
              type="button"
            >
              <X aria-hidden="true" size={16} />
            </button>
          </div>

          {count === 0 ? (
            <div className="px-2 py-8 text-center">
              <p className="text-sm font-semibold text-foreground">
                No reminders right now
              </p>
              <p className="mt-1 text-sm text-muted">
                Follow-ups, interviews, assessments, and offer deadlines will
                appear here.
              </p>
            </div>
          ) : grouped ? (
            <GroupedNotifications
              notifications={notifications}
              onDismiss={onDismiss}
              onOpenApplication={(id) => {
                setIsOpen(false);
                onOpenApplication(id);
              }}
              onUpdateApplication={onUpdateApplication}
              onUpdateInterview={onUpdateInterview}
            />
          ) : (
            <div className="mt-3 space-y-2">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onDismiss={onDismiss}
                  onOpenApplication={(id) => {
                    setIsOpen(false);
                    onOpenApplication(id);
                  }}
                  onUpdateApplication={onUpdateApplication}
                  onUpdateInterview={onUpdateInterview}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function GroupedNotifications({
  notifications,
  onDismiss,
  onOpenApplication,
  onUpdateApplication,
  onUpdateInterview,
}: {
  notifications: ReminderNotification[];
  onDismiss: (id: string) => void;
  onOpenApplication: (id: string) => void;
  onUpdateApplication: (id: string, input: ApplicationUpdate) => void;
  onUpdateInterview: (id: string, input: InterviewUpdate) => void;
}) {
  const groups: NotificationGroup[] = [
    "followups",
    "interviews",
    "offers",
    "other",
  ];

  return (
    <div className="mt-3 space-y-4">
      {groups.map((group) => {
        const groupNotifications = notifications.filter(
          (notification) => notification.group === group,
        );

        if (groupNotifications.length === 0) {
          return null;
        }

        return (
          <section key={group}>
            <h3 className="px-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              {groupLabels[group]}
            </h3>
            <div className="mt-2 space-y-2">
              {groupNotifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onDismiss={onDismiss}
                  onOpenApplication={onOpenApplication}
                  onUpdateApplication={onUpdateApplication}
                  onUpdateInterview={onUpdateInterview}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function NotificationItem({
  notification,
  onDismiss,
  onOpenApplication,
  onUpdateApplication,
  onUpdateInterview,
}: {
  notification: ReminderNotification;
  onDismiss: (id: string) => void;
  onOpenApplication: (id: string) => void;
  onUpdateApplication: (id: string, input: ApplicationUpdate) => void;
  onUpdateInterview: (id: string, input: InterviewUpdate) => void;
}) {
  const dueText =
    notification.type === "follow_up"
      ? formatDate(notification.dueAt)
      : formatDateTime(notification.dueAt);

  return (
    <article
      className={`rounded-lg border px-3 py-3 ${getNotificationTone(notification.severity)}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {notification.title}
          </p>
          <p className="mt-1 text-xs font-medium text-muted">
            {severityLabel(notification.severity)} / {dueText}
          </p>
          <p className="mt-1 truncate text-xs text-muted">
            {notification.body}
          </p>
        </div>
        <button
          aria-label={`Dismiss ${notification.title}`}
          className="icon-button h-8 w-8 shrink-0 bg-surface"
          onClick={() => onDismiss(notification.id)}
          title="Dismiss"
          type="button"
        >
          <X aria-hidden="true" size={15} />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <SmallActionButton
          label="Open application"
          onClick={() => onOpenApplication(notification.applicationId)}
        >
          <ExternalLink aria-hidden="true" size={14} />
          Open
        </SmallActionButton>
        {notification.type === "follow_up" || notification.type === "flagged" ? (
          <>
            <SmallActionButton
              label="Follow-up handled"
              onClick={() =>
                onUpdateApplication(
                  notification.applicationId,
                  createHandledFollowUpUpdate(notification.application),
                )
              }
            >
              <CalendarCheck aria-hidden="true" size={14} />
              Handled
            </SmallActionButton>
            <SmallActionButton
              label="Change follow-up date"
              onClick={() =>
                changeDate(
                  notification,
                  onUpdateApplication,
                  onUpdateInterview,
                  "follow_up",
                )
              }
            >
              <CalendarPlus aria-hidden="true" size={14} />
              Date
            </SmallActionButton>
          </>
        ) : null}
        {notification.type === "interview" ? (
          <SmallActionButton
            label="Change scheduled date and time"
            onClick={() =>
              changeDate(
                notification,
                onUpdateApplication,
                onUpdateInterview,
                "interview",
              )
            }
          >
            <CalendarClock aria-hidden="true" size={14} />
            Time
          </SmallActionButton>
        ) : null}
        {notification.type === "deadline" ? (
          <SmallActionButton
            label="Change stage deadline"
            onClick={() =>
              changeDate(
                notification,
                onUpdateApplication,
                onUpdateInterview,
                "deadline",
              )
            }
          >
            <CalendarClock aria-hidden="true" size={14} />
            Deadline
          </SmallActionButton>
        ) : null}
        {notification.type === "offer_deadline" ? (
          <>
            <SmallActionButton
              label="Mark offer accepted"
              onClick={() =>
                onUpdateApplication(notification.applicationId, {
                  status: "Accepted",
                })
              }
            >
              <CalendarCheck aria-hidden="true" size={14} />
              Accepted
            </SmallActionButton>
            <SmallActionButton
              label="Change offer deadline"
              onClick={() =>
                changeDate(
                  notification,
                  onUpdateApplication,
                  onUpdateInterview,
                  "offer_deadline",
                )
              }
            >
              <CalendarClock aria-hidden="true" size={14} />
              Deadline
            </SmallActionButton>
          </>
        ) : null}
      </div>
    </article>
  );
}

function SmallActionButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2 text-xs font-semibold text-foreground hover:bg-slate-50"
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function changeDate(
  notification: ReminderNotification,
  onUpdateApplication: (id: string, input: ApplicationUpdate) => void,
  onUpdateInterview: (id: string, input: InterviewUpdate) => void,
  mode: "follow_up" | "interview" | "deadline" | "offer_deadline",
) {
  const isFollowUp = mode === "follow_up";
  const nextValue = window.prompt(
    isFollowUp
      ? notification.application.followUpNeeded
        ? "Set the compulsory follow-up date (YYYY-MM-DD)"
        : "Set the optional follow-up date (YYYY-MM-DD), or leave blank for No Follow-Up"
      : "Set date/time (YYYY-MM-DDTHH:mm)",
    isFollowUp
      ? notification.application.followUpDate ?? ""
      : notification.dueAt ?? "",
  );

  if (nextValue === null) {
    return;
  }

  if (mode === "follow_up") {
    const followUpDate = normalizeFollowUpDateInput(nextValue);
    const validationError = validateFollowUpSchedule(
      notification.application.followUpNeeded ? "compulsory" : "optional",
      nextValue,
    );

    if (followUpDate === null || validationError) {
      window.alert(validationError ?? "Use a valid YYYY-MM-DD date.");
      return;
    }

    onUpdateApplication(notification.applicationId, {
      followUpDate,
      followUpNeeded: notification.application.followUpNeeded,
    });
    return;
  }

  const trimmedValue = nextValue.trim();

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmedValue)) {
    window.alert("Use YYYY-MM-DDTHH:mm.");
    return;
  }

  if (mode === "offer_deadline") {
    onUpdateApplication(notification.applicationId, {
      offerDeadline: trimmedValue,
    });
    return;
  }

  if (mode === "interview") {
    if (notification.interviewId) {
      onUpdateInterview(notification.interviewId, { dateTime: trimmedValue });
    }
    return;
  }

  if (notification.interviewId) {
    onUpdateInterview(notification.interviewId, {
      deadline: trimmedValue,
    });
  }
}

function getNotificationTone(severity: ReminderNotification["severity"]) {
  if (severity === "overdue") {
    return "border-red-200 bg-red-50";
  }

  if (severity === "due_today") {
    return "border-amber-300 bg-amber-50";
  }

  if (severity === "due_soon") {
    return "border-blue-200 bg-blue-50";
  }

  return "border-border bg-surface";
}
