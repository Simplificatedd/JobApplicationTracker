import {
  AlertTriangle,
  Download,
  Eye,
  FileText,
  Pencil,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EmptyState } from "../../components/EmptyState";
import { useResumeFileActions } from "../../hooks/useResumeFileActions";
import { formatDate, formatUpdatedAt } from "../../lib/format";
import { formatFileSize, type ResumeUploadResult } from "../../lib/resumeFiles";
import type {
  MutationResult,
  ResumeMetadataUpdate,
} from "../../store/useTrackerStore";
import type { Application, ResumeMetadata } from "../../types/application";

interface ResumesPageProps {
  applications: Application[];
  getResumeFile: (id: string) => Promise<Blob>;
  onDeleteResume: (id: string) => Promise<MutationResult>;
  onUpdateResume: (
    id: string,
    input: ResumeMetadataUpdate,
  ) => Promise<MutationResult>;
  onUploadResume: (
    file: File,
    options?: ResumeMetadataUpdate,
  ) => Promise<ResumeUploadResult>;
  resumes: ResumeMetadata[];
  uploadRequestId?: number;
}

export function ResumesPage({
  applications,
  getResumeFile,
  onDeleteResume,
  onUpdateResume,
  onUploadResume,
  resumes,
  uploadRequestId = 0,
}: ResumesPageProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState("");
  const [versionLabel, setVersionLabel] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const {
    actionError,
    clearActionError,
    downloadResume,
    previewResume,
    workingResumeId,
  } = useResumeFileActions(getResumeFile);
  const linkedCounts = getLinkedCounts(applications);

  useEffect(() => {
    if (uploadRequestId > 0) {
      fileInputRef.current?.click();
    }
  }, [uploadRequestId]);

  async function handleUpload(file: File | undefined) {
    if (!file) {
      return;
    }

    setUploadError("");
    setUploadMessage("");
    clearActionError();

    try {
      const result = await onUploadResume(file, {
        displayName,
        versionLabel,
      });

      setDisplayName("");
      setVersionLabel("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      setUploadMessage(
        result.duplicateOf
          ? `Uploaded. Exact duplicate of ${result.duplicateOf.displayName}.`
          : "Resume uploaded.",
      );
    } catch (error) {
      setUploadError(getErrorMessage(error));
    }
  }

  function confirmDelete(resume: ResumeMetadata) {
    const linkedCount = linkedCounts.get(resume.id) ?? 0;
    const message =
      linkedCount > 0
        ? `Delete "${resume.displayName}" and remove it from ${linkedCount} linked application${linkedCount === 1 ? "" : "s"}?`
        : `Delete "${resume.displayName}" permanently?`;

    if (window.confirm(message)) {
      onDeleteResume(resume.id);
    }
  }

  return (
    <div className="space-y-5">
      <section className="surface-panel rounded-lg p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-[1.2fr_0.9fr_0.9fr_auto]">
          <Field label="File">
            <input
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="field-control"
              onChange={(event) => handleUpload(event.target.files?.[0])}
              ref={fileInputRef}
              type="file"
            />
          </Field>
          <Field label="Display Name">
            <input
              className="field-control"
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Defaults to filename"
              type="text"
              value={displayName}
            />
          </Field>
          <Field label="Version">
            <input
              className="field-control"
              onChange={(event) => setVersionLabel(event.target.value)}
              placeholder="Frontend, data, product"
              type="text"
              value={versionLabel}
            />
          </Field>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-blue-700 md:self-end"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <Upload aria-hidden="true" size={16} />
            Upload
          </button>
        </div>
        {uploadError || actionError ? (
          <InlineAlert message={uploadError || actionError} tone="danger" />
        ) : uploadMessage ? (
          <InlineAlert message={uploadMessage} tone="info" />
        ) : null}
      </section>

      {resumes.length === 0 ? (
        <EmptyState
          body="Upload PDF or DOCX versions to attach them to applications."
          icon={FileText}
          kicker="Resumes"
          title="Resume library"
        />
      ) : (
        <section className="surface-panel overflow-hidden rounded-lg">
          <div className="overflow-x-auto">
            <table className="min-w-[1120px] table-fixed text-left">
              <thead className="border-b border-border bg-slate-50 text-xs font-semibold uppercase text-muted">
                <tr>
                  <Th width="18rem">Display name</Th>
                  <Th width="16rem">Original file</Th>
                  <Th width="12rem">Download name</Th>
                  <Th width="8rem">Type</Th>
                  <Th width="8rem">Size</Th>
                  <Th width="8rem">Storage</Th>
                  <Th width="9rem">Uploaded</Th>
                  <Th width="11rem">Updated</Th>
                  <Th width="11rem">Last used</Th>
                  <Th width="8rem">Linked</Th>
                  <Th width="12rem">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {resumes.map((resume) => (
                  <ResumeRow
                    isWorking={workingResumeId === resume.id}
                    key={resume.id}
                    linkedCount={linkedCounts.get(resume.id) ?? 0}
                    onDelete={() => confirmDelete(resume)}
                    onDownload={() => downloadResume(resume)}
                    onPreview={() => previewResume(resume)}
                    onUpdate={(input) => onUpdateResume(resume.id, input)}
                    resume={resume}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function ResumeRow({
  isWorking,
  linkedCount,
  onDelete,
  onDownload,
  onPreview,
  onUpdate,
  resume,
}: {
  isWorking: boolean;
  linkedCount: number;
  onDelete: () => void;
  onDownload: () => void;
  onPreview: () => void;
  onUpdate: (input: ResumeMetadataUpdate) => Promise<MutationResult>;
  resume: ResumeMetadata;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [draft, setDraft] = useState({
    displayName: resume.displayName,
    downloadFileName: resume.downloadFileName,
    notes: resume.notes ?? "",
    versionLabel: resume.versionLabel ?? "",
  });

  async function save() {
    setIsSaving(true);
    setSaveError("");
    const result = await onUpdate(draft);
    setIsSaving(false);

    if (!result.ok) {
      setSaveError(result.error);
      return;
    }

    setIsEditing(false);
  }

  function cancel() {
    setDraft({
      displayName: resume.displayName,
      downloadFileName: resume.downloadFileName,
      notes: resume.notes ?? "",
      versionLabel: resume.versionLabel ?? "",
    });
    setIsEditing(false);
  }

  return (
    <tr className="text-sm text-foreground">
      <Td>
        {isEditing ? (
          <div className="space-y-2">
            <input
              aria-label="Display name"
              className="field-control"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  displayName: event.target.value,
                }))
              }
              value={draft.displayName}
            />
            <input
              aria-label="Version label"
              className="field-control"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  versionLabel: event.target.value,
                }))
              }
              placeholder="Version label"
              value={draft.versionLabel}
            />
          </div>
        ) : (
          <div className="min-w-0">
            <p className="truncate font-semibold">{resume.displayName}</p>
            <p className="mt-1 truncate text-xs text-muted">
              {resume.versionLabel || "No version label"}
            </p>
          </div>
        )}
      </Td>
      <Td muted>
        {isEditing ? (
          <div className="space-y-2">
            <p className="truncate">{resume.originalFileName}</p>
            <textarea
              aria-label="Resume notes"
              className="field-control min-h-20 resize-y"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              placeholder="Notes"
              value={draft.notes}
            />
          </div>
        ) : (
          <div>
            <p className="truncate">{resume.originalFileName}</p>
            {resume.notes ? (
              <p className="mt-1 line-clamp-2 text-xs text-muted">{resume.notes}</p>
            ) : null}
          </div>
        )}
      </Td>
      <Td>
        {isEditing ? (
          <input
            className="field-control"
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                downloadFileName: event.target.value,
              }))
            }
            value={draft.downloadFileName}
          />
        ) : (
          resume.downloadFileName
        )}
      </Td>
      <Td muted>{resume.fileExtension.toUpperCase()}</Td>
      <Td muted>{formatFileSize(resume.fileSize)}</Td>
      <Td>
        <span
          className={`rounded-md px-2 py-1 text-xs font-semibold ${
            resume.fileSize > 0
              ? "bg-green-50 text-success"
              : "bg-amber-50 text-warning"
          }`}
        >
          {resume.fileSize > 0 ? "Stored" : "Metadata"}
        </span>
      </Td>
      <Td muted>{formatDate(resume.uploadedAt)}</Td>
      <Td muted>{formatUpdatedAt(resume.updatedAt)}</Td>
      <Td muted>{resume.lastUsedAt ? formatUpdatedAt(resume.lastUsedAt) : "Unused"}</Td>
      <Td muted>{linkedCount}</Td>
      <Td>
        <div className="flex items-center gap-1">
          {isEditing ? (
            <>
              <IconAction disabled={isSaving} label="Save metadata" onClick={save}>
                <Save aria-hidden="true" size={16} />
              </IconAction>
              <IconAction disabled={isSaving} label="Cancel edit" onClick={cancel}>
                <X aria-hidden="true" size={16} />
              </IconAction>
            </>
          ) : (
            <>
              <IconAction
                disabled={isWorking}
                label={
                  resume.fileExtension === "pdf"
                    ? "Preview resume"
                    : "Download resume"
                }
                onClick={onPreview}
              >
                <Eye aria-hidden="true" size={16} />
              </IconAction>
              <IconAction
                disabled={isWorking}
                label="Download resume"
                onClick={onDownload}
              >
                <Download aria-hidden="true" size={16} />
              </IconAction>
              <IconAction label="Edit metadata" onClick={() => setIsEditing(true)}>
                <Pencil aria-hidden="true" size={16} />
              </IconAction>
              <IconAction label="Delete resume" onClick={onDelete} tone="danger">
                <Trash2 aria-hidden="true" size={16} />
              </IconAction>
            </>
          )}
        </div>
        {saveError ? (
          <p className="mt-2 text-xs font-medium text-destructive" role="alert">
            {saveError}
          </p>
        ) : null}
      </Td>
    </tr>
  );
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function InlineAlert({
  message,
  tone,
}: {
  message: string;
  tone: "danger" | "info";
}) {
  return (
    <div
      className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
        tone === "danger"
          ? "border-red-200 bg-red-50 text-destructive"
          : "border-blue-200 bg-blue-50 text-info"
      }`}
    >
      <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={16} />
      <p>{message}</p>
    </div>
  );
}

function IconAction({
  children,
  disabled = false,
  label,
  onClick,
  tone = "neutral",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  tone?: "danger" | "neutral";
}) {
  return (
    <button
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border ${
        tone === "danger"
          ? "text-destructive hover:bg-red-50"
          : "text-muted hover:bg-slate-50 hover:text-foreground"
      } disabled:cursor-not-allowed disabled:opacity-50`}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}

function Th({
  children,
  width,
}: {
  children: React.ReactNode;
  width: string;
}) {
  return (
    <th className="px-3 py-3" style={{ width }}>
      {children}
    </th>
  );
}

function Td({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <td className={`px-3 py-3 align-top ${muted ? "text-muted" : ""}`}>
      <div className="min-w-0 truncate">{children}</div>
    </td>
  );
}

function getLinkedCounts(applications: Application[]) {
  const counts = new Map<string, number>();

  for (const application of applications) {
    if (!application.resumeId) {
      continue;
    }

    counts.set(application.resumeId, (counts.get(application.resumeId) ?? 0) + 1);
  }

  return counts;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Resume action failed.";
}
