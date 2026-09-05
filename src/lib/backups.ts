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

  if (!isTrackerBackup(parsed)) {
    throw new Error("This backup file does not match the tracker backup schema.");
  }

  return parsed;
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

function isTrackerBackup(value: unknown): value is TrackerBackup {
  const backup = value as Partial<TrackerBackup>;

  return (
    Boolean(backup) &&
    backup.schemaVersion === BACKUP_SCHEMA_VERSION &&
    typeof backup.exportedAt === "string" &&
    Array.isArray(backup.resumeFiles) &&
    Boolean(backup.snapshot) &&
    Array.isArray(backup.snapshot?.applications) &&
    Array.isArray(backup.snapshot?.activities) &&
    Array.isArray(backup.snapshot?.contacts) &&
    Array.isArray(backup.snapshot?.interviews) &&
    Array.isArray(backup.snapshot?.resumes)
  );
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
