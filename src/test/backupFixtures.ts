import type { ResumeMetadata } from "../types/application";
import type { TrackerBackup } from "../lib/backups";
import { timestamp, snapshot, application } from "./assessmentFixtures";

export function backupDocument(key = "document-file", bytes = "%PDF-original") {
  const metadata: ResumeMetadata = {
    id: `doc-${key}`, storageKey: key, displayName: "Document 界",
    originalFileName: "document.pdf", downloadFileName: "document.pdf",
    fileExtension: "pdf", mimeType: "application/pdf", fileSize: bytes.length,
    contentHash: "legacy-content-hash", uploadedAt: timestamp, updatedAt: timestamp,
    notes: "Keep metadata", versionLabel: "v1", lastUsedAt: timestamp,
  };
  return {
    metadata,
    payload: { storageKey: key, mimeType: metadata.mimeType, dataBase64: btoa(bytes) },
    record: { storageKey: key, file: new Blob([bytes], { type: metadata.mimeType }) },
  };
}

export function populatedBackup(): TrackerBackup {
  const resume = backupDocument("resume");
  const cover = backupDocument("cover", "%PDF-cover");
  return {
    schemaVersion: 3, exportedAt: timestamp,
    snapshot: snapshot({
      applications: [{ ...application, deadlineEntryMode: "exact", resumeId: resume.metadata.id, coverLetterId: cover.metadata.id, contactsCount: 1, notes: '界 😀 " \\ \n \u0000' }],
      contacts: [{ id: "contact", applicationId: application.id, name: "Recruiter", createdAt: timestamp, updatedAt: timestamp }],
      resumes: [resume.metadata], coverLetters: [cover.metadata],
      activities: [{ id: "created", applicationId: application.id, type: "created", message: "Created", createdAt: timestamp }],
    }),
    resumeFiles: [resume.payload], coverLetterFiles: [cover.payload],
  };
}

export function backupFile(backup: unknown) {
  return new File([JSON.stringify(backup)], "backup.json", { type: "application/json" });
}
