import { createId, createTimestamp } from "./domain";
import type { ResumeMetadata } from "../types/application";

export interface ResumeUploadOptions {
  displayName?: string;
  downloadFileName?: string;
  markAsUsed?: boolean;
  notes?: string;
  versionLabel?: string;
}

export interface ResumeUploadResult {
  duplicateOf?: ResumeMetadata;
  resume: ResumeMetadata;
}

const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const RESUME_MIME_TYPES = new Set(["application/pdf", DOCX_MIME_TYPE]);

export function validateResumeFile(file: File) {
  const fileExtension = getResumeFileExtension(file.name);

  if (!fileExtension) {
    throw new Error("Upload a PDF or DOCX resume file.");
  }

  if (file.type && !RESUME_MIME_TYPES.has(file.type)) {
    throw new Error("Upload a PDF or DOCX resume file.");
  }

  if (file.size <= 0) {
    throw new Error("The selected resume file is empty.");
  }

  return {
    fileExtension,
    mimeType:
      file.type ||
      (fileExtension === "pdf" ? "application/pdf" : DOCX_MIME_TYPE),
  };
}

export async function createResumeUploadResult({
  existingResumes,
  file,
  options,
}: {
  existingResumes: ResumeMetadata[];
  file: File;
  options: ResumeUploadOptions;
}): Promise<ResumeUploadResult> {
  const validatedFile = validateResumeFile(file);
  const contentHash = await calculateContentHash(file);
  const duplicateOf = existingResumes.find(
    (resume) =>
      resume.contentHash === contentHash && resume.fileSize === file.size,
  );
  const timestamp = createTimestamp();
  const originalFileName = file.name;
  const downloadFileName = normalizeDownloadFileName(
    options.downloadFileName || originalFileName,
    validatedFile.fileExtension,
  );

  return {
    duplicateOf,
    resume: {
      id: createId("resume"),
      displayName:
        options.displayName?.trim() ||
        stripResumeFileExtension(originalFileName) ||
        originalFileName,
      originalFileName,
      downloadFileName,
      fileExtension: validatedFile.fileExtension,
      mimeType: validatedFile.mimeType,
      fileSize: file.size,
      storageKey: createId("resume-file"),
      contentHash,
      versionLabel: trimOptional(options.versionLabel),
      notes: trimOptional(options.notes),
      uploadedAt: timestamp,
      updatedAt: timestamp,
      lastUsedAt: options.markAsUsed ? timestamp : undefined,
    },
  };
}

export function updateResumeMetadata(
  resume: ResumeMetadata,
  input: Partial<
    Pick<ResumeMetadata, "displayName" | "downloadFileName" | "versionLabel" | "notes">
  >,
) {
  return {
    ...resume,
    displayName: input.displayName?.trim() || resume.displayName,
    downloadFileName: input.downloadFileName
      ? normalizeDownloadFileName(input.downloadFileName, resume.fileExtension)
      : resume.downloadFileName,
    versionLabel: trimOptional(input.versionLabel ?? ""),
    notes: trimOptional(input.notes ?? ""),
    updatedAt: createTimestamp(),
  } satisfies ResumeMetadata;
}

export function markResumeUsed(resume: ResumeMetadata, timestamp = createTimestamp()) {
  return {
    ...resume,
    lastUsedAt: timestamp,
    updatedAt: timestamp,
  } satisfies ResumeMetadata;
}

export function formatFileSize(bytes: number) {
  if (bytes <= 0) {
    return "Missing file";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function getResumeFileExtension(
  fileName: string,
): ResumeMetadata["fileExtension"] | null {
  const lowerFileName = fileName.toLowerCase();

  if (lowerFileName.endsWith(".pdf")) {
    return "pdf";
  }

  if (lowerFileName.endsWith(".docx")) {
    return "docx";
  }

  return null;
}

async function calculateContentHash(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeDownloadFileName(
  fileName: string,
  fileExtension: ResumeMetadata["fileExtension"],
) {
  const trimmed = fileName.trim() || `resume.${fileExtension}`;
  const lowerFileName = trimmed.toLowerCase();

  return lowerFileName.endsWith(`.${fileExtension}`)
    ? trimmed
    : `${trimmed}.${fileExtension}`;
}

function stripResumeFileExtension(fileName: string) {
  return fileName.replace(/\.(pdf|docx)$/i, "").trim();
}

function trimOptional(value?: string) {
  const trimmed = value?.trim() ?? "";

  return trimmed.length > 0 ? trimmed : undefined;
}
