import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { APPLICATION_STATUSES } from "../../lib/constants";
import { APPLICATION_SOURCES } from "../../lib/domain";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import type { ApplicationInput } from "../../store/useTrackerStore";
import type {
  ApplicationStatus,
  DeadlineEntryMode,
  JobType,
  Priority,
  ResumeMetadata,
  WorkMode,
} from "../../types/application";

interface AddApplicationModalProps {
  defaultFollowUpPromptDays: number;
  isOpen: boolean;
  onClose: () => void;
  onCreate: (input: ApplicationInput) => void;
  resumes: ResumeMetadata[];
}

interface AddApplicationFormState {
  company: string;
  jobTitle: string;
  jobDescription: string;
  status: ApplicationStatus | "";
  location: string;
  workMode: WorkMode;
  jobType: JobType;
  source: string;
  applicationUrl: string;
  dateApplied: string;
  deadline: string;
  deadlineEntryMode: DeadlineEntryMode;
  roleStartDate: string;
  roleEndDate: string;
  followUpNeeded: boolean;
  followUpDate: string;
  followUpPromptDays: string;
  interviewRound: string;
  interviewDateTime: string;
  interviewType: ApplicationInput["interviewType"];
  priority: Priority;
  resumeId: string;
  coverLetterVersion: string;
  salary: string;
  notes: string;
}

const initialFormState: AddApplicationFormState = {
  company: "",
  jobTitle: "",
  jobDescription: "",
  status: "",
  location: "",
  workMode: "unknown",
  jobType: "internship",
  source: "",
  applicationUrl: "",
  dateApplied: "",
  deadline: "",
  deadlineEntryMode: "exact",
  roleStartDate: "",
  roleEndDate: "",
  followUpNeeded: false,
  followUpDate: "",
  followUpPromptDays: "",
  interviewRound: "",
  interviewDateTime: "",
  interviewType: "unknown",
  priority: "medium",
  resumeId: "",
  coverLetterVersion: "",
  salary: "",
  notes: "",
};

