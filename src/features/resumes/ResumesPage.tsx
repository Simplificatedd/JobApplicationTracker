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
import { useRef, useState } from "react";
import { EmptyState } from "../../components/EmptyState";
import { useResumeFileActions } from "../../hooks/useResumeFileActions";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { changedDraftFields } from "../../lib/editIntent";
import { formatDate, formatUpdatedAt } from "../../lib/format";
import { formatFileSize } from "../../lib/resumeFiles";
import type {
  MutationResult,
  ResumeUploadAttempt,
  CoverLetterUploadAttempt,
  ResumeMetadataUpdate,
} from "../../store/useTrackerStore";
import type {
  Application,
  CoverLetterMetadata,
  ResumeMetadata,
} from "../../types/application";

interface ResumesPageProps {
  applications: Application[];
  getResumeFile: (id: string) => Promise<Blob>;
  onDeleteResume: (id: string) => Promise<MutationResult>;
  onUpdateResume: (
    id: string,
    input: ResumeMetadataUpdate,
    expectedDocument?: ResumeMetadata,
  ) => Promise<MutationResult>;
  onUploadResume: (
    file: File,
    options?: ResumeMetadataUpdate,
    allowDuplicate?: boolean,
  ) => Promise<ResumeUploadAttempt>;
  resumes: ResumeMetadata[];
  documentKind?: "cover letter" | "resume";
}

interface CoverLettersPageProps {
  applications: Application[];
  coverLetters: CoverLetterMetadata[];
  getCoverLetterFile: (id: string) => Promise<Blob>;
  onDeleteCoverLetter: (id: string) => Promise<MutationResult>;
  onUpdateCoverLetter: (
    id: string,
    input: ResumeMetadataUpdate,
    expectedDocument?: ResumeMetadata,
  ) => Promise<MutationResult>;
  onUploadCoverLetter: (
    file: File,
    options?: ResumeMetadataUpdate,
    allowDuplicate?: boolean,
  ) => Promise<CoverLetterUploadAttempt>;
}

export function CoverLettersPage({
  applications,
  coverLetters,
  getCoverLetterFile,
  onDeleteCoverLetter,
  onUpdateCoverLetter,
  onUploadCoverLetter,
}: CoverLettersPageProps) {
  return (
    <ResumesPage
      applications={applications}
      documentKind="cover letter"
      getResumeFile={getCoverLetterFile}
      onDeleteResume={onDeleteCoverLetter}
      onUpdateResume={onUpdateCoverLetter}
      onUploadResume={async (...args) => {
        const result = await onUploadCoverLetter(...args);
        return {
          duplicateOf: result.duplicateOf,
          resume: result.coverLetter,
          saved: result.saved,
        };
      }}
      resumes={coverLetters}
    />
  );
}

