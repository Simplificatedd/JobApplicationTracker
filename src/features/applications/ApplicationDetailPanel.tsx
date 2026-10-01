import {
  CalendarCheck,
  CalendarPlus,
  CalendarX,
  Check,
  Download,
  Eye,
  ExternalLink,
  Pencil,
  Upload,
  X,
} from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useState } from "react";
import { APPLICATION_STATUSES } from "../../lib/constants";
import { APPLICATION_SOURCES } from "../../lib/domain";
import {
  formatDate,
  formatDateRange,
  formatDateTime,
  formatUpdatedAt,
} from "../../lib/format";
import { getSafeHttpUrl } from "../../lib/urls";
import { UnsavedChangesDialog } from "../../components/UnsavedChangesDialog";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import type {
  ApplicationUpdate,
  MutationResult,
  PendingResumeUpload,
} from "../../store/useTrackerStore";
import type {
  Activity,
  Application,
  ApplicationContact,
  ApplicationStatus,
  CoverLetterMetadata,
  Interview,
  InterviewInput,
  InterviewUpdate,
  JobType,
  Priority,
  ResumeMetadata,
  WorkMode,
} from "../../types/application";
import { StatusBadge } from "./StatusBadge";
import { InterviewsSection } from "./InterviewsSection";

interface ApplicationDetailPanelProps {
  activities: Activity[];
  application: Application;
  contacts: ApplicationContact[];
  coverLetter?: CoverLetterMetadata;
  coverLetterActionError: string;
  coverLetters: CoverLetterMetadata[];
  onClose: () => void;
  onAddInterview: (
    input: InterviewInput,
  ) => Promise<MutationResult<Interview>>;
  onDeleteInterview: (id: string) => Promise<MutationResult>;
  onDownloadCoverLetter: (coverLetter: CoverLetterMetadata) => Promise<void>;
  onDownloadResume: (resume: ResumeMetadata) => Promise<void>;
  onPreviewResume: (resume: ResumeMetadata) => Promise<void>;
  onPreviewCoverLetter: (coverLetter: CoverLetterMetadata) => Promise<void>;
  onUpdate: (
    id: string,
    input: ApplicationUpdate,
    pendingResume?: PendingResumeUpload,
    pendingCoverLetter?: PendingResumeUpload,
  ) => Promise<MutationResult>;
  onUpdateInterview: (
    id: string,
    input: InterviewUpdate,
  ) => Promise<MutationResult<Interview>>;
  interviews: Interview[];
  resume?: ResumeMetadata;
  resumes: ResumeMetadata[];
  resumeActionError: string;
  workingResumeId: string | null;
  workingCoverLetterId: string | null;
}

