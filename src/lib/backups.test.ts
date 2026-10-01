import { describe, expect, it } from "vitest";
import type { StorageSnapshot } from "../storage/StorageAdapter";
import type { Application } from "../types/application";
import {
  DEFAULT_ANALYTICS_SETTINGS,
  DEFAULT_NOTIFICATION_STATE,
  DEFAULT_USER_SETTINGS,
} from "./domain";
import {
  BACKUP_SCHEMA_VERSION,
  createApplicationsCsv,
  MAX_BACKUP_FILE_BYTES,
  parseBackupFile,
} from "./backups";
import { MAX_RESUME_FILE_BYTES } from "./resumeFiles";

const timestamp = "2026-09-21T00:00:00.000Z";

function createApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: "app-1",
    company: "Example Company",
    jobTitle: "Product Intern",
    jobDescription: "",
    status: "Awaiting Response",
    workMode: "unknown",
    jobType: "internship",
    followUpNeeded: false,
    interviewProctored: false,
    deadlineEntryMode: "exact",
    priority: "medium",
    contactsCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function createSnapshot(
  overrides: Partial<StorageSnapshot> = {},
): StorageSnapshot {
  return {
    activities: [],
    analyticsSettings: DEFAULT_ANALYTICS_SETTINGS,
    applications: [],
    contacts: [],
    coverLetters: [],
    interviews: [],
    notificationState: DEFAULT_NOTIFICATION_STATE,
    resumes: [],
    settings: DEFAULT_USER_SETTINGS,
    tablePreferences: null,
    ...overrides,
  };
}

function createBackupFile(
  snapshot: unknown,
  resumeFiles: unknown[] = [],
  coverLetterFiles?: unknown[],
  schemaVersion = BACKUP_SCHEMA_VERSION,
) {
  return new File(
    [
      JSON.stringify({
        exportedAt: timestamp,
        ...(coverLetterFiles === undefined ? {} : { coverLetterFiles }),
        resumeFiles,
        schemaVersion,
        snapshot,
      }),
    ],
    "tracker-backup.json",
    { type: "application/json" },
  );
}

describe("createApplicationsCsv", () => {
  it("exports the current interview deadline instead of the legacy deadline", async () => {
    const csv = await createApplicationsCsv({
      applications: [
        createApplication({
          deadline: "2026-09-25T12:00",
          interviewDeadline: "2026-09-26T12:00",
        }),
      ],
      resumes: [],
    }).text();

    expect(csv).toContain("interview_deadline");
    expect(csv).toContain("2026-09-26T12:00");
    expect(csv).not.toContain("2026-09-25T12:00");
  });
});

