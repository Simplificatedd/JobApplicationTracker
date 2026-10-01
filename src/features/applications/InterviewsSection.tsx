import { ExternalLink, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import {
  INTERVIEW_MODE_OPTIONS,
  INTERVIEW_TYPE_OPTIONS,
} from "../../lib/constants";
import { formatDateTime } from "../../lib/format";
import {
  getNextInterviewRound,
  suggestInterviewDeadline,
} from "../../lib/interviews";
import { getSafeHttpUrl } from "../../lib/urls";
import type { MutationResult } from "../../store/useTrackerStore";
import type {
  Application,
  DeadlineEntryMode,
  Interview,
  InterviewInput,
  InterviewMode,
  InterviewType,
  InterviewUpdate,
} from "../../types/application";
import { validateInterviewRound } from "./applicationForm";

interface InterviewsSectionProps {
  application: Application;
  interviews: Interview[];
  onAdd: (input: InterviewInput) => Promise<MutationResult<Interview>>;
  onDelete: (id: string) => Promise<MutationResult>;
  onUpdate: (
    id: string,
    input: InterviewUpdate,
  ) => Promise<MutationResult<Interview>>;
}

interface InterviewDraft {
  dateTime: string;
  deadline: string;
  deadlineEntryMode: DeadlineEntryMode;
  deadlineReceivedAt: string;
  location: string;
  meetingUrl: string;
  mode: InterviewMode;
  notes: string;
  platform: string;
  proctored: boolean;
  round: string;
  type: InterviewType;
}

type InterviewDetailsInput = Omit<InterviewInput, "applicationId">;

export function InterviewsSection({
  application,
  interviews,
  onAdd,
  onDelete,
  onUpdate,
}: InterviewsSectionProps) {
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<InterviewDraft | null>(null);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const sortedInterviews = sortInterviewHistory(interviews);

  function startAdding() {
    setEditingId("new");
    setDraft(createDraft(undefined, getNextInterviewRound(interviews)));
    setError("");
  }

  function startEditing(interview: Interview) {
    setEditingId(interview.id);
    setDraft(createDraft(interview));
    setError("");
  }

  function cancelEditing() {
    if (isSaving) return;
    setEditingId(null);
    setDraft(null);
    setError("");
  }

  async function saveInterview() {
    if (!draft || !editingId) return;

    setError("");
    const existingRounds = interviews
      .filter((interview) => interview.id !== editingId)
      .map((interview) => interview.round)
      .filter((round): round is number => round !== undefined);
    const roundValidation = validateInterviewRound(
      draft.round,
      existingRounds,
    );

    if (roundValidation.error) {
      setError(roundValidation.error);
      return;
    }

    if (
      roundValidation.warnings.length > 0 &&
      !window.confirm(
        `${roundValidation.warnings.join("\n")}\n\nSave this interview round anyway?`,
      )
    ) {
      return;
    }

    setIsSaving(true);
    const input = toInterviewUpdate(draft, roundValidation.round);
    const result =
      editingId === "new"
        ? await onAdd({ ...input, applicationId: application.id })
        : await onUpdate(editingId, input);
    setIsSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setEditingId(null);
    setDraft(null);
  }

  async function deleteInterview(interview: Interview) {
    const label = interview.round
      ? `interview ${interview.round}`
      : "this interview";

    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;

    setError("");
    const result = await onDelete(interview.id);

    if (!result.ok) setError(result.error);
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Interviews</h3>
          <p className="mt-1 text-sm text-muted">
            Track each interview round and assessment separately.
          </p>
        </div>
        {!application.archivedAt && editingId === null ? (
          <button
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold text-foreground hover:bg-slate-50"
            onClick={startAdding}
            type="button"
          >
            <Plus aria-hidden="true" size={16} />
            Add interview
          </button>
        ) : null}
      </div>

      {editingId && draft ? (
        <InterviewForm
          draft={draft}
          error={error}
          isNew={editingId === "new"}
          isSaving={isSaving}
          onCancel={cancelEditing}
          onChange={setDraft}
          onSave={() => void saveInterview()}
        />
      ) : null}

      {error && !editingId ? (
        <p className="mt-3 text-sm font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-3 grid gap-3">
        {sortedInterviews.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted">
            No interviews added yet.
          </p>
        ) : (
          sortedInterviews.map((interview) => (
            <InterviewCard
              application={application}
              interview={interview}
              key={interview.id}
              onDelete={() => void deleteInterview(interview)}
              onEdit={() => startEditing(interview)}
            />
          ))
        )}
      </div>
    </section>
  );
}

function InterviewCard({
  application,
  interview,
  onDelete,
  onEdit,
}: {
  application: Application;
  interview: Interview;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const safeMeetingUrl = getSafeHttpUrl(interview.meetingUrl);

  return (
    <article className="rounded-lg border border-border bg-surface-raised p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-foreground">
            {interview.round ? `Round ${interview.round}` : "Interview"}
          </h4>
          <p className="mt-1 text-sm text-muted">
            {getOptionLabel(INTERVIEW_TYPE_OPTIONS, interview.type)} /{" "}
            {getOptionLabel(INTERVIEW_MODE_OPTIONS, interview.mode)}
          </p>
        </div>
        {!application.archivedAt ? (
          <div className="flex shrink-0 gap-1">
            <button
              aria-label="Edit interview"
              className="icon-button"
              onClick={onEdit}
              type="button"
            >
              <Pencil aria-hidden="true" size={16} />
            </button>
            <button
              aria-label="Delete interview"
              className="icon-button text-destructive"
              onClick={onDelete}
              type="button"
            >
              <Trash2 aria-hidden="true" size={16} />
            </button>
          </div>
        ) : null}
      </div>
      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <InterviewDetail label="Scheduled" value={formatOptionalDateTime(interview.dateTime)} />
        <InterviewDetail label="Deadline" value={formatOptionalDateTime(interview.deadline)} />
        <InterviewDetail label="Location" value={interview.location} />
        <InterviewDetail label="Platform" value={interview.platform} />
        <InterviewDetail label="Proctored" value={interview.proctored ? "Yes" : "No"} />
        {safeMeetingUrl ? (
          <div>
            <p className="text-xs font-semibold uppercase text-muted">Meeting</p>
            <a
              className="mt-1 inline-flex items-center gap-1 font-medium text-primary hover:text-blue-700"
              href={safeMeetingUrl}
              rel="noreferrer"
              target="_blank"
            >
              Open link <ExternalLink aria-hidden="true" size={14} />
            </a>
          </div>
        ) : (
          <InterviewDetail label="Meeting" />
        )}
      </div>
      {interview.notes ? (
        <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">
          {interview.notes}
        </p>
      ) : null}
    </article>
  );
}

function InterviewDetail({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-muted">{label}</p>
      <p className="mt-1 text-foreground">{value || "—"}</p>
    </div>
  );
}

function InterviewForm({
  draft,
  error,
  isNew,
  isSaving,
  onCancel,
  onChange,
  onSave,
}: {
  draft: InterviewDraft;
  error: string;
  isNew: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onChange: (draft: InterviewDraft) => void;
  onSave: () => void;
}) {
  function update<Key extends keyof InterviewDraft>(
    key: Key,
    value: InterviewDraft[Key],
  ) {
    onChange({ ...draft, [key]: value });
  }

  function updateDeadlineEntryMode(value: DeadlineEntryMode) {
    const receivedAt =
      draft.deadlineReceivedAt || toDateTimeLocal(new Date().toISOString());
    const suggestedDeadline = suggestInterviewDeadline(value, receivedAt);

    onChange({
      ...draft,
      deadline:
        suggestedDeadline !== undefined
          ? toDateTimeLocal(suggestedDeadline)
          : draft.deadline,
      deadlineEntryMode: value,
      deadlineReceivedAt: value === "exact" ? draft.deadlineReceivedAt : receivedAt,
    });
  }

  function updateDeadlineReceivedAt(value: string) {
    const suggestedDeadline = suggestInterviewDeadline(
      draft.deadlineEntryMode,
      value,
    );

    onChange({
      ...draft,
      deadline:
        suggestedDeadline !== undefined
          ? toDateTimeLocal(suggestedDeadline)
          : draft.deadline,
      deadlineReceivedAt: value,
    });
  }

  return (
    <div className="mt-3 rounded-lg border border-border bg-surface-raised p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-foreground">
          {isNew ? "Add interview" : "Edit interview"}
        </h4>
        <button
          aria-label="Cancel interview editing"
          className="icon-button"
          disabled={isSaving}
          onClick={onCancel}
          type="button"
        >
          <X aria-hidden="true" size={16} />
        </button>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <FormField label="Interview round">
          <input
            className="field-control"
            min="1"
            onChange={(event) => update("round", event.target.value)}
            step="1"
            type="number"
            value={draft.round}
          />
        </FormField>
        <FormField label="Interview type">
          <select
            className="field-control"
            onChange={(event) => update("type", event.target.value as InterviewType)}
            value={draft.type}
          >
            {INTERVIEW_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">The category or stage of the interview.</p>
        </FormField>
        <FormField label="Interview mode">
          <select
            className="field-control"
            onChange={(event) => update("mode", event.target.value as InterviewMode)}
            value={draft.mode}
          >
            {INTERVIEW_MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">How the interview is conducted.</p>
        </FormField>
        <FormField label="Interview date/time">
          <input
            className="field-control"
            onChange={(event) => update("dateTime", event.target.value)}
            type="datetime-local"
            value={draft.dateTime}
          />
        </FormField>
        <FormField label="Location">
          <input
            className="field-control"
            onChange={(event) => update("location", event.target.value)}
            type="text"
            value={draft.location}
          />
        </FormField>
        <FormField label="Meeting URL">
          <input
            className="field-control"
            onChange={(event) => update("meetingUrl", event.target.value)}
            type="url"
            value={draft.meetingUrl}
          />
        </FormField>
        <FormField label="Platform">
          <input
            className="field-control"
            onChange={(event) => update("platform", event.target.value)}
            placeholder="Teams, Zoom, HireVue…"
            type="text"
            value={draft.platform}
          />
        </FormField>
        <FormField label="Deadline timing">
          <select
            className="field-control"
            onChange={(event) =>
              updateDeadlineEntryMode(
                event.target.value as DeadlineEntryMode,
              )
            }
            value={draft.deadlineEntryMode}
          >
            <option value="exact">Exact date/time</option>
            <option value="1_day">1 day after received</option>
            <option value="2_days">2 days after received</option>
            <option value="3_days">3 days after received</option>
            <option value="72_hours">72 hours after received</option>
          </select>
        </FormField>
        {draft.deadlineEntryMode !== "exact" ? (
          <FormField label="Received date/time">
            <input
              className="field-control"
              onChange={(event) => updateDeadlineReceivedAt(event.target.value)}
              type="datetime-local"
              value={draft.deadlineReceivedAt}
            />
          </FormField>
        ) : null}
        <FormField label="Interview deadline">
          <input
            className="field-control"
            onChange={(event) => update("deadline", event.target.value)}
            type="datetime-local"
            value={draft.deadline}
          />
        </FormField>
        <label className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-3 text-sm font-medium text-foreground sm:col-span-2">
          <input
            checked={draft.proctored}
            className="h-4 w-4 rounded border-border text-primary"
            onChange={(event) => update("proctored", event.target.checked)}
            type="checkbox"
          />
          <span>Proctored assessment</span>
        </label>
        <FormField className="sm:col-span-2" label="Interview notes">
          <textarea
            className="field-control min-h-24 resize-y"
            onChange={(event) => update("notes", event.target.value)}
            value={draft.notes}
          />
        </FormField>
      </div>
      {error ? (
        <p className="mt-3 text-sm font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <button
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-semibold text-foreground hover:bg-slate-50"
          disabled={isSaving}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSaving}
          onClick={onSave}
          type="button"
        >
          {isSaving ? "Saving…" : isNew ? "Add interview" : "Save interview"}
        </button>
      </div>
    </div>
  );
}

function FormField({
  children,
  className = "",
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function createDraft(interview?: Interview, suggestedRound?: number): InterviewDraft {
  return {
    dateTime: toDateTimeLocal(interview?.dateTime),
    deadline: toDateTimeLocal(interview?.deadline),
    deadlineEntryMode: interview?.deadlineEntryMode ?? "exact",
    deadlineReceivedAt: toDateTimeLocal(interview?.deadlineReceivedAt),
    location: interview?.location ?? "",
    meetingUrl: interview?.meetingUrl ?? "",
    mode: interview?.mode ?? "unknown",
    notes: interview?.notes ?? "",
    platform: interview?.platform ?? "",
    proctored: interview?.proctored ?? false,
    round: interview?.round ? String(interview.round) : String(suggestedRound ?? ""),
    type: interview?.type ?? "unknown",
  };
}

function toInterviewUpdate(
  draft: InterviewDraft,
  round: number | undefined,
): InterviewDetailsInput {
  return {
    dateTime: trimOptional(draft.dateTime),
    deadline: trimOptional(draft.deadline),
    deadlineEntryMode: draft.deadlineEntryMode,
    deadlineReceivedAt: trimOptional(draft.deadlineReceivedAt),
    location: trimOptional(draft.location),
    meetingUrl: trimOptional(draft.meetingUrl),
    mode: draft.mode,
    notes: trimOptional(draft.notes),
    platform: trimOptional(draft.platform),
    proctored: draft.proctored,
    round,
    type: draft.type,
  };
}

function sortInterviewHistory(interviews: Interview[]) {
  const now = Date.now();

  return [...interviews].sort((left, right) => {
    const leftTime = getSortTime(left, now);
    const rightTime = getSortTime(right, now);

    if (leftTime.group !== rightTime.group) return leftTime.group - rightTime.group;
    if (leftTime.time !== rightTime.time) {
      return leftTime.group === 2
        ? rightTime.time - leftTime.time
        : leftTime.time - rightTime.time;
    }

    return (right.round ?? 0) - (left.round ?? 0) ||
      right.updatedAt.localeCompare(left.updatedAt);
  });
}

function getSortTime(interview: Interview, now: number) {
  const times = [interview.dateTime, interview.deadline]
    .map((value) => (value ? new Date(value).getTime() : Number.NaN))
    .filter((value) => !Number.isNaN(value));
  const upcoming = times.filter((value) => value >= now);

  if (upcoming.length > 0) return { group: 0, time: Math.min(...upcoming) };
  if (times.length === 0) return { group: 1, time: 0 };
  return { group: 2, time: Math.max(...times) };
}

function getOptionLabel<Value extends string>(
  options: ReadonlyArray<{ label: string; value: Value }>,
  value: Value,
) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function formatOptionalDateTime(value?: string) {
  return value ? formatDateTime(value) : undefined;
}

function toDateTimeLocal(value?: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 16);
  }

  const pad = (part: number) => String(part).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function trimOptional(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