export function ApplicationDetailPanel({
  activities,
  application,
  contacts,
  coverLetter,
  coverLetterActionError,
  coverLetters,
  interviews,
  onAddInterview,
  onClose,
  onDeleteInterview,
  onDownloadCoverLetter,
  onDownloadResume,
  onPreviewResume,
  onPreviewCoverLetter,
  onUpdate,
  onUpdateInterview,
  resume,
  resumes,
  resumeActionError,
  workingResumeId,
  workingCoverLetterId,
}: ApplicationDetailPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDiscardWarningOpen, setIsDiscardWarningOpen] = useState(false);
  const [draft, setDraft] = useState(() => toDraft(application));
  const [resumeUploadError, setResumeUploadError] = useState("");
  const [coverLetterUploadError, setCoverLetterUploadError] = useState("");
  const [resumeUploadFile, setResumeUploadFile] = useState<File | null>(null);
  const [coverLetterUploadFile, setCoverLetterUploadFile] =
    useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEscapeKey(!isDiscardWarningOpen, requestClose);

  function startEditing() {
    setDraft(toDraft(application));
    setResumeUploadError("");
    setCoverLetterUploadError("");
    setResumeUploadFile(null);
    setCoverLetterUploadFile(null);
    setIsEditing(true);
  }

  async function saveChanges() {
    setResumeUploadError("");
    setCoverLetterUploadError("");
    setIsSaving(true);
    const result = await onUpdate(application.id, {
      company: draft.company.trim(),
      jobTitle: draft.jobTitle.trim() || application.jobTitle,
      jobDescription: draft.jobDescription.trim(),
      status: draft.status,
      location: trimOptional(draft.location),
      workMode: draft.workMode,
      jobType: draft.jobType,
      source: trimOptional(draft.source),
      applicationUrl: trimOptional(draft.applicationUrl),
      dateApplied: trimOptional(draft.dateApplied),
      roleStartDate: trimOptional(draft.roleStartDate),
      roleEndDate: trimOptional(draft.roleEndDate),
      followUpNeeded: draft.followUpNeeded,
      followUpDate: trimOptional(draft.followUpDate),
      priority: draft.priority,
      resumeId: trimOptional(draft.resumeId),
      coverLetterId: trimOptional(draft.coverLetterId),
      coverLetterVersion: trimOptional(draft.coverLetterVersion),
      salary: trimOptional(draft.salary),
      notes: trimOptional(draft.notes),
    },
      resumeUploadFile
        ? {
            file: resumeUploadFile,
            options: {
              displayName: draft.resumeUploadName,
              markAsUsed: true,
              versionLabel: draft.resumeUploadVersion,
            },
          }
        : undefined,
      coverLetterUploadFile
        ? {
            file: coverLetterUploadFile,
            options: {
              displayName: draft.coverLetterUploadName,
              markAsUsed: true,
              versionLabel: draft.coverLetterUploadVersion,
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

    setResumeUploadFile(null);
    setCoverLetterUploadFile(null);
    setIsEditing(false);
  }

  function cancelEditing() {
    if (isSaving) {
      return;
    }

    setDraft(toDraft(application));
    setResumeUploadError("");
    setCoverLetterUploadError("");
    setResumeUploadFile(null);
    setCoverLetterUploadFile(null);
    setIsEditing(false);
  }

  function requestClose() {
    if (isSaving) {
      return;
    }

    if (
      isEditing &&
      (isDraftDirty(draft, application) ||
        resumeUploadFile ||
        coverLetterUploadFile)
    ) {
      setIsDiscardWarningOpen(true);
      return;
    }

    onClose();
  }

  function discardAndClose() {
    setIsDiscardWarningOpen(false);
    setDraft(toDraft(application));
    setResumeUploadError("");
    setCoverLetterUploadError("");
    setResumeUploadFile(null);
    setCoverLetterUploadFile(null);
    setIsEditing(false);
    onClose();
  }

  function requestCloseFromBackdrop(event: ReactMouseEvent<HTMLElement>) {
    if (event.target === event.currentTarget) {
      requestClose();
    }
  }

  return (
    <aside
      aria-labelledby="application-detail-title"
      aria-modal="true"
      className="modal-overlay fixed inset-0 z-40 flex justify-end p-0 sm:p-4"
      onMouseDown={requestCloseFromBackdrop}
      role="dialog"
    >
      <div className="flex h-full w-full max-w-3xl flex-col overflow-hidden bg-surface shadow-popover sm:rounded-lg">
        <header className="flex items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-6">
          <div className="min-w-0">
            {application.company ? (
              <p className="text-sm font-medium text-muted">
                {application.company}
              </p>
            ) : null}
            <h2
              className="mt-1 truncate text-xl font-semibold text-foreground"
              id="application-detail-title"
            >
              {application.jobTitle}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isEditing ? (
              <>
                <button
                  className="icon-button"
                  disabled={isSaving}
                  onClick={saveChanges}
                  type="button"
                >
                  <Check aria-hidden="true" size={18} />
                  <span className="sr-only">
                    {isSaving ? "Saving" : "Save"}
                  </span>
                </button>
                <button
                  className="icon-button"
                  disabled={isSaving}
                  onClick={cancelEditing}
                  type="button"
                >
                  <X aria-hidden="true" size={18} />
                  <span className="sr-only">Cancel</span>
                </button>
              </>
            ) : (
              <button className="icon-button" onClick={startEditing} type="button">
                <Pencil aria-hidden="true" size={18} />
                <span className="sr-only">Edit</span>
              </button>
            )}
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
        </header>

        <div className="overflow-y-auto px-4 py-5 sm:px-6">
          {isEditing ? (
            <EditForm
              coverLetterUploadError={coverLetterUploadError}
              coverLetters={coverLetters}
              draft={draft}
              resumeUploadError={resumeUploadError}
              resumes={resumes}
              setDraft={setDraft}
              setCoverLetterUploadFile={setCoverLetterUploadFile}
              setResumeUploadFile={setResumeUploadFile}
            />
          ) : (
            <ReadOnlyDetails
              activities={activities}
              application={application}
              contacts={contacts}
              coverLetter={coverLetter}
              coverLetterActionError={coverLetterActionError}
              interviews={interviews}
              onAddInterview={onAddInterview}
              onDeleteInterview={onDeleteInterview}
              onDownloadCoverLetter={onDownloadCoverLetter}
              onDownloadResume={onDownloadResume}
              onPreviewResume={onPreviewResume}
              onPreviewCoverLetter={onPreviewCoverLetter}
              onUpdate={onUpdate}
              onUpdateInterview={onUpdateInterview}
              resume={resume}
              resumeActionError={resumeActionError}
              workingResumeId={workingResumeId}
              workingCoverLetterId={workingCoverLetterId}
            />
          )}
        </div>
        {isDiscardWarningOpen ? (
          <UnsavedChangesDialog
            body="Discard unsaved application edits and close details?"
            confirmLabel="Discard and close"
            onCancel={() => setIsDiscardWarningOpen(false)}
            onConfirm={discardAndClose}
          />
        ) : null}
      </div>
    </aside>
  );
}

function ReadOnlyDetails({
  activities,
  application,
  contacts,
  coverLetter,
  coverLetterActionError,
  interviews,
  onAddInterview,
  onDeleteInterview,
  onDownloadCoverLetter,
  onDownloadResume,
  onPreviewResume,
  onPreviewCoverLetter,
  onUpdate,
  onUpdateInterview,
  resume,
  resumeActionError,
  workingResumeId,
  workingCoverLetterId,
}: {
  activities: Activity[];
  application: Application;
  contacts: ApplicationContact[];
  coverLetter?: CoverLetterMetadata;
  coverLetterActionError: string;
  interviews: Interview[];
  onAddInterview: (
    input: InterviewInput,
  ) => Promise<MutationResult<Interview>>;
  onDeleteInterview: (id: string) => Promise<MutationResult>;
  onDownloadCoverLetter: (coverLetter: CoverLetterMetadata) => Promise<void>;
  onDownloadResume: (resume: ResumeMetadata) => Promise<void>;
  onPreviewResume: (resume: ResumeMetadata) => Promise<void>;
  onPreviewCoverLetter: (coverLetter: CoverLetterMetadata) => Promise<void>;
  onUpdate: (
    id: string,
    input: ApplicationUpdate,
  ) => Promise<MutationResult>;
  onUpdateInterview: (
    id: string,
    input: InterviewUpdate,
  ) => Promise<MutationResult<Interview>>;
  resume?: ResumeMetadata;
  resumeActionError: string;
  workingResumeId: string | null;
  workingCoverLetterId: string | null;
}) {
  const safeApplicationUrl = getSafeHttpUrl(application.applicationUrl);

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

    onUpdate(application.id, {
      followUpDate: trimmedDate,
      followUpNeeded: true,
    });
  }

  function clearFollowUpDate() {
    onUpdate(application.id, {
      followUpDate: undefined,
      followUpNeeded: false,
    });
  }

  function markFollowUpDone() {
    onUpdate(application.id, {
      followUpDate: undefined,
      followUpNeeded: false,
    });
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <InfoTile label="Status">
          <StatusBadge status={application.status} />
        </InfoTile>
        <InfoTile label="Priority">{application.priority}</InfoTile>
        <InfoTile label="Last updated">
          {formatUpdatedAt(application.updatedAt)}
        </InfoTile>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <DetailRow label="Location" value={application.location} />
        <DetailRow label="Work mode" value={application.workMode} />
        <DetailRow label="Job type" value={application.jobType} />
        <DetailRow label="Source" value={application.source} />
        <DetailRow label="Date applied" value={formatDate(application.dateApplied)} />
        <DetailRow
          label="Role dates"
          value={formatDateRange(
            application.roleStartDate,
            application.roleEndDate,
          )}
        />
        <DetailRow
          label="Follow-up"
          value={
            application.followUpNeeded
              ? ["Needed", formatDate(application.followUpDate)]
                  .filter(Boolean)
                  .join(" ")
              : formatDate(application.followUpDate)
          }
        />
        <DetailRow
          label="Interview"
          value={formatInterviewSummary(application)}
        />
        <ResumeDetail
          error={resumeActionError}
          isWorking={resume?.id === workingResumeId}
          onDownload={onDownloadResume}
          onPreview={onPreviewResume}
          resume={resume}
        />
        <DocumentDetail
          document={coverLetter}
          error={coverLetterActionError}
          isWorking={coverLetter?.id === workingCoverLetterId}
          label="Cover letter"
          onDownload={onDownloadCoverLetter}
          onPreview={onPreviewCoverLetter}
        />
        <DetailRow label="Salary / pay" value={application.salary} />
      </section>

      {!application.archivedAt ? (
        <section>
          <h3 className="text-sm font-semibold text-foreground">
            Follow-up actions
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <DetailActionButton onClick={changeFollowUpDate}>
              <CalendarPlus aria-hidden="true" size={16} />
              Change date
            </DetailActionButton>
            <DetailActionButton onClick={clearFollowUpDate}>
              <CalendarX aria-hidden="true" size={16} />
              Clear
            </DetailActionButton>
            <DetailActionButton onClick={markFollowUpDone}>
              <CalendarCheck aria-hidden="true" size={16} />
              Mark done
            </DetailActionButton>
          </div>
        </section>
      ) : null}

      {safeApplicationUrl ? (
        <a
          className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-blue-700"
          href={safeApplicationUrl}
          rel="noreferrer"
          target="_blank"
        >
          Open application link
          <ExternalLink aria-hidden="true" size={16} />
        </a>
      ) : null}

      <TextBlock label="Job description" value={application.jobDescription} />
      <TextBlock label="Notes" value={application.notes} />

      <InterviewsSection
        application={application}
        interviews={interviews}
        onAdd={onAddInterview}
        onDelete={onDeleteInterview}
        onUpdate={onUpdateInterview}
      />

      <section>
        <h3 className="text-sm font-semibold text-foreground">Contacts</h3>
        <div className="mt-3 grid gap-2">
          {contacts.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted">
              No contacts linked.
            </p>
          ) : (
            contacts.map((contact) => (
              <div className="rounded-lg border border-border p-3" key={contact.id}>
                <p className="text-sm font-semibold text-foreground">
                  {contact.name}
                </p>
                {[contact.role, contact.email, contact.phone].some(Boolean) ? (
                  <p className="mt-1 text-sm text-muted">
                    {[contact.role, contact.email, contact.phone]
                      .filter(Boolean)
                      .join(" / ")}
                  </p>
                ) : null}
                {contact.notes ? (
                  <p className="mt-2 text-sm text-foreground">{contact.notes}</p>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-foreground">Activity</h3>
        <div className="mt-3 space-y-2">
          {activities.length === 0 ? (
            <p className="text-sm text-muted">No activity yet.</p>
          ) : (
            activities.map((activity) => (
              <div className="rounded-lg border border-border px-3 py-2" key={activity.id}>
                <p className="text-sm text-foreground">{activity.message}</p>
                <p className="mt-1 text-xs text-muted">
                  {formatUpdatedAt(activity.createdAt)}
                </p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function DetailActionButton({
  children,
  disabled = false,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold text-foreground hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function EditForm({
  coverLetterUploadError,
  coverLetters,
  draft,
  resumeUploadError,
  resumes,
  setDraft,
  setCoverLetterUploadFile,
  setResumeUploadFile,
}: {
  coverLetterUploadError: string;
  coverLetters: CoverLetterMetadata[];
  draft: ApplicationDraft;
  resumeUploadError: string;
  resumes: ResumeMetadata[];
  setDraft: React.Dispatch<React.SetStateAction<ApplicationDraft>>;
  setCoverLetterUploadFile: (file: File | null) => void;
  setResumeUploadFile: (file: File | null) => void;
}) {
  function updateDraft<Key extends keyof ApplicationDraft>(
    key: Key,
    value: ApplicationDraft[Key],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Job Title">
        <input
          className="field-control"
          onChange={(event) => updateDraft("jobTitle", event.target.value)}
          value={draft.jobTitle}
        />
      </Field>
      <Field label="Company">
        <input
          className="field-control"
          onChange={(event) => updateDraft("company", event.target.value)}
          value={draft.company}
        />
      </Field>
      <Field label="Status">
        <select
          className="field-control"
          onChange={(event) =>
            updateDraft("status", event.target.value as ApplicationStatus)
          }
          value={draft.status}
        >
          {APPLICATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Priority">
        <select
          className="field-control"
          onChange={(event) =>
            updateDraft("priority", event.target.value as Priority)
          }
          value={draft.priority}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </Field>
      <Field label="Location">
        <input
          className="field-control"
          onChange={(event) => updateDraft("location", event.target.value)}
          value={draft.location}
        />
      </Field>
      <Field label="Work Mode">
        <select
          className="field-control"
          onChange={(event) => updateDraft("workMode", event.target.value as WorkMode)}
          value={draft.workMode}
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
          onChange={(event) => updateDraft("jobType", event.target.value as JobType)}
          value={draft.jobType}
        >
          <option value="internship">Internship</option>
          <option value="part-time">Part-time</option>
          <option value="full-time">Full-time</option>
          <option value="contract">Contract</option>
          <option value="other">Other</option>
        </select>
      </Field>
      <Field label="Resume">
        <select
          className="field-control"
          onChange={(event) => updateDraft("resumeId", event.target.value)}
          value={draft.resumeId}
        >
          <option value="">Unassigned</option>
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
                updateDraft("resumeUploadName", event.target.value)
              }
              placeholder="Display name"
              type="text"
              value={draft.resumeUploadName}
            />
            <input
              className="field-control"
              onChange={(event) =>
                updateDraft("resumeUploadVersion", event.target.value)
              }
              placeholder="Version label"
              type="text"
              value={draft.resumeUploadVersion}
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
          onChange={(event) => updateDraft("coverLetterId", event.target.value)}
          value={draft.coverLetterId}
        >
          <option value="">Unassigned</option>
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
                updateDraft("coverLetterUploadName", event.target.value)
              }
              placeholder="Display name"
              type="text"
              value={draft.coverLetterUploadName}
            />
            <input
              className="field-control"
              onChange={(event) =>
                updateDraft("coverLetterUploadVersion", event.target.value)
              }
              placeholder="Version label"
              type="text"
              value={draft.coverLetterUploadVersion}
            />
          </div>
          {coverLetterUploadError ? (
            <p className="mt-2 text-xs font-medium text-destructive">
              {coverLetterUploadError}
            </p>
          ) : null}
        </div>
      </Field>
      <Field label="Source">
        <select
          className="field-control"
          onChange={(event) => updateDraft("source", event.target.value)}
          value={draft.source}
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
          onChange={(event) => updateDraft("applicationUrl", event.target.value)}
          type="url"
          value={draft.applicationUrl}
        />
      </Field>
      <DateField
        label="Date Applied"
        name="dateApplied"
        draft={draft}
        setDraft={setDraft}
      />
      <DateField
        label="Role Start"
        name="roleStartDate"
        draft={draft}
        setDraft={setDraft}
      />
      <DateField
        label="Role End"
        name="roleEndDate"
        draft={draft}
        setDraft={setDraft}
      />
      <DateField
        label="Follow-up Date"
        name="followUpDate"
        draft={draft}
        setDraft={setDraft}
      />
      <label className="flex items-center gap-3 rounded-lg border border-border bg-surface-raised px-3 py-3 text-sm font-medium text-foreground">
        <input
          checked={draft.followUpNeeded}
          className="h-4 w-4 rounded border-border text-primary"
          onChange={(event) => updateDraft("followUpNeeded", event.target.checked)}
          type="checkbox"
        />
        <span>Follow-up Needed</span>
      </label>
      <Field className="md:col-span-2" label="Job Description">
        <textarea
          className="field-control min-h-32 resize-y"
          onChange={(event) => updateDraft("jobDescription", event.target.value)}
          value={draft.jobDescription}
        />
      </Field>
      <Field className="md:col-span-2" label="Notes">
        <textarea
          className="field-control min-h-28 resize-y"
          onChange={(event) => updateDraft("notes", event.target.value)}
          value={draft.notes}
        />
      </Field>
    </div>
  );
}

function DateField({
  draft,
  label,
  name,
  setDraft,
}: {
  draft: ApplicationDraft;
  label: string;
  name:
    | "dateApplied"
    | "roleStartDate"
    | "roleEndDate"
    | "followUpDate";
  setDraft: React.Dispatch<React.SetStateAction<ApplicationDraft>>;
}) {
  return (
    <Field label={label}>
      <input
        className="field-control"
        onChange={(event) =>
          setDraft((current) => ({ ...current, [name]: event.target.value }))
        }
        type="date"
        value={draft[name]}
      />
    </Field>
  );
}

function InfoTile({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="rounded-lg border border-border px-3 py-3">
      <p className="text-xs font-semibold uppercase text-muted">{label}</p>
      <div className="mt-2 text-sm font-medium capitalize text-foreground">
        {children}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-muted">{label}</p>
      <p
        aria-label={value ? undefined : "No value"}
        className="mt-1 min-h-5 text-sm text-foreground"
      >
        {value ?? ""}
      </p>
    </div>
  );
}

function ResumeDetail({
  error,
  isWorking,
  onDownload,
  onPreview,
  resume,
}: {
  error: string;
  isWorking: boolean;
  onDownload: (resume: ResumeMetadata) => Promise<void>;
  onPreview: (resume: ResumeMetadata) => Promise<void>;
  resume?: ResumeMetadata;
}) {
  return (
    <DocumentDetail
      document={resume}
      error={error}
      isWorking={isWorking}
      label="Resume"
      onDownload={onDownload}
      onPreview={onPreview}
    />
  );
}

function DocumentDetail({
  document,
  error,
  isWorking,
  label,
  onDownload,
  onPreview,
}: {
  document?: ResumeMetadata;
  error: string;
  isWorking: boolean;
  label: string;
  onDownload: (document: ResumeMetadata) => Promise<void>;
  onPreview: (document: ResumeMetadata) => Promise<void>;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-muted">{label}</p>
      {document ? (
        <>
          <p className="mt-1 truncate text-sm text-foreground">
            {document.displayName} / {document.originalFileName}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <DetailActionButton
              disabled={isWorking}
              onClick={() => void onPreview(document)}
            >
              <Eye aria-hidden="true" size={16} />
              {isWorking ? "Opening…" : "Preview"}
            </DetailActionButton>
            <DetailActionButton
              disabled={isWorking}
              onClick={() => void onDownload(document)}
            >
              <Download aria-hidden="true" size={16} />
              Download
            </DetailActionButton>
          </div>
          {error ? (
            <p className="mt-2 text-sm font-medium text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-1 text-sm text-muted">Unassigned</p>
      )}
    </div>
  );
}

function TextBlock({ label, value }: { label: string; value?: string }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-foreground">{label}</h3>
      <p className="mt-2 whitespace-pre-wrap rounded-lg border border-border bg-surface-raised px-3 py-3 text-sm leading-6 text-foreground">
        {value ?? ""}
      </p>
    </section>
  );
}

function formatInterviewSummary(application: Application) {
  const details = [
    application.interviewRound
      ? `Round ${application.interviewRound}`
      : undefined,
    application.interviewDateTime
      ? formatDateTime(application.interviewDateTime)
      : undefined,
    application.interviewType,
  ].filter(Boolean);

  return details.length > 0 ? details.join(" / ") : "Not scheduled";
}

function Field({
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

type ApplicationDraft = ReturnType<typeof toDraft>;

function toDraft(application: Application) {
  return {
    company: application.company,
    jobTitle: application.jobTitle,
    jobDescription: application.jobDescription,
    status: application.status,
    location: application.location ?? "",
    workMode: application.workMode,
    jobType: application.jobType,
    source: application.source ?? "",
    applicationUrl: application.applicationUrl ?? "",
    dateApplied: application.dateApplied ?? "",
    roleStartDate: application.roleStartDate ?? "",
    roleEndDate: application.roleEndDate ?? "",
    followUpNeeded: application.followUpNeeded,
    followUpDate: application.followUpDate ?? "",
    priority: application.priority,
    resumeId: application.resumeId ?? "",
    resumeUploadName: "",
    resumeUploadVersion: "",
    coverLetterId: application.coverLetterId ?? "",
    coverLetterUploadName: "",
    coverLetterUploadVersion: "",
    coverLetterVersion: application.coverLetterVersion ?? "",
    salary: application.salary ?? "",
    notes: application.notes ?? "",
  };
}

function isDraftDirty(draft: ApplicationDraft, application: Application) {
  return JSON.stringify(draft) !== JSON.stringify(toDraft(application));
}

function trimOptional(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
