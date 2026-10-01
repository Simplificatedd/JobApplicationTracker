import { Upload, X } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  APPLICATION_STATUSES,
  INTERVIEW_MODE_OPTIONS,
  INTERVIEW_TYPE_OPTIONS,
} from "../../lib/constants";
import {
  APPLICATION_SOURCES,
  DEFAULT_APPLICATION_STATUS,
} from "../../lib/domain";
import { suggestInterviewDeadline } from "../../lib/interviews";
import { UnsavedChangesDialog } from "../../components/UnsavedChangesDialog";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import {
  deadlineValueForEntryMode,
  type DuplicateApplicationMatch,
  findDuplicateApplication,
  suggestFollowUpDate,
  validateInterviewRound,
} from "./applicationForm";
import type {
  ApplicationInput,
  MutationResult,
  PendingResumeUpload,
} from "../../store/useTrackerStore";
import type {
  ApplicationStatus,
  Application,
  CoverLetterMetadata,
  DeadlineEntryMode,
  JobType,
  Priority,
  ResumeMetadata,
  WorkMode,
} from "../../types/application";

interface AddApplicationModalProps {
  applications: Application[];
  defaultFollowUpPromptDays: number;
  isOpen: boolean;
  onClose: () => void;
  onCreate: (
    input: ApplicationInput,
    pendingResume?: PendingResumeUpload,
    pendingCoverLetter?: PendingResumeUpload,
  ) => Promise<MutationResult<Application>>;
  coverLetters: CoverLetterMetadata[];
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
  interviewMode: ApplicationInput["interviewMode"];
  interviewLocation: string;
  interviewMeetingUrl: string;
  interviewPlatform: string;
  interviewProctored: boolean;
  interviewDeadline: string;
  interviewDeadlineEntryMode: DeadlineEntryMode;
  interviewDeadlineReceivedAt: string;
  priority: Priority;
  resumeId: string;
  resumeUploadName: string;
  resumeUploadVersion: string;
  coverLetterId: string;
  coverLetterUploadName: string;
  coverLetterUploadVersion: string;
  coverLetterVersion: string;
  salary: string;
  notes: string;
}

function createInitialFormState(
  defaultFollowUpPromptDays: number,
): AddApplicationFormState {
  return {
    company: "",
    jobTitle: "",
    jobDescription: "",
    status: DEFAULT_APPLICATION_STATUS,
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
    followUpDate: suggestFollowUpDate("", defaultFollowUpPromptDays),
    followUpPromptDays: "",
    interviewRound: "1",
    interviewDateTime: "",
    interviewType: "unknown",
    interviewMode: "unknown",
    interviewLocation: "",
    interviewMeetingUrl: "",
    interviewPlatform: "",
    interviewProctored: false,
    interviewDeadline: "",
    interviewDeadlineEntryMode: "exact",
    interviewDeadlineReceivedAt: "",
    priority: "medium",
    resumeId: "",
    resumeUploadName: "",
    resumeUploadVersion: "",
    coverLetterId: "",
    coverLetterUploadName: "",
    coverLetterUploadVersion: "",
    coverLetterVersion: "",
    salary: "",
    notes: "",
  };
}

