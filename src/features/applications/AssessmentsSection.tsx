import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  ASSESSMENT_TYPES,
  ASSESSMENT_PROGRESS,
  ASSESSMENT_RESULTS,
  assessmentLabel,
  submittedAssessmentUpdate,
  validateAssessment,
  type AssessmentActions,
} from "../../lib/assessments";
import { formatDateTime } from "../../lib/format";
import { getInterviewTypeLabel } from "../../lib/constants";
import { getSafeHttpUrl } from "../../lib/urls";
import type {
  Application,
  Assessment,
  AssessmentInput,
  AssessmentUpdate,
} from "../../types/application";
import { InterviewDeadlineFields } from "./InterviewDeadlineFields";

export interface AssessmentSectionProps {
  application: Application;
  assessments: Assessment[];
  assessmentActions: AssessmentActions;
}

export function AssessmentsSection({
  application,
  assessments,
  assessmentActions,
}: AssessmentSectionProps) {
  const [draft, setDraft] = useState<AssessmentInput | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [original, setOriginal] = useState<Assessment | undefined>();
  const [fixedTime, setFixedTime] = useState(false);
  const [deadlineOnly, setDeadlineOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function edit(assessment?: Assessment, onlyDeadline = false) {
    setEditingId(assessment?.id ?? null);
    setOriginal(assessment);
    setDeadlineOnly(onlyDeadline);
    setError("");
    setFixedTime(Boolean(assessment?.scheduledStart));
    setDraft(
      assessment
        ? {
            applicationId: application.id,
            name: assessment.name,
            type: assessment.type,
            platform: assessment.platform,
            link: assessment.link,
            receivedAt: toLocal(assessment.receivedAt),
            deadline: toLocal(assessment.deadline),
            scheduledStart: toLocal(assessment.scheduledStart),
            timeLimitMinutes: assessment.timeLimitMinutes,
            proctored: assessment.proctored,
            progress: assessment.progress,
            submittedAt: toLocal(assessment.submittedAt),
            result: assessment.result,
            score: assessment.score,
            notes: assessment.notes,
          }
        : {
            applicationId: application.id,
            type: "unknown",
            proctored: "unknown",
            progress: "not-started",
            result: "pending",
          },
    );
  }

  function update<Key extends keyof AssessmentInput>(
    key: Key,
    value: AssessmentInput[Key],
  ) {
    if (draft) setDraft({ ...draft, [key]: value });
  }

  async function save() {
    if (!draft || busy) return;
    const input = assessmentDraftToInput(draft, original);
    const validation = validateAssessment(input);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    const result = editingId
      ? await assessmentActions.updateAssessment(
          editingId,
          assessmentDraftToUpdate(draft, original!),
        )
      : await assessmentActions.addAssessment(input);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDraft(null);
    setError("");
  }

  async function markSubmitted(assessment: Assessment) {
    setBusy(true);
    const result = await assessmentActions.updateAssessment(
      assessment.id,
      submittedAssessmentUpdate(new Date().toISOString()),
    );
    setBusy(false);
    setError(result.ok ? "" : result.error);
  }

  async function remove(assessment: Assessment) {
    if (
      !window.confirm(
        `Delete assessment ${assessment.number}? This cannot be undone.`,
      )
    )
      return;
    setBusy(true);
    const result = await assessmentActions.deleteAssessment(assessment.id);
    setBusy(false);
    setError(result.ok ? "" : result.error);
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Assessments</h3>
          <p className="mt-1 text-sm text-muted">
            Track each assessment, deadline, and submission separately.
          </p>
        </div>
        {!application.archivedAt && !draft ? (
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-slate-50"
            onClick={() => edit()}
            type="button"
          >
            <Plus size={16} aria-hidden="true" />
            Add assessment
          </button>
        ) : null}
      </div>
      {draft ? (
        <div className="mt-3 rounded-lg border border-border bg-surface-raised p-4">
          <h4 className="text-sm font-semibold text-foreground">
            {deadlineOnly
              ? "Edit assessment deadline"
              : editingId
                ? "Edit assessment"
                : "Add assessment"}
          </h4>
          <fieldset disabled={busy} className="mt-4 grid gap-4 sm:grid-cols-2">
            {!deadlineOnly ? (
              <>
                <Field label="Assessment name">
                  <input
                    className="field-control"
                    value={draft.name ?? ""}
                    onChange={(e) => update("name", e.target.value)}
                  />
                </Field>
                <Field label="Assessment type">
                  <select
                    className="field-control"
                    value={draft.type}
                    onChange={(e) =>
                      update("type", e.target.value as AssessmentInput["type"])
                    }
                  >
                    {ASSESSMENT_TYPES.map((value) => (
                      <option key={value} value={value}>
                        {assessmentLabel(value)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Platform / provider">
                  <input
                    className="field-control"
                    value={draft.platform ?? ""}
                    onChange={(e) => update("platform", e.target.value)}
                  />
                </Field>
                <Field label="Assessment link">
                  <input
                    className="field-control"
                    type="url"
                    placeholder="https://…"
                    value={draft.link ?? ""}
                    onChange={(e) => update("link", e.target.value)}
                  />
                </Field>
              </>
            ) : null}
            <InterviewDeadlineFields
              deadline={draft.deadline ?? ""}
              receivedAt={draft.receivedAt ?? ""}
              onChange={({ deadline, receivedAt }) =>
                setDraft({ ...draft, deadline, receivedAt })
              }
            />
            {!deadlineOnly ? (
              <>
                <Field label="Time limit (minutes)">
                  <input
                    className="field-control"
                    type="number"
                    min="1"
                    value={draft.timeLimitMinutes ?? ""}
                    onChange={(e) =>
                      update(
                        "timeLimitMinutes",
                        e.target.value ? Number(e.target.value) : undefined,
                      )
                    }
                  />
                </Field>
                <Field label="Proctored">
                  <select
                    className="field-control"
                    value={draft.proctored}
                    onChange={(e) =>
                      update(
                        "proctored",
                        e.target.value as AssessmentInput["proctored"],
                      )
                    }
                  >
                    <option value="unknown">Unknown</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </Field>
                <Field label="Assessment progress">
                  <select
                    className="field-control"
                    value={draft.progress}
                    onChange={(e) =>
                      update(
                        "progress",
                        e.target.value as AssessmentInput["progress"],
                      )
                    }
                  >
                    {ASSESSMENT_PROGRESS.map((value) => (
                      <option key={value} value={value}>
                        {assessmentLabel(value)}
                      </option>
                    ))}
                  </select>
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={fixedTime}
                    onChange={(e) => {
                      setFixedTime(e.target.checked);
                      if (!e.target.checked)
                        update("scheduledStart", undefined);
                    }}
                  />
                  Fixed-time assessment
                </label>
                {fixedTime ? (
                  <Field label="Scheduled start">
                    <input
                      className="field-control"
                      type="datetime-local"
                      value={draft.scheduledStart ?? ""}
                      onChange={(e) => update("scheduledStart", e.target.value)}
                    />
                  </Field>
                ) : null}
                {draft.progress === "submitted" || draft.submittedAt ? (
                  <Field label="Submitted at">
                    <input
                      className="field-control"
                      type="datetime-local"
                      value={draft.submittedAt ?? ""}
                      onChange={(e) => update("submittedAt", e.target.value)}
                    />
                  </Field>
                ) : null}
                <details
                  className="sm:col-span-2"
                  open={
                    draft.progress === "submitted" ||
                    (draft.result !== "unknown" &&
                      draft.result !== "pending") ||
                    Boolean(draft.score)
                  }
                >
                  <summary className="cursor-pointer text-sm font-medium">
                    Result and score
                  </summary>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <Field label="Result">
                      <select
                        className="field-control"
                        value={draft.result}
                        onChange={(e) =>
                          update(
                            "result",
                            e.target.value as AssessmentInput["result"],
                          )
                        }
                      >
                        {ASSESSMENT_RESULTS.map((value) => (
                          <option key={value} value={value}>
                            {assessmentLabel(value)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Score (optional)">
                      <input
                        className="field-control"
                        value={draft.score ?? ""}
                        onChange={(e) => update("score", e.target.value)}
                      />
                    </Field>
                  </div>
                </details>
                <div className="sm:col-span-2">
                  <Field label="Notes / instructions">
                    <textarea
                      className="field-control min-h-24"
                      value={draft.notes ?? ""}
                      onChange={(e) => update("notes", e.target.value)}
                    />
                  </Field>
                </div>
              </>
            ) : null}
          </fieldset>
          <div className="mt-4 flex gap-2">
            <button
              className="min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"
              disabled={busy}
              onClick={() => void save()}
              type="button"
            >
              {busy ? "Saving…" : "Save assessment"}
            </button>
            <button
              className="min-h-10 rounded-lg border border-border px-4 text-sm"
              disabled={busy}
              onClick={() => {
                setDraft(null);
                setError("");
              }}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-3 grid gap-3">
        {assessments.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted">
            No assessments added yet.
          </p>
        ) : (
          [...assessments]
            .sort((a, b) => a.number - b.number)
            .map((assessment) => {
              const link = getSafeHttpUrl(assessment.link);
              const canSubmit =
                assessment.progress !== "submitted" &&
                assessment.progress !== "cancelled";
              return (
                <article
                  className="rounded-lg border border-border bg-surface-raised p-3"
                  key={assessment.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="break-words text-sm font-semibold">
                        Assessment {assessment.number}
                        {assessment.name ? ` · ${assessment.name}` : ""}
                      </h4>
                      {assessment.originalInterviewRound !== undefined ? (
                        <p className="mt-1 text-xs text-muted">
                          Originally Round {assessment.originalInterviewRound}
                        </p>
                      ) : null}
                      <p className="mt-1 text-sm text-muted">
                        {assessmentLabel(assessment.type)} ·{" "}
                        {assessmentLabel(assessment.progress)}
                      </p>
                    </div>
                    {!application.archivedAt ? (
                      <div className="flex shrink-0 gap-1">
                        <button
                          className="icon-button"
                          aria-label={`Edit assessment ${assessment.number}`}
                          disabled={busy || Boolean(draft)}
                          onClick={() => edit(assessment)}
                          type="button"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-button text-destructive"
                          aria-label={`Delete assessment ${assessment.number}`}
                          disabled={busy || Boolean(draft)}
                          onClick={() => void remove(assessment)}
                          type="button"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <Detail
                      label="Deadline"
                      value={dateLabel(assessment.deadline)}
                    />
                    <Detail
                      label="Platform / provider"
                      value={assessment.platform}
                    />
                    <Detail
                      label="Invitation received"
                      value={dateLabel(assessment.receivedAt)}
                    />
                    <Detail
                      label="Proctored"
                      value={
                        assessment.proctored === "unknown"
                          ? "Unknown"
                          : assessment.proctored === "yes"
                            ? "Yes"
                            : "No"
                      }
                    />
                    {assessment.timeLimitMinutes !== undefined ? (
                      <Detail
                        label="Time limit"
                        value={`${assessment.timeLimitMinutes} minutes`}
                      />
                    ) : null}
                    {assessment.scheduledStart ? (
                      <Detail
                        label="Scheduled start"
                        value={dateLabel(assessment.scheduledStart)}
                      />
                    ) : null}
                    {assessment.submittedAt ? (
                      <Detail
                        label="Submitted at"
                        value={dateLabel(assessment.submittedAt)}
                      />
                    ) : null}
                    <Detail
                      label="Result"
                      value={assessmentLabel(assessment.result)}
                    />
                    {assessment.score ? (
                      <Detail label="Score" value={assessment.score} />
                    ) : null}
                  </div>
                  {assessment.notes ? (
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm">
                      {assessment.notes}
                    </p>
                  ) : null}
                  {assessment.legacyInterview ? (
                    <details className="mt-3 text-xs text-muted">
                      <summary className="cursor-pointer">
                        Original interview details
                      </summary>
                      <p className="mt-2">
                        Type:{" "}
                        {getInterviewTypeLabel(assessment.legacyInterview.type)}{" "}
                        · Format: {assessment.legacyInterview.mode}
                      </p>
                      {assessment.legacyInterview.location ? (
                        <p className="mt-1">
                          Location: {assessment.legacyInterview.location}
                        </p>
                      ) : null}
                    </details>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                    {link ? (
                      <a
                        className="inline-flex min-h-8 items-center gap-1 rounded-md border border-border px-2 text-primary"
                        href={link}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open assessment
                        <ExternalLink size={14} aria-hidden="true" />
                      </a>
                    ) : null}
                    {!application.archivedAt ? (
                      <>
                        {canSubmit ? (
                          <button
                            className="min-h-8 rounded-md border border-border px-2"
                            disabled={busy || Boolean(draft)}
                            onClick={() => void markSubmitted(assessment)}
                            type="button"
                          >
                            Mark submitted
                          </button>
                        ) : null}
                        <button
                          className="min-h-8 rounded-md border border-border px-2"
                          disabled={busy || Boolean(draft)}
                          onClick={() => edit(assessment, true)}
                          type="button"
                        >
                          Edit deadline
                        </button>
                      </>
                    ) : null}
                  </div>
                </article>
              );
            })
        )}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
function Detail({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-muted">{label}</p>
      <p className="mt-1 break-words">{value || "—"}</p>
    </div>
  );
}
function dateLabel(value?: string) {
  return value ? formatDateTime(value) : undefined;
}
function toLocal(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function assessmentDraftToInput(
  draft: AssessmentInput,
  original?: Assessment,
): AssessmentInput {
  const date = (value?: string) =>
    !value
      ? undefined
      : Number.isNaN(new Date(value).getTime())
        ? value
        : new Date(value).toISOString();
  const preservedDate = (
    key: "receivedAt" | "deadline" | "scheduledStart" | "submittedAt",
  ) =>
    original && toLocal(original[key]) === (draft[key] ?? "")
      ? original[key]
      : date(draft[key]);
  return {
    ...draft,
    name: draft.name?.trim() || undefined,
    platform: draft.platform?.trim() || undefined,
    link: draft.link?.trim() || undefined,
    receivedAt: preservedDate("receivedAt"),
    deadline: preservedDate("deadline"),
    scheduledStart: preservedDate("scheduledStart"),
    submittedAt: preservedDate("submittedAt"),
    score: draft.score?.trim() || undefined,
    notes: draft.notes?.trim() || undefined,
  };
}

export function assessmentDraftToUpdate(
  draft: AssessmentInput,
  original: Assessment,
): AssessmentUpdate {
  const input = assessmentDraftToInput(draft, original);
  const initial = assessmentDraftToInput({
    ...original,
    receivedAt: toLocal(original.receivedAt),
    deadline: toLocal(original.deadline),
    scheduledStart: toLocal(original.scheduledStart),
    submittedAt: toLocal(original.submittedAt),
  }, original);
  return Object.fromEntries(
    Object.entries(input).filter(([key, value]) =>
      key !== "applicationId" && value !== initial[key as keyof AssessmentInput],
    ),
  ) as AssessmentUpdate;
}
