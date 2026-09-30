import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { DEFAULT_USER_SETTINGS } from "../lib/domain";
import { TRACKER_DATA_VERSION } from "./StorageAdapter";
import type {
  Activity,
  Application,
  ApplicationContact,
  CoverLetterMetadata,
  Interview,
  ResumeMetadata,
} from "../types/application";
import { createTestStorageAdapter } from "../test/indexedDb";

const timestamp = "2026-09-21T00:00:00.000Z";

const application: Application = {
  id: "app-1",
  company: "Example Company",
  jobTitle: "Software Engineer",
  jobDescription: "",
  status: "Interviewing",
  workMode: "unknown",
  jobType: "internship",
  followUpNeeded: false,
  interviewRound: 1,
  interviewType: "technical",
  interviewMode: "video",
  interviewProctored: false,
  deadlineEntryMode: "exact",
  priority: "medium",
  contactsCount: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const activity: Activity = {
  id: "activity-1",
  applicationId: application.id,
  type: "created",
  message: "Application created",
  createdAt: timestamp,
};

const contact: ApplicationContact = {
  id: "contact-1",
  applicationId: application.id,
  name: "Example Recruiter",
  createdAt: timestamp,
  updatedAt: timestamp,
};

const interview: Interview = {
  id: "interview-1",
  applicationId: application.id,
  round: 1,
  type: "technical",
  mode: "video",
  proctored: false,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const resume: ResumeMetadata = {
  id: "resume-1",
  displayName: "Engineering resume",
  originalFileName: "resume.pdf",
  downloadFileName: "resume.pdf",
  fileExtension: "pdf",
  mimeType: "application/pdf",
  fileSize: 4,
  storageKey: "resume-file-1",
  contentHash: "hash",
  uploadedAt: timestamp,
  updatedAt: timestamp,
  lastUsedAt: timestamp,
};

const coverLetter: CoverLetterMetadata = {
  ...resume,
  id: "cover-letter-1",
  displayName: "Engineering cover letter",
  originalFileName: "cover-letter.pdf",
  downloadFileName: "cover-letter.pdf",
  storageKey: "cover-letter-file-1",
};

describe("indexedDbStorageAdapter", () => {
  it("creates an isolated empty database with default settings", async () => {
    const adapter = createTestStorageAdapter();

    await expect(adapter.initialize()).resolves.toMatchObject({
      dataVersion: TRACKER_DATA_VERSION,
      activities: [],
      applications: [],
      contacts: [],
      coverLetters: [],
      interviews: [],
      resumes: [],
      settings: DEFAULT_USER_SETTINGS,
    });
  });

  it("keeps test adapter databases isolated", async () => {
    const firstAdapter = createTestStorageAdapter();
    const secondAdapter = createTestStorageAdapter();

    await firstAdapter.initialize();
    await secondAdapter.initialize();
    await firstAdapter.saveSettings({
      ...DEFAULT_USER_SETTINGS,
      dueSoonDays: 10,
    });

    await expect(firstAdapter.getSettings()).resolves.toMatchObject({
      dueSoonDays: 10,
    });
    await expect(secondAdapter.getSettings()).resolves.toMatchObject({
      dueSoonDays: DEFAULT_USER_SETTINGS.dueSoonDays,
    });
  });

  it("normalizes legacy application statuses when reading saved records", async () => {
    const adapter = createTestStorageAdapter();
    const legacyApplication = {
      ...application,
      status: "Just Applied",
    } as unknown as Application;

    await adapter.initialize();
    await adapter.commitMutation({ applications: [legacyApplication] });

    await expect(adapter.listApplications()).resolves.toMatchObject([
      { status: "Awaiting Response" },
    ]);
  });

  it("migrates the legacy terminal Offered status to Accepted", async () => {
    const indexedDb = new IDBFactory();
    const databaseName = "legacy-offered-status";

    await seedVersionFourApplication(indexedDb, databaseName, {
      ...application,
      status: "Offered",
    });

    const adapter = createTestStorageAdapter({ databaseName, indexedDb });

    await adapter.initialize();

    await expect(adapter.listApplications()).resolves.toMatchObject([
      { status: "Accepted" },
    ]);
  });

  it("commits a complete domain mutation atomically", async () => {
    const indexedDb = new IDBFactory();
    const databaseName = "atomic-domain-mutation";
    const adapter = createTestStorageAdapter({ databaseName, indexedDb });

    await adapter.initialize();
    await adapter.commitMutation({
      activities: [activity],
      applications: [{
        ...application,
        coverLetterId: coverLetter.id,
        resumeId: resume.id,
      }],
      contacts: [contact],
      coverLetters: [coverLetter],
      interviews: [interview],
      resumes: [resume],
      resumeFiles: [
        { storageKey: resume.storageKey, file: new Blob(["%PDF"]) },
        { storageKey: coverLetter.storageKey, file: new Blob(["%PDF"]) },
      ],
    });

    const refreshedAdapter = createTestStorageAdapter({ databaseName, indexedDb });
    await expect(refreshedAdapter.initialize()).resolves.toMatchObject({
      activities: [activity],
      applications: [{
        coverLetterId: coverLetter.id,
        id: application.id,
        resumeId: resume.id,
      }],
      contacts: [contact],
      coverLetters: [coverLetter],
      interviews: [interview],
      resumes: [resume],
    });
    await expect(refreshedAdapter.getResumeFile(resume.storageKey)).resolves.toMatchObject(
      { size: 4 },
    );
    await expect(
      refreshedAdapter.getResumeFile(coverLetter.storageKey),
    ).resolves.toMatchObject({ size: 4 });
  });

  it("ignores empty write lists when their stores are outside the transaction", async () => {
    const adapter = createTestStorageAdapter();

    await adapter.initialize();
    await expect(
      adapter.commitMutation({
        activities: [],
        applications: [application],
        contacts: [],
        interviews: [],
      }),
    ).resolves.toBeUndefined();
    await expect(adapter.listApplications()).resolves.toEqual([application]);
  });

  it("ignores empty delete lists when their stores are outside the transaction", async () => {
    const adapter = createTestStorageAdapter();

    await adapter.initialize();
    await adapter.commitMutation({ resumes: [resume] });
    await expect(
      adapter.commitMutation({
        applications: [],
        deleteContactIds: [],
        deleteInterviewIds: [],
        deleteResumeIds: [resume.id],
      }),
    ).resolves.toBeUndefined();
    await expect(adapter.listResumeMetadata()).resolves.toEqual([]);
  });

  it("rolls back partial writes and permits a retry after an injected failure", async () => {
    let failContactWrite = true;
    const adapter = createTestStorageAdapter({
      beforeMutationWrite(operation) {
        if (failContactWrite && operation.storeName === "contacts") {
          throw new Error("Injected contact write failure");
        }
      },
    });

    await adapter.initialize();
    const mutation = {
      activities: [activity],
      applications: [application],
      contacts: [contact],
    };

    await expect(adapter.commitMutation(mutation)).rejects.toThrow(
      "Injected contact write failure",
    );
    await expect(adapter.listActivities()).resolves.toEqual([]);
    await expect(adapter.listApplications()).resolves.toEqual([]);
    await expect(adapter.listContacts()).resolves.toEqual([]);

    failContactWrite = false;
    await expect(adapter.commitMutation(mutation)).resolves.toBeUndefined();
    await expect(adapter.listActivities()).resolves.toEqual([activity]);
    await expect(adapter.listApplications()).resolves.toEqual([application]);
    await expect(adapter.listContacts()).resolves.toEqual([contact]);
  });

  it("does not leave an application or resume behind when the file write fails", async () => {
    const adapter = createTestStorageAdapter({
      beforeMutationWrite(operation) {
        if (operation.storeName === "resumeFiles") {
          throw new Error("Injected resume file write failure");
        }
      },
    });

    await adapter.initialize();
    await expect(
      adapter.commitMutation({
        activities: [activity],
        applications: [{ ...application, resumeId: resume.id }],
        interviews: [interview],
        resumes: [resume],
        resumeFiles: [
          { storageKey: resume.storageKey, file: new Blob(["%PDF"]) },
        ],
      }),
    ).rejects.toThrow("Injected resume file write failure");

    await expect(adapter.listActivities()).resolves.toEqual([]);
    await expect(adapter.listApplications()).resolves.toEqual([]);
    await expect(adapter.listInterviews()).resolves.toEqual([]);
    await expect(adapter.listResumeMetadata()).resolves.toEqual([]);
    await expect(adapter.getResumeFile(resume.storageKey)).resolves.toBeUndefined();
  });

  it.each([
    "activities",
    "applications",
    "contacts",
    "coverLetterMetadata",
    "interviews",
    "resumeMetadata",
    "resumeFiles",
  ] as const)(
    "rolls back every store after an injected %s write failure",
    async (failingStore) => {
      const indexedDb = new IDBFactory();
      const databaseName = `rollback-${failingStore}`;
      const adapter = createTestStorageAdapter({
        databaseName,
        indexedDb,
        beforeMutationWrite(operation) {
          if (operation.storeName === failingStore) {
            throw new Error(`Injected ${failingStore} write failure`);
          }
        },
      });

      await adapter.initialize();
      await expect(
        adapter.commitMutation({
          activities: [activity],
          applications: [{ ...application, resumeId: resume.id }],
          contacts: [contact],
          coverLetters: [coverLetter],
          interviews: [interview],
          resumes: [resume],
          resumeFiles: [
            { storageKey: resume.storageKey, file: new Blob(["%PDF"]) },
          ],
        }),
      ).rejects.toThrow(`Injected ${failingStore} write failure`);

      const refreshedAdapter = createTestStorageAdapter({
        databaseName,
        indexedDb,
      });
      await expect(refreshedAdapter.initialize()).resolves.toMatchObject({
        activities: [],
        applications: [],
        contacts: [],
        coverLetters: [],
        interviews: [],
        resumes: [],
      });
      await expect(
        refreshedAdapter.getResumeFile(resume.storageKey),
      ).resolves.toBeUndefined();
    },
  );

  it("deletes resume records while unlinking applications in one transaction", async () => {
    const adapter = createTestStorageAdapter();
    const linkedApplication = { ...application, resumeId: resume.id };
    const unlinkedApplication = {
      ...linkedApplication,
      resumeId: undefined,
      updatedAt: "2026-09-21T01:00:00.000Z",
    };

    await adapter.initialize();
    await adapter.commitMutation({
      applications: [linkedApplication],
      resumes: [resume],
      resumeFiles: [{ storageKey: resume.storageKey, file: new Blob(["%PDF"]) }],
    });
    await adapter.commitMutation({
      applications: [unlinkedApplication],
      deleteResumeIds: [resume.id],
      deleteResumeFileKeys: [resume.storageKey],
    });

    await expect(adapter.listApplications()).resolves.toEqual([
      unlinkedApplication,
    ]);
    await expect(adapter.listResumeMetadata()).resolves.toEqual([]);
    await expect(adapter.getResumeFile(resume.storageKey)).resolves.toBeUndefined();
  });

  it("deletes cover letters and their shared file records atomically", async () => {
    const adapter = createTestStorageAdapter();
    const linkedApplication = {
      ...application,
      coverLetterId: coverLetter.id,
    };
    const unlinkedApplication = {
      ...linkedApplication,
      coverLetterId: undefined,
      updatedAt: "2026-09-21T01:00:00.000Z",
    };

    await adapter.initialize();
    await adapter.commitMutation({
      applications: [linkedApplication],
      coverLetters: [coverLetter],
      resumeFiles: [
        { storageKey: coverLetter.storageKey, file: new Blob(["%PDF"]) },
      ],
    });
    await adapter.commitMutation({
      applications: [unlinkedApplication],
      deleteCoverLetterIds: [coverLetter.id],
      deleteResumeFileKeys: [coverLetter.storageKey],
    });

    await expect(adapter.listApplications()).resolves.toEqual([
      unlinkedApplication,
    ]);
    await expect(adapter.listCoverLetterMetadata()).resolves.toEqual([]);
    await expect(
      adapter.getResumeFile(coverLetter.storageKey),
    ).resolves.toBeUndefined();
  });
});

function seedVersionFourApplication(
  indexedDb: IDBFactory,
  databaseName: string,
  record: Application,
) {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDb.open(databaseName, 4);

    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore("applications", {
        keyPath: "id",
      });

      store.put(record);
    };
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
  });
}
