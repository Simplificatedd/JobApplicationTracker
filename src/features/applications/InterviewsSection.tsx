import { ExternalLink, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import {
  INTERVIEW_MODE_OPTIONS,
  INTERVIEW_TYPE_OPTIONS,
} from "../../lib/constants";
import { formatDateTime } from "../../lib/format";
import {
  calculateInterviewDeadline,
  getNextInterviewRound,
  isAssessmentStage,
  shouldShowProctored,
} from "../../lib/interviews";
import { getSafeHttpUrl } from "../../lib/urls";
import type { MutationResult } from "../../store/useTrackerStore";
import type {
  Application,
  Interview,
  InterviewInput,
  InterviewMode,
  InterviewType,
  InterviewUpdate,
} from "../../types/application";
import { validateInterviewRound } from "./applicationForm";
import { InterviewDeadlineFields } from "./InterviewDeadlineFields";

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
      ? `interview or assessment ${interview.round}`
      : "this interview or assessment";

    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;

    setError("");
    const result = await onDelete(interview.id);

    if (!result.ok) setError(result.error);
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Interviews &amp; assessments
          </h3>
          <p className="mt-1 text-sm text-muted">
            Track each interview or assessment separately.
          </p>
        </div>
        {!application.archivedAt && editingId === null ? (
          <button
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold text-foreground hover:bg-slate-50"
            onClick={startAdding}
            type="button"
          >
            <Plus aria-hidden="true" size={16} />
            Add interview or assessment
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
            No interviews or assessments added yet.
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
            {interview.round
              ? `Round or stage ${interview.round}`
              : "Interview or assessment"}
          </h4>
          <p className="mt-1 text-sm text-muted">
            {getOptionLabel(INTERVIEW_TYPE_OPTIONS, interview.type)} /{" "}
            {getOptionLabel(INTERVIEW_MODE_OPTIONS, interview.mode)}
          </p>
        </div>
        {!application.archivedAt ? (
          <div className="flex shrink-0 gap-1">
            <button
              aria-label="Edit interview or assessment"
              className="icon-button"
              onClick={onEdit}
              type="button"
            >
              <Pencil aria-hidden="true" size={16} />
            </button>
            <button
              aria-label="Delete interview or assessment"
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
        <InterviewDetail label="Location or address" value={interview.location} />
        <InterviewDetail label="Platform or provider" value={interview.platform} />
        {shouldShowProctored(interview.type, interview.proctored) ? (
          <InterviewDetail
            label="Proctored"
            value={interview.proctored ? "Yes" : "No"}
          />
        ) : null}
        {safeMeetingUrl ? (
          <div>
            <p className="text-xs font-semibold uppercase text-muted">Link</p>
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
          <InterviewDetail label="Link" />
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

  function updateStageType(value: InterviewType) {
    onChange({
      ...draft,
      proctored: isAssessmentStage(value) ? draft.proctored : false,
      type: value,
    });
  }

  function updateFormat(value: InterviewMode) {
    onChange({ ...draft, mode: value });
  }

  function updateDeadlineFields(value: {
    deadline: string;
    receivedAt: string;
  }) {
    onChange({
      ...draft,
      deadline: value.deadline,
      deadlineReceivedAt: value.receivedAt,
    });
  }

  return (
    <div className="mt-3 rounded-lg border border-border bg-surface-raised p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-foreground">
          {isNew ? "Add interview or assessment" : "Edit interview or assessment"}
        </h4>
        <button
          aria-label="Cancel interview or assessment editing"
          className="icon-button"
          disabled={isSaving}
          onClick={onCancel}
          type="button"
        >
          <X aria-hidden="true" size={16} />
        </button>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <FormField label="Round or stage number">
          <input
            className="field-control"
            min="1"
            onChange={(event) => update("round", event.target.value)}
            step="1"
            type="number"
            value={draft.round}
          />
        </FormField>
        <FormField label="Stage type">
          <select
            className="field-control"
            onChange={(event) =>
              updateStageType(event.target.value as InterviewType)
            }
            value={draft.type}
          >
            {INTERVIEW_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">What this step involves.</p>
        </FormField>
        <FormField label="Format">
          <select
            className="field-control"
            onChange={(event) =>
              updateFormat(event.target.value as InterviewMode)
            }
            value={draft.mode}
          >
            {INTERVIEW_MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">How this step takes place.</p>
        </FormField>
        <FormField label="Scheduled date/time">
          <input
            className="field-control"
            onChange={(event) => update("dateTime", event.target.value)}
            type="datetime-local"
            value={draft.dateTime}
          />
        </FormField>
        <FormField label="Location or address">
          <input
            className="field-control"
            onChange={(event) => update("location", event.target.value)}
            type="text"
            value={draft.location}
          />
        </FormField>
        <FormField label="Interview or assessment link">
          <input
            className="field-control"
            onChange={(event) => update("meetingUrl", event.target.value)}
            type="url"
            value={draft.meetingUrl}
          />
        </FormField>
        <FormField label="Platform or provider">
          <input
            className="field-control"
            onChange={(event) => update("platform", event.target.value)}
            placeholder="Teams, Zoom, HireVue…"
            type="text"
            value={draft.platform}
          />
        </FormField>
        <InterviewDeadlineFields
          deadline={draft.deadline}
          onChange={updateDeadlineFields}
          receivedAt={draft.deadlineReceivedAt}
        />
        {shouldShowProctored(draft.type, draft.proctored) ? (
          <label className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-3 text-sm font-medium text-foreground sm:col-span-2">
            <input
              checked={draft.proctored}
              className="h-4 w-4 rounded border-border text-primary"
              onChange={(event) => update("proctored", event.target.checked)}
              type="checkbox"
            />
            <span>This assessment is proctored</span>
          </label>
        ) : null}
        <FormField className="sm:col-span-2" label="Notes">
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
          {isSaving
            ? "Saving…"
            : isNew
              ? "Add interview or assessment"
              : "Save interview or assessment"}
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
    deadline: toDateTimeLocal(
      interview ? calculateInterviewDeadline(interview) : undefined,
    ),
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
    deadlineEntryMode: "exact",
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