describe("parseBackupFile", () => {
  it("accepts a valid empty backup", async () => {
    await expect(parseBackupFile(createBackupFile(createSnapshot()))).resolves
      .toMatchObject({ schemaVersion: BACKUP_SCHEMA_VERSION });
  });

  it("migrates the legacy Just Applied status", async () => {
    const application = {
      ...createApplication(),
      status: "Just Applied",
    } as unknown as Application;
    const snapshot = createSnapshot({ applications: [application] });

    await expect(parseBackupFile(createBackupFile(snapshot))).resolves
      .toMatchObject({
        snapshot: {
          applications: [{ status: "Awaiting Response" }],
        },
      });
  });

  it("migrates legacy backup Offered records without changing new ones", async () => {
    const snapshot = createSnapshot({
      applications: [createApplication({ status: "Offered" })],
    });

    await expect(
      parseBackupFile(createBackupFile(snapshot, [], undefined, 1)),
    ).resolves.toMatchObject({
      schemaVersion: BACKUP_SCHEMA_VERSION,
      snapshot: {
        applications: [{ status: "Accepted" }],
      },
    });

    await expect(parseBackupFile(createBackupFile(snapshot))).resolves
      .toMatchObject({
        snapshot: {
          applications: [{ status: "Offered" }],
        },
      });
  });

  it("accepts structured status transition activities", async () => {
    const snapshot = createSnapshot({
      applications: [createApplication()],
      activities: [
        {
          id: "activity-status",
          applicationId: "app-1",
          type: "status_changed",
          message: "Status changed to Interviewing.",
          statusFrom: "Awaiting Response",
          statusTo: "Interviewing",
          createdAt: timestamp,
        },
      ],
    });

    await expect(parseBackupFile(createBackupFile(snapshot))).resolves
      .toMatchObject({
        snapshot: {
          activities: [
            {
              statusFrom: "Awaiting Response",
              statusTo: "Interviewing",
            },
          ],
        },
      });
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

  it("rejects the removed application deletion activity type", async () => {
    const snapshot = {
      ...createSnapshot(),
      activities: [
        {
          id: "activity-1",
          applicationId: "app-1",
          type: "deleted",
          message: "Deleted application.",
          createdAt: timestamp,
        },
      ],
      applications: [createApplication()],
    };

    await expect(parseBackupFile(createBackupFile(snapshot))).rejects.toThrow(
      "invalid activity data",
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

  it("rejects impossible calendar dates in application data", async () => {
    const snapshot = createSnapshot({
      applications: [createApplication({ dateApplied: "2026-02-31" })],
    });

    await expect(parseBackupFile(createBackupFile(snapshot))).rejects.toThrow(
      "invalid application data",
    );
  });

  it("accepts date-only and exact date/time deadlines", async () => {
    const snapshot = createSnapshot({
      applications: [
        createApplication({ deadline: "2026-09-30T23:59" }),
        createApplication({
          id: "app-2",
          deadline: "2026-10-01",
        }),
      ],
    });

    await expect(parseBackupFile(createBackupFile(snapshot))).resolves
      .toMatchObject({ schemaVersion: BACKUP_SCHEMA_VERSION });
  });

  it("rejects malformed interview date-times", async () => {
    const snapshot = createSnapshot({
      applications: [createApplication()],
      interviews: [
        {
          id: "interview-1",
          applicationId: "app-1",
          type: "technical",
          mode: "video",
          dateTime: "not-a-date",
          proctored: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    });

    await expect(parseBackupFile(createBackupFile(snapshot))).rejects.toThrow(
      "invalid interview data",
    );
  });

  it("accepts the planned interview type and unknown mode options", async () => {
    const snapshot = createSnapshot({
      applications: [
        createApplication({
          interviewMode: "unknown",
          interviewType: "recruiter",
        }),
      ],
      interviews: [
        {
          id: "interview-1",
          applicationId: "app-1",
          type: "HackerRank",
          mode: "unknown",
          proctored: true,
          deadline: "2026-09-24T23:59",
          deadlineEntryMode: "2_days",
          deadlineReceivedAt: "2026-09-22T23:59",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    });

    await expect(parseBackupFile(createBackupFile(snapshot))).resolves
      .toMatchObject({ schemaVersion: BACKUP_SCHEMA_VERSION });
  });

  it("rejects application contact counts that disagree with contact records", async () => {
    const snapshot = createSnapshot({
      applications: [createApplication({ contactsCount: 1 })],
    });

    await expect(parseBackupFile(createBackupFile(snapshot))).rejects.toThrow(
      "inconsistent application contact counts",
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

  it("restores legacy resume files above the new-upload size limit", async () => {
    const legacyPdf = `%PDF-${"a".repeat(MAX_RESUME_FILE_BYTES - 4)}`;
    const snapshot = createSnapshot({
      resumes: [
        {
          id: "resume-legacy",
          displayName: "Legacy resume",
          originalFileName: "legacy.pdf",
          downloadFileName: "legacy.pdf",
          fileExtension: "pdf",
          mimeType: "application/pdf",
          fileSize: legacyPdf.length,
          storageKey: "resume-file-legacy",
          contentHash: "legacy-hash",
          uploadedAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    });

    await expect(
      parseBackupFile(
        createBackupFile(snapshot, [
          {
            dataBase64: btoa(legacyPdf),
            mimeType: "application/pdf",
            storageKey: "resume-file-legacy",
          },
        ]),
      ),
    ).resolves.toMatchObject({ schemaVersion: BACKUP_SCHEMA_VERSION });
  });

  it("validates and restores cover letter metadata and files", async () => {
    const coverLetterPdf = "%PDF-cover-letter";
    const snapshot = createSnapshot({
      applications: [createApplication({ coverLetterId: "cover-letter-1" })],
      coverLetters: [
        {
          id: "cover-letter-1",
          displayName: "Acme cover letter",
          originalFileName: "cover-letter.pdf",
          downloadFileName: "cover-letter.pdf",
          fileExtension: "pdf",
          mimeType: "application/pdf",
          fileSize: coverLetterPdf.length,
          storageKey: "cover-letter-file-1",
          contentHash: "cover-letter-hash",
          uploadedAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    });

    await expect(
      parseBackupFile(
        createBackupFile(snapshot, [], [
          {
            dataBase64: btoa(coverLetterPdf),
            mimeType: "application/pdf",
            storageKey: "cover-letter-file-1",
          },
        ]),
      ),
    ).resolves.toMatchObject({
      coverLetterFiles: [{ storageKey: "cover-letter-file-1" }],
      snapshot: { coverLetters: [{ id: "cover-letter-1" }] },
    });
  });
});
