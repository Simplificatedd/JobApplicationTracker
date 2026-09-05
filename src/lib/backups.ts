import type { StorageSnapshot } from "../storage/StorageAdapter";
import type { Application, ResumeMetadata } from "../types/application";

export const BACKUP_SCHEMA_VERSION = 1;

export interface ResumeFileBackup {
  dataBase64: string;
  mimeType: string;
  storageKey: string;
}

export interface TrackerBackup {
  exportedAt: string;
  resumeFiles: ResumeFileBackup[];
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  snapshot: StorageSnapshot;
}

export interface BackupImportPreview {
  activities: number;
  applications: number;
  contacts: number;
  interviews: number;
  resumeFiles: number;
  resumes: number;
}

export async function createBackupFile({
  resumeFiles,
  snapshot,
}: {
  resumeFiles: ResumeFileBackup[];
  snapshot: StorageSnapshot;
}) {
  const backup: TrackerBackup = {
    exportedAt: new Date().toISOString(),
    resumeFiles,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    snapshot,
  };

  return new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
}

export async function blobToBase64(blob: Blob) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("Resume file could not be read."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });

  return dataUrl.split(",", 2)[1] ?? "";
}

export function base64ToBlob(dataBase64: string, mimeType: string) {
  const binary = atob(dataBase64);
  const chunks: ArrayBuffer[] = [];

  for (let index = 0; index < binary.length; index += 1024) {
    const slice = binary.slice(index, index + 1024);
    const bytes = new Uint8Array(slice.length);

    for (let byteIndex = 0; byteIndex < slice.length; byteIndex += 1) {
      bytes[byteIndex] = slice.charCodeAt(byteIndex);
    }

    chunks.push(bytes.buffer.slice(0) as ArrayBuffer);
  }

  return new Blob(chunks, { type: mimeType });
}

export async function parseBackupFile(file: File) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("Choose a valid tracker backup JSON file.");
  }

  const validationError = getBackupValidationError(parsed);

  if (validationError) {
    throw new Error(validationError);
  }

  return parsed as TrackerBackup;
}

export function getBackupImportPreview(
  backup: TrackerBackup,
): BackupImportPreview {
  return {
    activities: backup.snapshot.activities.length,
    applications: backup.snapshot.applications.length,
    contacts: backup.snapshot.contacts.length,
    interviews: backup.snapshot.interviews.length,
    resumeFiles: backup.resumeFiles.length,
    resumes: backup.snapshot.resumes.length,
  };
}

export function createApplicationsCsv({
  applications,
  resumes,
}: {
  applications: Application[];
  resumes: ResumeMetadata[];
}) {
  const resumeById = new Map(resumes.map((resume) => [resume.id, resume]));
  const rows = applications.map((application) => [
    application.company,
    application.jobTitle,
    application.status,
    application.dateApplied,
    application.deadline,
    application.followUpNeeded ? "yes" : "no",
    application.followUpDate,
    application.interviewDateTime,
    application.source,
    application.location,
    application.jobType,
    application.applicationUrl,
    application.resumeId
      ? resumeById.get(application.resumeId)?.displayName ?? "Missing resume"
      : "",
    application.notes,
  ]);
  const header = [
    "company",
    "job_title",
    "status",
    "applied_date",
    "deadline",
    "follow_up_needed",
    "follow_up_date",
    "interview_date_time",
    "source",
    "location",
    "job_type",
    "application_url",
    "resume",
    "notes",
  ];
  const csv = [header, ...rows].map(toCsvRow).join("\n");

  return new Blob([csv], { type: "text/csv;charset=utf-8" });
}

function getBackupValidationError(value: unknown) {
  if (!isRecord(value)) {
    return "This backup file does not match the tracker backup schema.";
  }

  if (value.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    return "This backup file uses an unsupported schema version.";
  }

  if (typeof value.exportedAt !== "string") {
    return "This backup file is missing an export timestamp.";
  }

  if (!Array.isArray(value.resumeFiles)) {
    return "This backup file is missing resume file payloads.";
  }

  if (!isStorageSnapshot(value.snapshot)) {
    return "This backup file is missing required tracker data.";
  }

  const resumeIds = new Set<string>();
  const uploadedResumeStorageKeys = new Set<string>();

  for (const resume of value.snapshot.resumes) {
    if (!isResumeMetadata(resume)) {
      return "This backup file contains invalid resume metadata.";
    }

    resumeIds.add(resume.id);

    if (resume.fileSize > 0) {
      uploadedResumeStorageKeys.add(resume.storageKey);
    }
  }

  for (const application of value.snapshot.applications) {
    if (!isApplication(application)) {
      return "This backup file contains invalid application data.";
    }

    if (application.resumeId && !resumeIds.has(application.resumeId)) {
      return "This backup file links an application to a missing resume.";
    }
  }

  const resumeFileStorageKeys = new Set<string>();

  for (const resumeFile of value.resumeFiles) {
    if (!isResumeFileBackup(resumeFile)) {
      return "This backup file contains invalid resume file data.";
    }

    resumeFileStorageKeys.add(resumeFile.storageKey);
  }

  for (const storageKey of uploadedResumeStorageKeys) {
    if (!resumeFileStorageKeys.has(storageKey)) {
      return "This backup file is missing a stored resume file.";
    }
  }

  return null;
}

function isStorageSnapshot(value: unknown): value is StorageSnapshot {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Array.isArray(value.activities) &&
    isRecord(value.analyticsSettings) &&
    Array.isArray(value.applications) &&
    Array.isArray(value.contacts) &&
    Array.isArray(value.interviews) &&
    isRecord(value.notificationState) &&
    Array.isArray(value.resumes) &&
    isRecord(value.settings) &&
    (value.tablePreferences === null || isRecord(value.tablePreferences))
  );
}

function isApplication(value: unknown): value is Application {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.company === "string" &&
    typeof value.jobTitle === "string" &&
    typeof value.jobDescription === "string" &&
    typeof value.status === "string" &&
    typeof value.followUpNeeded === "boolean" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    (value.resumeId === undefined || typeof value.resumeId === "string")
  );
}

function isResumeMetadata(value: unknown): value is ResumeMetadata {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.displayName === "string" &&
    typeof value.originalFileName === "string" &&
    typeof value.downloadFileName === "string" &&
    (value.fileExtension === "pdf" || value.fileExtension === "docx") &&
    typeof value.mimeType === "string" &&
    typeof value.fileSize === "number" &&
    value.fileSize >= 0 &&
    typeof value.storageKey === "string" &&
    typeof value.contentHash === "string" &&
    typeof value.uploadedAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isResumeFileBackup(value: unknown): value is ResumeFileBackup {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.storageKey === "string" &&
    value.storageKey.trim().length > 0 &&
    typeof value.mimeType === "string" &&
    value.mimeType.trim().length > 0 &&
    typeof value.dataBase64 === "string" &&
    isValidBase64(value.dataBase64)
  );
}

function isValidBase64(value: string) {
  try {
    atob(value);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toCsvRow(fields: Array<string | undefined>) {
  return fields
    .map((field) => {
      const value = field ?? "";

      return /[",\n\r]/.test(value)
        ? `"${value.replace(/"/g, '""')}"`
        : value;
    })
    .join(",");
}