export function AddApplicationModal({
  applications,
  coverLetters,
  defaultFollowUpPromptDays,
  isOpen,
  onClose,
  onCreate,
  resumes,
}: AddApplicationModalProps) {
  const [cleanForm, setCleanForm] = useState<AddApplicationFormState>(() =>
    createInitialFormState(defaultFollowUpPromptDays),
  );
  const [form, setForm] = useState<AddApplicationFormState>(cleanForm);
  const [isFollowUpDateCustomized, setIsFollowUpDateCustomized] =
    useState(false);
  const [isDiscardWarningOpen, setIsDiscardWarningOpen] = useState(false);
  const [resumeUploadFile, setResumeUploadFile] = useState<File | null>(null);
  const [coverLetterUploadFile, setCoverLetterUploadFile] =
    useState<File | null>(null);
  const [coverLetterUploadError, setCoverLetterUploadError] = useState("");
  const [resumeUploadError, setResumeUploadError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [titleError, setTitleError] = useState("");
  const [interviewRoundError, setInterviewRoundError] = useState("");
  const [duplicateMatch, setDuplicateMatch] =
    useState<DuplicateApplicationMatch | null>(null);

  useEscapeKey(
    isOpen && !isDiscardWarningOpen && !duplicateMatch,
    requestClose,
  );

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
    if (key === "interviewRound") {
      setInterviewRoundError("");
    }
  }

  function requestClose() {
    if (isSaving) {
      return;
    }

    if (isFormDirty(form, cleanForm) || resumeUploadFile || coverLetterUploadFile) {
      setIsDiscardWarningOpen(true);
      return;
    }

    closeModal();
  }

  function closeModal() {
    setDuplicateMatch(null);
    setTitleError("");
    setInterviewRoundError("");
    setResumeUploadError("");
    setCoverLetterUploadError("");
    onClose();
  }

  function discardAndClose() {
    resetForm();
    setResumeUploadFile(null);
    setCoverLetterUploadFile(null);
    setIsDiscardWarningOpen(false);
    setDuplicateMatch(null);
    setResumeUploadError("");
    setCoverLetterUploadError("");
    setTitleError("");
    setInterviewRoundError("");
    onClose();
  }

  function resetForm() {
    const nextForm = createInitialFormState(defaultFollowUpPromptDays);

    setCleanForm(nextForm);
    setForm(nextForm);
    setIsFollowUpDateCustomized(false);
  }

  function updateAppliedDate(value: string) {
    setForm((current) => ({
      ...current,
      dateApplied: value,
      followUpDate: isFollowUpDateCustomized
        ? current.followUpDate
        : suggestFollowUpDate(
            value,
            Number(current.followUpPromptDays) || defaultFollowUpPromptDays,
          ),
    }));
  }

  function updateFollowUpPromptDays(value: string) {
    setForm((current) => ({
      ...current,
      followUpPromptDays: value,
      followUpDate: isFollowUpDateCustomized
        ? current.followUpDate
        : suggestFollowUpDate(
            current.dateApplied,
            Number(value) || defaultFollowUpPromptDays,
          ),
    }));
  }

  function updateDeadlineEntryMode(value: DeadlineEntryMode) {
    setForm((current) => ({
      ...current,
      deadline: deadlineValueForEntryMode(current.deadline, value),
      deadlineEntryMode: value,
    }));
  }

  function updateInterviewDeadlineEntryMode(value: DeadlineEntryMode) {
    setForm((current) => {
      const receivedAt =
        current.interviewDeadlineReceivedAt || toDateTimeLocal(new Date());
      const suggestedDeadline = suggestInterviewDeadline(value, receivedAt);

      return {
        ...current,
        interviewDeadline:
          suggestedDeadline !== undefined
            ? toDateTimeLocal(new Date(suggestedDeadline))
            : current.interviewDeadline,
        interviewDeadlineEntryMode: value,
        interviewDeadlineReceivedAt:
          value === "exact"
            ? current.interviewDeadlineReceivedAt
            : receivedAt,
      };
    });
  }

  function updateInterviewDeadlineReceivedAt(value: string) {
    setForm((current) => {
      const suggestedDeadline = suggestInterviewDeadline(
        current.interviewDeadlineEntryMode,
        value,
      );

      return {
        ...current,
        interviewDeadline:
          suggestedDeadline !== undefined
            ? toDateTimeLocal(new Date(suggestedDeadline))
            : current.interviewDeadline,
        interviewDeadlineReceivedAt: value,
      };
    });
  }

  function requestCloseFromBackdrop(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      requestClose();
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await saveApplication(false);
  }

  async function saveApplication(
    skipDuplicateCheck: boolean,
    skipRoundWarning = false,
  ) {
    const trimmedTitle = form.jobTitle.trim();

    if (!trimmedTitle) {
      setTitleError("Job Title is required.");
      return;
    }

    const isInterviewing = form.status === "Interviewing";
    const roundValidation = validateInterviewRound(
      isInterviewing ? form.interviewRound : "",
    );

    if (roundValidation.error) {
      setInterviewRoundError(roundValidation.error);
      return;
    }

    setInterviewRoundError("");

    if (
      !skipRoundWarning &&
      roundValidation.warnings.length > 0 &&
      !window.confirm(
        `${roundValidation.warnings.join("\n")}\n\nSave this interview round anyway?`,
      )
    ) {
      return;
    }

    const input: ApplicationInput = {
      company: trimOptional(form.company) ?? "",
      jobTitle: trimmedTitle,
      jobDescription: trimOptional(form.jobDescription) ?? "",
      status: form.status || DEFAULT_APPLICATION_STATUS,
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
      interviewRound: isInterviewing ? roundValidation.round : undefined,
      interviewDateTime: isInterviewing
        ? trimOptional(form.interviewDateTime)
        : undefined,
      interviewType: isInterviewing ? form.interviewType : undefined,
      interviewMode: isInterviewing ? form.interviewMode : undefined,
      interviewLocation: isInterviewing
        ? trimOptional(form.interviewLocation)
        : undefined,
      interviewMeetingUrl: isInterviewing
        ? trimOptional(form.interviewMeetingUrl)
        : undefined,
      interviewPlatform: isInterviewing
        ? trimOptional(form.interviewPlatform)
        : undefined,
      interviewProctored: isInterviewing ? form.interviewProctored : false,
      interviewDeadline: isInterviewing
        ? trimOptional(form.interviewDeadline)
        : undefined,
      interviewDeadlineEntryMode: isInterviewing
        ? form.interviewDeadlineEntryMode
        : undefined,
      interviewDeadlineReceivedAt: isInterviewing
        ? trimOptional(form.interviewDeadlineReceivedAt)
        : undefined,
      priority: form.priority,
      resumeId: trimOptional(form.resumeId),
      coverLetterId: trimOptional(form.coverLetterId),
      coverLetterVersion: trimOptional(form.coverLetterVersion),
      salary: trimOptional(form.salary),
      notes: trimOptional(form.notes),
    };

    if (!skipDuplicateCheck) {
      const duplicate = findDuplicateApplication(applications, input);

      if (duplicate) {
        setDuplicateMatch(duplicate);
        return;
      }
    }

    setDuplicateMatch(null);
    setResumeUploadError("");
    setCoverLetterUploadError("");
    setIsSaving(true);
    const result = await onCreate(
      input,
      resumeUploadFile
        ? {
            file: resumeUploadFile,
            options: {
              displayName: form.resumeUploadName,
              markAsUsed: true,
              versionLabel: form.resumeUploadVersion,
            },
          }
        : undefined,
      coverLetterUploadFile
        ? {
            file: coverLetterUploadFile,
            options: {
              displayName: form.coverLetterUploadName,
              markAsUsed: true,
              versionLabel: form.coverLetterUploadVersion,
            },
          }
        : undefined,
    );
    setIsSaving(false);

    if (!result.ok) {
      setResumeUploadError(result.error);
      setCoverLetterUploadError(result.error);
      return;
    }

    resetForm();
    setResumeUploadFile(null);
    setCoverLetterUploadFile(null);
    setResumeUploadError("");
    setCoverLetterUploadError("");
    setTitleError("");
    onClose();
  }

  return (
    <div
      aria-labelledby="add-application-title"
      aria-modal="true"
      className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      onMouseDown={requestCloseFromBackdrop}
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
          <button
            className="icon-button"
            disabled={isSaving}
            onClick={requestClose}
            type="button"
          >
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
                {APPLICATION_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>

            {form.status === "Interviewing" ? (
              <section
                aria-labelledby="initial-interview-details-heading"
                className="grid gap-4 rounded-lg border border-border bg-surface-raised p-4 md:col-span-2 md:grid-cols-2"
              >
                <h3
                  className="text-sm font-semibold text-foreground md:col-span-2"
                  id="initial-interview-details-heading"
                >
                  Interview details
                </h3>

                <Field label="Interview Round">
                  <input
                    aria-describedby={
                      interviewRoundError ? "interview-round-error" : undefined
                    }
                    aria-invalid={interviewRoundError ? "true" : "false"}
                    className="field-control"
                    min="1"
                    onChange={(event) =>
                      updateForm("interviewRound", event.target.value)
                    }
                    step="1"
                    type="number"
                    value={form.interviewRound}
                  />
                  {interviewRoundError ? (
                    <p
                      className="mt-1 text-xs font-medium text-destructive"
                      id="interview-round-error"
                    >
                      {interviewRoundError}
                    </p>
                  ) : null}
                </Field>

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
                    {INTERVIEW_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Interview Mode">
                  <select
                    className="field-control"
                    onChange={(event) =>
                      updateForm(
                        "interviewMode",
                        event.target
                          .value as AddApplicationFormState["interviewMode"],
                      )
                    }
                    value={form.interviewMode}
                  >
                    {INTERVIEW_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Interview Location">
                  <input
                    className="field-control"
                    onChange={(event) =>
                      updateForm("interviewLocation", event.target.value)
                    }
                    type="text"
                    value={form.interviewLocation}
                  />
                </Field>

                <Field label="Meeting URL">
                  <input
                    className="field-control"
                    onChange={(event) =>
                      updateForm("interviewMeetingUrl", event.target.value)
                    }
                    type="url"
                    value={form.interviewMeetingUrl}
                  />
                </Field>

                <Field label="Interview Platform">
                  <input
                    className="field-control"
                    onChange={(event) =>
                      updateForm("interviewPlatform", event.target.value)
                    }
                    type="text"
                    value={form.interviewPlatform}
                  />
                </Field>

                <label className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-3 text-sm font-medium text-foreground">
                  <input
                    checked={form.interviewProctored}
                    className="h-4 w-4 rounded border-border text-primary"
                    onChange={(event) =>
                      updateForm("interviewProctored", event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>Proctored assessment</span>
                </label>

                <Field label="Deadline Timing">
                  <select
                    className="field-control"
                    onChange={(event) =>
                      updateInterviewDeadlineEntryMode(
                        event.target.value as DeadlineEntryMode,
                      )
                    }
                    value={form.interviewDeadlineEntryMode}
                  >
                    <option value="exact">Exact date/time</option>
                    <option value="1_day">1 day after received</option>
                    <option value="2_days">2 days after received</option>
                    <option value="3_days">3 days after received</option>
                    <option value="72_hours">72 hours after received</option>
                  </select>
                </Field>

                {form.interviewDeadlineEntryMode !== "exact" ? (
                  <Field label="Received Date/Time">
                    <input
                      className="field-control"
                      onChange={(event) =>
                        updateInterviewDeadlineReceivedAt(event.target.value)
                      }
                      type="datetime-local"
                      value={form.interviewDeadlineReceivedAt}
                    />
                  </Field>
                ) : null}

                <Field label="Assessment Deadline">
                  <input
                    className="field-control"
                    onChange={(event) =>
                      updateForm("interviewDeadline", event.target.value)
                    }
                    type="datetime-local"
                    value={form.interviewDeadline}
                  />
                </Field>
              </section>
            ) : null}

            <Field label="Applied Date">
              <input
                className="field-control"
                onChange={(event) => updateAppliedDate(event.target.value)}
                type="date"
                value={form.dateApplied}
              />
            </Field>

            <Field label="Application Deadline">
              <input
                className="field-control"
                onChange={(event) => updateForm("deadline", event.target.value)}
                type={
                  form.deadlineEntryMode === "exact" ? "datetime-local" : "date"
                }
                value={form.deadline}
              />
            </Field>

            <Field label="Application Deadline Timing">
              <select
                className="field-control"
                onChange={(event) =>
                  updateDeadlineEntryMode(
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

            <div className="grid gap-4 md:col-span-2 md:grid-cols-2">
              <Field label="Resume">
                <select
                  className="field-control"
                  onChange={(event) =>
                    updateForm("resumeId", event.target.value)
                  }
                  value={form.resumeId}
                >
                  <option value="">No resume selected</option>
                  {resumes.map((resume) => (
                    <option key={resume.id} value={resume.id}>
                      {resume.displayName}
                    </option>
                  ))}
                </select>
                <div className="mt-3 rounded-lg border border-border bg-surface-raised p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Upload aria-hidden="true" size={16} />
                    Upload new resume
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <input
                      accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="field-control sm:col-span-2"
                      onChange={(event) =>
                        setResumeUploadFile(event.target.files?.[0] ?? null)
                      }
                      type="file"
                    />
                    <input
                      className="field-control"
                      onChange={(event) =>
                        updateForm("resumeUploadName", event.target.value)
                      }
                      placeholder="Display name"
                      type="text"
                      value={form.resumeUploadName}
                    />
                    <input
                      className="field-control"
                      onChange={(event) =>
                        updateForm("resumeUploadVersion", event.target.value)
                      }
                      placeholder="Version label"
                      type="text"
                      value={form.resumeUploadVersion}
                    />
                  </div>
                  {resumeUploadError ? (
                    <p className="mt-2 text-xs font-medium text-destructive">
                      {resumeUploadError}
                    </p>
                  ) : null}
                </div>
              </Field>

              <Field label="Cover Letter">
                <select
                  className="field-control"
                  onChange={(event) =>
                    updateForm("coverLetterId", event.target.value)
                  }
                  value={form.coverLetterId}
                >
                  <option value="">No cover letter selected</option>
                  {coverLetters.map((coverLetter) => (
                    <option key={coverLetter.id} value={coverLetter.id}>
                      {coverLetter.displayName}
                    </option>
                  ))}
                </select>
                <div className="mt-3 rounded-lg border border-border bg-surface-raised p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Upload aria-hidden="true" size={16} />
                    Upload new cover letter
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <input
                      accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="field-control sm:col-span-2"
                      onChange={(event) =>
                        setCoverLetterUploadFile(event.target.files?.[0] ?? null)
                      }
                      type="file"
                    />
                    <input
                      className="field-control"
                      onChange={(event) =>
                        updateForm("coverLetterUploadName", event.target.value)
                      }
                      placeholder="Display name"
                      type="text"
                      value={form.coverLetterUploadName}
                    />
                    <input
                      className="field-control"
                      onChange={(event) =>
                        updateForm("coverLetterUploadVersion", event.target.value)
                      }
                      placeholder="Version label"
                      type="text"
                      value={form.coverLetterUploadVersion}
                    />
                  </div>
                  {coverLetterUploadError ? (
                    <p className="mt-2 text-xs font-medium text-destructive">
                      {coverLetterUploadError}
                    </p>
                  ) : null}
                </div>
              </Field>
            </div>

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

            <Field label="Follow-up Date">
              <input
                className="field-control"
                onChange={(event) => {
                  setIsFollowUpDateCustomized(true);
                  updateForm("followUpDate", event.target.value);
                }}
                type="date"
                value={form.followUpDate}
              />
            </Field>

            <Field label="Follow-up Prompt Days">
              <input
                className="field-control"
                min="1"
                onChange={(event) =>
                  updateFollowUpPromptDays(event.target.value)
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
            disabled={isSaving}
            onClick={requestClose}
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
            disabled={!canSave || isSaving}
            form="add-application-form"
            type="submit"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
        {isDiscardWarningOpen ? (
          <UnsavedChangesDialog
            onCancel={() => setIsDiscardWarningOpen(false)}
            onConfirm={discardAndClose}
          />
        ) : null}
        {duplicateMatch ? (
          <DuplicateApplicationDialog
            isSaving={isSaving}
            match={duplicateMatch}
            onCancel={() => setDuplicateMatch(null)}
            onConfirm={() => void saveApplication(true, true)}
          />
        ) : null}
      </div>
    </div>
  );
}

function DuplicateApplicationDialog({
  isSaving,
  match,
  onCancel,
  onConfirm,
}: {
  isSaving: boolean;
  match: DuplicateApplicationMatch;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEscapeKey(true, onCancel);

  return (
    <div
      aria-labelledby="duplicate-application-title"
      aria-modal="true"
      className="modal-overlay fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="alertdialog"
    >
      <div className="w-full max-w-md rounded-lg bg-surface p-5 shadow-popover">
        <h3
          className="text-lg font-semibold text-foreground"
          id="duplicate-application-title"
        >
          Possible duplicate application
        </h3>
        <p className="mt-2 text-sm leading-6 text-muted">
          This matches {match.application.jobTitle} at {match.application.company || "an unnamed company"} by {match.matchedBy}.
          {match.application.archivedAt ? " The existing entry is archived." : ""}
        </p>
        <p className="mt-2 text-sm text-foreground">
          Do you want to save another entry anyway?
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            className="h-10 rounded-lg border border-border px-4 text-sm font-semibold text-foreground hover:bg-slate-50"
            disabled={isSaving}
            onClick={onCancel}
            type="button"
          >
            Go back
          </button>
          <button
            className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-blue-700"
            disabled={isSaving}
            onClick={onConfirm}
            type="button"
          >
            {isSaving ? "Saving..." : "Save anyway"}
          </button>
        </div>
      </div>
    </div>
  );
}

function isFormDirty(
  form: AddApplicationFormState,
  cleanForm: AddApplicationFormState,
) {
  return Object.entries(form).some(([key, value]) => {
    const initialValue =
      cleanForm[key as keyof AddApplicationFormState];

    return value !== initialValue;
  });
}

function trimOptional(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toDateTimeLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