export function ResumesPage({
  applications,
  documentKind = "resume",
  getResumeFile,
  onDeleteResume,
  onUpdateResume,
  onUploadResume,
  resumes,
}: ResumesPageProps) {
  const isCoverLetter = documentKind === "cover letter";
  const documentLabel = isCoverLetter ? "Cover letter" : "Resume";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState("");
  const [versionLabel, setVersionLabel] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [pendingDuplicate, setPendingDuplicate] = useState<{
    duplicateOf: ResumeMetadata;
    file: File;
  } | null>(null);
  const {
    actionError,
    clearActionError,
    downloadResume,
    previewResume,
    workingResumeId,
  } = useResumeFileActions(getResumeFile, documentLabel);
  const linkedCounts = getLinkedCounts(applications, isCoverLetter);

  async function handleUpload(file: File | undefined, allowDuplicate = false) {
    if (!file) {
      return;
    }

    setUploadError("");
    setUploadMessage("");
    clearActionError();
    setIsUploading(true);

    try {
      const options = {
        displayName,
        versionLabel,
      };
      const result = await onUploadResume(file, options, allowDuplicate);

      if (!result.saved && result.duplicateOf) {
        setPendingDuplicate({
          duplicateOf: result.duplicateOf,
          file,
        });
        return;
      }

      setPendingDuplicate(null);
      setDisplayName("");
      setVersionLabel("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      setUploadMessage(`${documentLabel} uploaded.`);
    } catch (error) {
      setUploadError(getErrorMessage(error));
    } finally {
      setIsUploading(false);
    }
  }

  function cancelDuplicateUpload() {
    setPendingDuplicate(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
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
              id={`${isCoverLetter ? "cover-letter" : "resume"}-upload-file-input`}
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
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <Upload aria-hidden="true" size={16} />
            {isUploading ? "Checking..." : "Upload"}
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
          kicker={isCoverLetter ? "Cover letters" : "Resumes"}
          title={`${documentLabel} library`}
        />
      ) : (
        <section className="surface-panel overflow-hidden rounded-lg">
          {/* relative keeps absolutely positioned descendants, such as sr-only
              labels, inside the scroll box instead of widening the page. */}
          <div className="relative overflow-x-auto">
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
                    documentLabel={documentKind}
                    isWorking={workingResumeId === resume.id}
                    key={resume.id}
                    linkedCount={linkedCounts.get(resume.id) ?? 0}
                    onDelete={() => confirmDelete(resume)}
                    onDownload={() => downloadResume(resume)}
                    onPreview={() => previewResume(resume)}
                    onUpdate={(input, original) => onUpdateResume(resume.id, input, original)}
                    resume={resume}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {pendingDuplicate ? (
        <DuplicateResumeDialog
          documentLabel={documentKind}
          duplicateOf={pendingDuplicate.duplicateOf}
          isUploading={isUploading}
          onCancel={cancelDuplicateUpload}
          onConfirm={() =>
            void handleUpload(pendingDuplicate.file, true)
          }
        />
      ) : null}
    </div>
  );
}

function DuplicateResumeDialog({
  documentLabel,
  duplicateOf,
  isUploading,
  onCancel,
  onConfirm,
}: {
  documentLabel: "cover letter" | "resume";
  duplicateOf: ResumeMetadata;
  isUploading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEscapeKey(true, onCancel);

  return (
    <div
      aria-labelledby="duplicate-resume-title"
      aria-modal="true"
      className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
      role="alertdialog"
    >
      <div className="w-full max-w-md rounded-lg bg-surface p-5 shadow-popover">
        <h2
          className="text-lg font-semibold text-foreground"
          id="duplicate-resume-title"
        >
          Exact duplicate {documentLabel}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          This file has the same contents as “{duplicateOf.displayName}”. No file
          has been saved yet.
        </p>
        <p className="mt-2 text-sm text-foreground">
          Upload it as a separate {documentLabel} anyway?
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            className="h-10 rounded-lg border border-border px-4 text-sm font-semibold text-foreground hover:bg-slate-50"
            disabled={isUploading}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-blue-700"
            disabled={isUploading}
            onClick={onConfirm}
            type="button"
          >
            {isUploading ? "Uploading..." : "Upload anyway"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface DocumentItemProps {
  documentLabel: "cover letter" | "resume";
  isWorking: boolean;
  linkedCount: number;
  onDelete: () => void;
  onDownload: () => void;
  onPreview: () => void;
  onUpdate: (input: ResumeMetadataUpdate, expectedDocument?: ResumeMetadata) => Promise<MutationResult>;
  resume: ResumeMetadata;
}

function getDocumentDraft(resume: ResumeMetadata) {
  return {
    displayName: resume.displayName,
    downloadFileName: resume.downloadFileName,
    notes: resume.notes ?? "",
    versionLabel: resume.versionLabel ?? "",
  };
}

type DocumentDraft = ReturnType<typeof getDocumentDraft>;

// Edit state shared by the table row and the card for one document.
function useDocumentMetadataEditor(
  resume: ResumeMetadata,
  onUpdate: DocumentItemProps["onUpdate"],
) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [editBase, setEditBase] = useState(() => structuredClone(resume));
  const [draft, setDraft] = useState(() => getDocumentDraft(resume));

  function updateDraft(field: keyof DocumentDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function startEditing() {
    setEditBase(structuredClone(resume));
    setDraft(getDocumentDraft(resume));
    setIsEditing(true);
  }

  async function save() {
    setIsSaving(true);
    setSaveError("");
    const result = await onUpdate(documentDraftToUpdate(draft, editBase), editBase);
    setIsSaving(false);

    if (!result.ok) {
      setSaveError(result.error);
      return;
    }

    setIsEditing(false);
  }

  function cancel() {
    setDraft(getDocumentDraft(resume));
    setIsEditing(false);
  }

  return {
    cancel,
    draft,
    isEditing,
    isSaving,
    save,
    saveError,
    startEditing,
    updateDraft,
  };
}

function ResumeRow({
  documentLabel,
  isWorking,
  linkedCount,
  onDelete,
  onDownload,
  onPreview,
  onUpdate,
  resume,
}: DocumentItemProps) {
  const editor = useDocumentMetadataEditor(resume, onUpdate);
  const { draft, isEditing } = editor;

  return (
    <tr className="text-sm text-foreground">
      <Td>
        {isEditing ? (
          <div className="space-y-2">
            <input
              aria-label="Display name"
              className="field-control"
              onChange={(event) =>
                editor.updateDraft("displayName", event.target.value)
              }
              value={draft.displayName}
            />
            <input
              aria-label="Version label"
              className="field-control"
              onChange={(event) =>
                editor.updateDraft("versionLabel", event.target.value)
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
              aria-label={`${documentLabel} notes`}
              className="field-control min-h-20 resize-y"
              onChange={(event) =>
                editor.updateDraft("notes", event.target.value)
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
              editor.updateDraft("downloadFileName", event.target.value)
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
        <StorageBadge resume={resume} />
      </Td>
      <Td muted>{formatDate(resume.uploadedAt)}</Td>
      <Td muted>{formatUpdatedAt(resume.updatedAt)}</Td>
      <Td muted>{resume.lastUsedAt ? formatUpdatedAt(resume.lastUsedAt) : "Unused"}</Td>
      <Td muted>{linkedCount}</Td>
      <Td>
        <div className="flex items-center gap-1">
          <DocumentActions
            documentLabel={documentLabel}
            editor={editor}
            isWorking={isWorking}
            onDelete={onDelete}
            onDownload={onDownload}
            onPreview={onPreview}
            resume={resume}
          />
        </div>
        <SaveError message={editor.saveError} />
      </Td>
    </tr>
  );
}

function DocumentActions({
  documentLabel,
  editor,
  isWorking,
  onDelete,
  onDownload,
  onPreview,
  resume,
  showLabels = false,
}: Pick<
  DocumentItemProps,
  "documentLabel" | "isWorking" | "onDelete" | "onDownload" | "onPreview" | "resume"
> & {
  editor: ReturnType<typeof useDocumentMetadataEditor>;
  showLabels?: boolean;
}) {
  if (editor.isEditing) {
    return (
      <>
        <IconAction
          disabled={editor.isSaving}
          label="Save metadata"
          onClick={() => void editor.save()}
          shortLabel={editor.isSaving ? "Saving..." : "Save"}
          showLabel={showLabels}
        >
          <Save aria-hidden="true" size={16} />
        </IconAction>
        <IconAction
          disabled={editor.isSaving}
          label="Cancel edit"
          onClick={editor.cancel}
          shortLabel="Cancel"
          showLabel={showLabels}
        >
          <X aria-hidden="true" size={16} />
        </IconAction>
      </>
    );
  }

  const canPreview = resume.fileExtension === "pdf";

  return (
    <>
      <IconAction
        disabled={isWorking}
        label={canPreview ? `Preview ${documentLabel}` : `Download ${documentLabel}`}
        onClick={onPreview}
        shortLabel={canPreview ? "Preview" : "Open"}
        showLabel={showLabels}
      >
        <Eye aria-hidden="true" size={16} />
      </IconAction>
      <IconAction
        disabled={isWorking}
        label={`Download ${documentLabel}`}
        onClick={onDownload}
        shortLabel="Download"
        showLabel={showLabels}
      >
        <Download aria-hidden="true" size={16} />
      </IconAction>
      <IconAction
        label="Edit metadata"
        onClick={editor.startEditing}
        shortLabel="Edit"
        showLabel={showLabels}
      >
        <Pencil aria-hidden="true" size={16} />
      </IconAction>
      <IconAction
        label={`Delete ${documentLabel}`}
        onClick={onDelete}
        shortLabel="Delete"
        showLabel={showLabels}
        tone="danger"
      >
        <Trash2 aria-hidden="true" size={16} />
      </IconAction>
    </>
  );
}

function StorageBadge({ resume }: { resume: ResumeMetadata }) {
  return (
    <span
      className={`rounded-md px-2 py-1 text-xs font-semibold ${
        resume.fileSize > 0
          ? "bg-green-50 text-success"
          : "bg-amber-50 text-warning"
      }`}
    >
      {resume.fileSize > 0 ? "Stored" : "Metadata"}
    </span>
  );
}

function SaveError({ message }: { message: string }) {
  return message ? (
    <p className="mt-2 text-xs font-medium text-destructive" role="alert">
      {message}
    </p>
  ) : null;
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
  shortLabel,
  showLabel = false,
  tone = "neutral",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  shortLabel: string;
  showLabel?: boolean;
  tone?: "danger" | "neutral";
}) {
  return (
    <button
      aria-label={label}
      className={`touch-target inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border ${
        showLabel ? "px-3 text-sm font-semibold" : "w-9"
      } ${
        tone === "danger"
          ? "text-destructive hover:bg-red-50"
          : "text-muted hover:bg-slate-50 hover:text-foreground"
      } disabled:cursor-not-allowed disabled:opacity-50`}
      disabled={disabled}
      onClick={onClick}
      title={showLabel ? undefined : label}
      type="button"
    >
      {children}
      {showLabel ? <span>{shortLabel}</span> : null}
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

function getLinkedCounts(
  applications: Application[],
  useCoverLetterId = false,
) {
  const counts = new Map<string, number>();

  for (const application of applications) {
    const documentId = useCoverLetterId
      ? application.coverLetterId
      : application.resumeId;

    if (!documentId) {
      continue;
    }

    counts.set(documentId, (counts.get(documentId) ?? 0) + 1);
  }

  return counts;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Document action failed.";
}

export function documentDraftToUpdate(
  draft: { displayName: string; downloadFileName: string; notes: string; versionLabel: string },
  original: ResumeMetadata,
): ResumeMetadataUpdate {
  return changedDraftFields(draft, {
    displayName: original.displayName, downloadFileName: original.downloadFileName,
    notes: original.notes ?? "", versionLabel: original.versionLabel ?? "",
  }, draft);
}
