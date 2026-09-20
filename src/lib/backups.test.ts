import { describe, expect, it } from "vitest";
import type { StorageSnapshot } from "../storage/StorageAdapter";
import {
  DEFAULT_ANALYTICS_SETTINGS,
  DEFAULT_NOTIFICATION_STATE,
  DEFAULT_USER_SETTINGS,
} from "./domain";
import {
  BACKUP_SCHEMA_VERSION,
  MAX_BACKUP_FILE_BYTES,
  parseBackupFile,
} from "./backups";

const timestamp = "2026-09-21T00:00:00.000Z";

function createSnapshot(
  overrides: Partial<StorageSnapshot> = {},
): StorageSnapshot {
  return {
    activities: [],
    analyticsSettings: DEFAULT_ANALYTICS_SETTINGS,
    applications: [],
    contacts: [],
    interviews: [],
    notificationState: DEFAULT_NOTIFICATION_STATE,
    resumes: [],
    settings: DEFAULT_USER_SETTINGS,
    tablePreferences: null,
    ...overrides,
  };
}

function createBackupFile(snapshot: unknown, resumeFiles: unknown[] = []) {
  return new File(
    [
      JSON.stringify({
        exportedAt: timestamp,
        resumeFiles,
        schemaVersion: BACKUP_SCHEMA_VERSION,
        snapshot,
      }),
    ],
    "tracker-backup.json",
    { type: "application/json" },
  );
}

describe("parseBackupFile", () => {
  it("accepts a valid empty backup", async () => {
    await expect(parseBackupFile(createBackupFile(createSnapshot()))).resolves
      .toMatchObject({ schemaVersion: BACKUP_SCHEMA_VERSION });
  });

  it("rejects oversized backups before parsing", async () => {
    const file = createBackupFile(createSnapshot());
    Object.defineProperty(file, "size", { value: MAX_BACKUP_FILE_BYTES + 1 });

    await expect(parseBackupFile(file)).rejects.toThrow("100 MB or smaller");
  });

  it("rejects duplicate record IDs", async () => {
    const snapshot = createSnapshot({
      activities: [
        {
          id: "duplicate",
          applicationId: "app-1",
          type: "created",
          message: "Created",
          createdAt: timestamp,
        },
        {
          id: "duplicate",
          applicationId: "app-1",
          type: "updated",
          message: "Updated",
          createdAt: timestamp,
        },
      ],
    });

    await expect(parseBackupFile(createBackupFile(snapshot))).rejects.toThrow(
      "duplicate or blank record IDs",
    );
  });

  it("rejects records linked to missing applications", async () => {
    const snapshot = createSnapshot({
      contacts: [
        {
          id: "contact-1",
          applicationId: "missing-app",
          name: "Recruiter",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    });

    await expect(parseBackupFile(createBackupFile(snapshot))).rejects.toThrow(
      "contact data to a missing application",
    );
  });

  it("rejects incomplete settings", async () => {
    const snapshot = { ...createSnapshot(), settings: {} };

    await expect(parseBackupFile(createBackupFile(snapshot))).rejects.toThrow(
      "invalid tracker settings",
    );
  });

  it("rejects resume payloads that disagree with their metadata", async () => {
    const snapshot = createSnapshot({
      resumes: [
        {
          id: "resume-1",
          displayName: "Resume",
          originalFileName: "resume.pdf",
          downloadFileName: "resume.pdf",
          fileExtension: "pdf",
          mimeType: "application/pdf",
          fileSize: 100,
          storageKey: "resume-file-1",
          contentHash: "hash",
          uploadedAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    });
    const resumeFiles = [
      {
        dataBase64: btoa("%PDF-1"),
        mimeType: "application/pdf",
        storageKey: "resume-file-1",
      },
    ];

    await expect(
      parseBackupFile(createBackupFile(snapshot, resumeFiles)),
    ).rejects.toThrow("inconsistent resume file data");
  });
});