export function AddApplicationModal({
  defaultFollowUpPromptDays,
  isOpen,
  onClose,
  onCreate,
  resumes,
}: AddApplicationModalProps) {
  const [form, setForm] = useState<AddApplicationFormState>(initialFormState);
  const [titleError, setTitleError] = useState("");

  useEscapeKey(isOpen, handleClose);

  if (!isOpen) {
    return null;
  }

  const canSave = form.jobTitle.trim().length > 0;

  function updateForm<Key extends keyof AddApplicationFormState>(
    key: Key,
    value: AddApplicationFormState[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === "jobTitle") {
      setTitleError("");
    }
  }

  function handleClose() {
    setTitleError("");
    onClose();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTitle = form.jobTitle.trim();

    if (!trimmedTitle) {
      setTitleError("Job Title is required.");
      return;
    }

    const isInterviewing = form.status === "Interviewing";

    onCreate({
      company: trimOptional(form.company) ?? "",
      jobTitle: trimmedTitle,
      jobDescription: trimOptional(form.jobDescription) ?? "",
      status: form.status || "Just Applied",
      location: trimOptional(form.location),
      workMode: form.workMode,
      jobType: form.jobType,
      source: trimOptional(form.source),
      applicationUrl: trimOptional(form.applicationUrl),
      dateApplied: trimOptional(form.dateApplied),
      deadline: trimOptional(form.deadline),
      deadlineEntryMode: form.deadlineEntryMode,
      roleStartDate: trimOptional(form.roleStartDate),
      roleEndDate: trimOptional(form.roleEndDate),
      followUpNeeded: form.followUpNeeded,
      followUpDate: trimOptional(form.followUpDate),
      followUpPromptDays:
        Number(form.followUpPromptDays) || defaultFollowUpPromptDays,
      interviewRound:
        isInterviewing ? Number(form.interviewRound) || undefined : undefined,
      interviewDateTime: isInterviewing
        ? trimOptional(form.interviewDateTime)
        : undefined,
      interviewType: isInterviewing ? form.interviewType : undefined,
      interviewMode: undefined,
      interviewLocation: undefined,
      interviewMeetingUrl: undefined,
      interviewPlatform: undefined,
      interviewProctored: false,
      interviewDeadline: undefined,
      priority: form.priority,
      resumeId: trimOptional(form.resumeId),
      coverLetterVersion: trimOptional(form.coverLetterVersion),
      salary: trimOptional(form.salary),
      notes: trimOptional(form.notes),
    });

    setForm(initialFormState);
    setTitleError("");
    onClose();
  }

  return (
    <div
      aria-labelledby="add-application-title"
      aria-modal="true"
      className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      role="dialog"
    >
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-surface shadow-popover">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
          <h2
            className="text-lg font-semibold text-foreground"
            id="add-application-title"
          >
            Add job
          </h2>
          <button className="icon-button" onClick={handleClose} type="button">
            <X aria-hidden="true" size={18} />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <form
          className="overflow-y-auto px-4 py-5 sm:px-6"
          id="add-application-form"
          onSubmit={handleSubmit}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Job Title" required>
              <input
                aria-describedby={titleError ? "job-title-error" : undefined}
                aria-invalid={titleError ? "true" : "false"}
                className="field-control"
                onChange={(event) => updateForm("jobTitle", event.target.value)}
                required
                type="text"
                value={form.jobTitle}
              />
              {titleError ? (
                <p className="mt-1 text-xs font-medium text-destructive" id="job-title-error">
                  {titleError}
                </p>
              ) : null}
            </Field>

            <Field className="md:col-span-2" label="Job Description">
              <textarea
                className="field-control min-h-28 resize-y"
                onChange={(event) =>
                  updateForm("jobDescription", event.target.value)
                }
                value={form.jobDescription}
              />
            </Field>

            <Field label="Company">
              <input
                className="field-control"
                onChange={(event) => updateForm("company", event.target.value)}
                type="text"
                value={form.company}
              />
            </Field>

            <Field label="Status">
              <select
                className="field-control"
                onChange={(event) =>
                  updateForm("status", event.target.value as ApplicationStatus | "")
                }
                value={form.status}
              >
                <option value=""></option>
                {APPLICATION_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>

            {form.status === "Interviewing" ? (
              <>
                <Field label="Interview Number">
                  <input
                    className="field-control"
                    min="1"
                    onChange={(event) =>
                      updateForm("interviewRound", event.target.value)
                    }
                    type="number"
                    value={form.interviewRound}
                  />
                </Field>

                <Field label="Interview Type">
                  <select
                    className="field-control"
                    onChange={(event) =>
                      updateForm(
                        "interviewType",
                        event.target
                          .value as AddApplicationFormState["interviewType"],
                      )
                    }
                    value={form.interviewType}
                  >
                    <option value="unknown"></option>
                    <option value="technical">Technical</option>
                    <option value="face-to-face">Face-to-face</option>
                    <option value="HireVue">HireVue</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
              </>
            ) : null}

            <Field label="Applied Date">
              <input
                className="field-control"
                onChange={(event) => updateForm("dateApplied", event.target.value)}
                type="date"
                value={form.dateApplied}
              />
            </Field>

            <Field label="Deadline">
              <input
                className="field-control"
                onChange={(event) => updateForm("deadline", event.target.value)}
                type="date"
                value={form.deadline}
              />
            </Field>

            <Field label="Follow-up Date">
              <input
                className="field-control"
                onChange={(event) => updateForm("followUpDate", event.target.value)}
                type="date"
                value={form.followUpDate}
              />
            </Field>

            {form.status === "Interviewing" ? (
              <Field label="Interview Date/Time">
                <input
                  className="field-control"
                  onChange={(event) =>
                    updateForm("interviewDateTime", event.target.value)
                  }
                  type="datetime-local"
                  value={form.interviewDateTime}
                />
              </Field>
            ) : null}

            <Field label="Resume">
              <select
                className="field-control"
                onChange={(event) => updateForm("resumeId", event.target.value)}
                value={form.resumeId}
              >
                <option value="">No resume selected</option>
                {resumes.map((resume) => (
                  <option key={resume.id} value={resume.id}>
                    {resume.displayName}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Location">
              <input
                className="field-control"
                onChange={(event) => updateForm("location", event.target.value)}
                type="text"
                value={form.location}
              />
            </Field>

            <Field label="Work Mode">
              <select
                className="field-control"
                onChange={(event) =>
                  updateForm("workMode", event.target.value as WorkMode)
                }
                value={form.workMode}
              >
                <option value="unknown">Unknown</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">Onsite</option>
              </select>
            </Field>

            <Field label="Job Type">
              <select
                className="field-control"
                onChange={(event) =>
                  updateForm("jobType", event.target.value as JobType)
                }
                value={form.jobType}
              >
                <option value="internship">Internship</option>
                <option value="part-time">Part-time</option>
                <option value="full-time">Full-time</option>
                <option value="contract">Contract</option>
                <option value="other">Other</option>
              </select>
            </Field>

            <Field label="Source">
              <select
                className="field-control"
                onChange={(event) => updateForm("source", event.target.value)}
                value={form.source}
              >
                <option value=""></option>
                {APPLICATION_SOURCES.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Application URL">
              <input
                className="field-control"
                onChange={(event) => updateForm("applicationUrl", event.target.value)}
                type="url"
                value={form.applicationUrl}
              />
            </Field>

            <Field label="Role Start Date">
              <input
                className="field-control"
                onChange={(event) => updateForm("roleStartDate", event.target.value)}
                type="date"
                value={form.roleStartDate}
              />
            </Field>

            <Field label="Role End Date">
              <input
                className="field-control"
                onChange={(event) => updateForm("roleEndDate", event.target.value)}
                type="date"
                value={form.roleEndDate}
              />
            </Field>

            <Field label="Deadline Timing">
              <select
                className="field-control"
                onChange={(event) =>
                  updateForm(
                    "deadlineEntryMode",
                    event.target.value as DeadlineEntryMode,
                  )
                }
                value={form.deadlineEntryMode}
              >
                <option value="exact">Exact date/time</option>
                <option value="1_day">1 day</option>
                <option value="2_days">2 days</option>
                <option value="3_days">3 days</option>
                <option value="72_hours">72 hours</option>
              </select>
            </Field>

            <label className="flex items-center gap-3 rounded-lg border border-border bg-surface-raised px-3 py-3 text-sm font-medium text-foreground md:col-span-2">
              <input
                className="h-4 w-4 rounded border-border text-primary"
                checked={form.followUpNeeded}
                onChange={(event) =>
                  updateForm("followUpNeeded", event.target.checked)
                }
                type="checkbox"
              />
              <span>Follow-up Needed</span>
            </label>

            <Field label="Follow-up Prompt Days">
              <input
                className="field-control"
                min="1"
                onChange={(event) =>
                  updateForm("followUpPromptDays", event.target.value)
                }
                placeholder={String(defaultFollowUpPromptDays)}
                type="number"
                value={form.followUpPromptDays}
              />
            </Field>

            <Field label="Priority">
              <select
                className="field-control"
                onChange={(event) =>
                  updateForm("priority", event.target.value as Priority)
                }
                value={form.priority}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </Field>

            <Field label="Cover Letter Version">
              <input
                className="field-control"
                onChange={(event) =>
                  updateForm("coverLetterVersion", event.target.value)
                }
                type="text"
                value={form.coverLetterVersion}
              />
            </Field>

            <Field label="Salary / Pay">
              <input
                className="field-control"
                onChange={(event) => updateForm("salary", event.target.value)}
                type="text"
                value={form.salary}
              />
            </Field>

            <Field className="md:col-span-2" label="Notes">
              <textarea
                className="field-control min-h-28 resize-y"
                onChange={(event) => updateForm("notes", event.target.value)}
                value={form.notes}
              />
            </Field>
          </div>
        </form>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-4 sm:px-6">
          <button
            className="h-10 rounded-lg border border-border px-4 text-sm font-semibold text-foreground hover:bg-slate-50"
            onClick={handleClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className={`h-10 rounded-lg px-4 text-sm font-semibold ${
              canSave
                ? "bg-primary text-primary-foreground hover:bg-blue-700"
                : "bg-slate-200 text-slate-500"
            }`}
            disabled={!canSave}
            form="add-application-form"
            type="submit"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function trimOptional(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function Field({
  children,
  className = "",
  label,
  required = false,
}: {
  children: ReactNode;
  className?: string;
  label: string;
  required?: boolean;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 flex items-center gap-1 text-sm font-medium text-foreground">
        {label}
        {required ? <span className="text-destructive">*</span> : null}
      </span>
      {children}
    </label>
  );
}
