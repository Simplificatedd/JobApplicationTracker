import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_ANALYTICS_SETTINGS,
  DEFAULT_NOTIFICATION_STATE,
  DEFAULT_USER_SETTINGS,
} from "../lib/domain";
import type { Application, ResumeMetadata } from "../types/application";
import {
  CloudRevisionConflictError,
  type CloudAccount,
  type CloudApiClient,
  type CloudStateEnvelope,
} from "./cloudApi";
import {
  applyStorageMutation,
  createCloudStorageAdapter,
} from "./cloudStorageAdapter";
import { createIndexedDbStorageAdapter } from "./indexedDbAdapter";
import {
  TRACKER_DATA_VERSION,
  type StorageSnapshot,
} from "./StorageAdapter";

const application: Application = {
  company: "Example Co",
  contactsCount: 0,
  createdAt: "2026-09-22T00:00:00.000Z",
  deadlineEntryMode: "exact",
  followUpNeeded: false,
  id: "app-1",
  interviewProctored: false,
  jobDescription: "",
  jobTitle: "Engineer",
  jobType: "full-time",
  priority: "medium",
  status: "Awaiting Response",
  updatedAt: "2026-09-22T00:00:00.000Z",
  workMode: "hybrid",
};

const resume: ResumeMetadata = {
  contentHash: "hash",
  displayName: "Engineering resume",
  downloadFileName: "resume.pdf",
  fileExtension: "pdf",
  fileSize: 5,
  id: "resume-1",
  mimeType: "application/pdf",
  originalFileName: "resume.pdf",
  storageKey: "resume-file-1",
  updatedAt: "2026-09-22T00:00:00.000Z",
  uploadedAt: "2026-09-22T00:00:00.000Z",
};

function createSnapshot(
  applications: Application[] = [],
  resumes: ResumeMetadata[] = [],
): StorageSnapshot {
  return {
    activities: [],
    analyticsSettings: DEFAULT_ANALYTICS_SETTINGS,
    applications,
    contacts: [],
    coverLetters: [],
    interviews: [],
    notificationState: DEFAULT_NOTIFICATION_STATE,
    resumes,
    settings: DEFAULT_USER_SETTINGS,
    tablePreferences: null,
  };
}

class FakeCloudApi implements CloudApiClient {
  account: CloudAccount = { email: "student@example.edu" };
  files = new Map<string, Blob>();
  state: CloudStateEnvelope | null = null;
  conflictState: CloudStateEnvelope | null = null;

  async getSession() {
    return this.account;
  }

  async getState() {
    return this.state;
  }

  async saveState(snapshot: StorageSnapshot, baseRevision: number | null) {
    if (this.conflictState) {
      const conflict = this.conflictState;
      this.conflictState = null;
      this.state = conflict;
      throw new CloudRevisionConflictError(conflict);
    }

    if (
      (this.state === null && baseRevision !== null) ||
      (this.state !== null && baseRevision !== this.state.revision)
    ) {
      throw new CloudRevisionConflictError(this.state);
    }

    this.state = {
      revision: (this.state?.revision ?? 0) + 1,
      snapshot,
      updatedAt: "2026-09-22T00:00:00.000Z",
    };
    return this.state;
  }

  async putResumeFile(storageKey: string, file: Blob) {
    this.files.set(storageKey, file);
  }

  async getResumeFile(storageKey: string) {
    const file = this.files.get(storageKey);
    if (!file) throw new Error("Missing file");
    return file;
  }

  async deleteResumeFile(storageKey: string) {
    this.files.delete(storageKey);
  }
}

function createCache(name: string) {
  return createIndexedDbStorageAdapter({
    databaseName: name,
    indexedDb: new IDBFactory(),
  });
}

describe("cloud storage adapter", () => {
  it("applies atomic record writes and deletes to a snapshot", () => {
    const nextApplication = { ...application, company: "Updated Co" };
    const contact = {
      applicationId: application.id,
      createdAt: application.createdAt,
      id: "contact-1",
      name: "Recruiter",
      updatedAt: application.updatedAt,
    };
    const initial = { ...createSnapshot([application]), contacts: [contact] };

    expect(
      applyStorageMutation(initial, {
        applications: [nextApplication],
        deleteContactIds: [contact.id],
      }),
    ).toMatchObject({
      applications: [{ company: "Updated Co" }],
      contacts: [],
    });
  });

  it("migrates the existing IndexedDB snapshot and resume bytes on first sign-in", async () => {
    const cache = createCache("cloud-migration");
    const file = new Blob(["%PDF-"], { type: "application/pdf" });
    await cache.initialize();
    await cache.importSnapshot(createSnapshot([application], [resume]), [
      { file, storageKey: resume.storageKey },
    ]);
    const api = new FakeCloudApi();
    const adapter = createCloudStorageAdapter({ api, cache });

    await expect(adapter.initialize()).resolves.toMatchObject({
      applications: [{ id: application.id }],
      resumes: [{ id: resume.id }],
    });
    expect(adapter.getAccount()).toEqual({ email: "student@example.edu" });
    expect(api.state).toMatchObject({ revision: 1 });
    await expect(api.files.get(resume.storageKey)?.text()).resolves.toBe("%PDF-");
  });

  it("uses cloud state as authoritative and refreshes the local cache", async () => {
    const cache = createCache("cloud-authoritative");
    await cache.initialize();
    await cache.importSnapshot(createSnapshot([{ ...application, company: "Local" }]));
    const api = new FakeCloudApi();
    api.state = {
      revision: 7,
      snapshot: createSnapshot([{ ...application, company: "Cloud" }]),
      updatedAt: "2026-09-22T00:00:00.000Z",
    };
    const adapter = createCloudStorageAdapter({ api, cache });

    await expect(adapter.initialize()).resolves.toMatchObject({
      applications: [{ company: "Cloud" }],
    });
    await expect(cache.exportSnapshot()).resolves.toMatchObject({
      applications: [{ company: "Cloud" }],
    });
  });

  it("normalizes legacy application statuses from cloud state", async () => {
    const cache = createCache("cloud-status-migration");
    const api = new FakeCloudApi();
    const legacyApplication = {
      ...application,
      status: "Just Applied",
    } as unknown as Application;
    api.state = {
      revision: 7,
      snapshot: createSnapshot([legacyApplication]),
      updatedAt: "2026-09-22T00:00:00.000Z",
    };
    const adapter = createCloudStorageAdapter({ api, cache });

    await expect(adapter.initialize()).resolves.toMatchObject({
      applications: [{ status: "Awaiting Response" }],
    });
    await expect(adapter.listApplications()).resolves.toMatchObject([
      { status: "Awaiting Response" },
    ]);
  });

  it("materializes legacy derived follow-up dates from cloud state", async () => {
    const cache = createCache("cloud-follow-up-migration");
    const api = new FakeCloudApi();
    api.state = {
      revision: 7,
      snapshot: {
        ...createSnapshot([
          {
            ...application,
            dateApplied: "2026-09-24",
            followUpNeeded: true,
          },
        ]),
        settings: {
          ...DEFAULT_USER_SETTINGS,
          defaultFollowUpPromptDays: 3,
        },
      },
      updatedAt: "2026-09-22T00:00:00.000Z",
    };
    const adapter = createCloudStorageAdapter({ api, cache });

    await expect(adapter.initialize()).resolves.toMatchObject({
      applications: [
        {
          followUpAutoResetEnabled: false,
          followUpDate: "2026-09-27",
          followUpNeeded: true,
        },
      ],
    });
    await expect(cache.listApplications()).resolves.toMatchObject([
      { followUpDate: "2026-09-27" },
    ]);
  });

  it("migrates legacy cloud Offered records without changing new ones", async () => {
    const legacyCache = createCache("cloud-legacy-offered");
    const legacyApi = new FakeCloudApi();
    legacyApi.state = {
      revision: 7,
      snapshot: createSnapshot([{ ...application, status: "Offered" }]),
      updatedAt: "2026-09-22T00:00:00.000Z",
    };
    const legacyAdapter = createCloudStorageAdapter({
      api: legacyApi,
      cache: legacyCache,
    });

    await expect(legacyAdapter.initialize()).resolves.toMatchObject({
      applications: [{ status: "Accepted" }],
      dataVersion: TRACKER_DATA_VERSION,
    });

    const currentCache = createCache("cloud-current-offered");
    const currentApi = new FakeCloudApi();
    currentApi.state = {
      revision: 8,
      snapshot: {
        ...createSnapshot([{ ...application, status: "Offered" }]),
        dataVersion: TRACKER_DATA_VERSION,
      },
      updatedAt: "2026-09-22T00:01:00.000Z",
    };
    const currentAdapter = createCloudStorageAdapter({
      api: currentApi,
      cache: currentCache,
    });

    await expect(currentAdapter.initialize()).resolves.toMatchObject({
      applications: [{ status: "Offered" }],
      dataVersion: TRACKER_DATA_VERSION,
    });
  });

  it("rebases a mutation on the newest cloud revision after a conflict", async () => {
    const cache = createCache("cloud-conflict");
    const api = new FakeCloudApi();
    api.state = {
      revision: 1,
      snapshot: createSnapshot(),
      updatedAt: "2026-09-22T00:00:00.000Z",
    };
    api.conflictState = {
      revision: 2,
      snapshot: createSnapshot([{ ...application, id: "other-app" }]),
      updatedAt: "2026-09-22T00:01:00.000Z",
    };
    const adapter = createCloudStorageAdapter({ api, cache });
    await adapter.initialize();

    await adapter.commitMutation({ applications: [application] });

    expect(api.state).toMatchObject({
      // Migration is persisted at revision 3, then the rebased domain write at 4.
      revision: 4,
      snapshot: {
        applications: expect.arrayContaining([
          expect.objectContaining({ id: "other-app" }),
          expect.objectContaining({ id: application.id }),
        ]),
      },
    });
  });
});

describe("assessment cloud migration and conflicts", () => {
  const assessmentInterview = {
    id: "legacy-assessment",
    applicationId: application.id,
    round: 2,
    type: "online-assessment" as const,
    mode: "video" as const,
    proctored: false,
    deadline: "2026-10-20T00:00:00.000Z",
    notes: "Keep me",
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
  };
  it("persists migration at startup and does not duplicate on a second client startup", async () => {
    const api = new FakeCloudApi();
    api.state = {
      revision: 1,
      snapshot: {
        ...createSnapshot([
          {
            ...application,
            status: "Interviewing",
            interviewRound: 2,
            interviewType: "online-assessment",
          },
        ]),
        dataVersion: 2,
        interviews: [assessmentInterview],
      },
      updatedAt: application.updatedAt,
    };
    const first = await createCloudStorageAdapter({
      api,
      cache: createCache("assessment-start-1"),
    }).initialize();
    expect(api.state?.snapshot.interviews).toEqual([]);
    expect(api.state?.snapshot.assessments).toMatchObject([
      { id: assessmentInterview.id, originalInterviewRound: 2 },
    ]);
    const revision = api.state?.revision;
    const second = await createCloudStorageAdapter({
      api,
      cache: createCache("assessment-start-2"),
    }).initialize();
    expect(second).toEqual(first);
    expect(api.state?.revision).toBe(revision);
  });
  it("rebases competing assessments with unique numbers and preserves concurrent application status", async () => {
    const api = new FakeCloudApi();
    api.state = {
      revision: 1,
      snapshot: { ...createSnapshot([application]), dataVersion: 2 },
      updatedAt: application.updatedAt,
    };
    const adapter = createCloudStorageAdapter({
      api,
      cache: createCache("assessment-number-conflict"),
    });
    const initialized = await adapter.initialize();
    const first = {
      id: "one",
      applicationId: application.id,
      number: 1,
      type: "coding" as const,
      proctored: "unknown" as const,
      progress: "not-started" as const,
      result: "pending" as const,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
    };
    api.conflictState = {
      revision: (api.state?.revision ?? 1) + 1,
      snapshot: {
        ...initialized,
        applications: [
          {
            ...initialized.applications[0],
            status: "Accepted",
            company: "Edited elsewhere",
          },
        ],
        assessments: [first],
      },
      updatedAt: application.updatedAt,
    };
    await adapter.commitMutation({
      assessments: [{ ...first, id: "two" }],
      applications: [initialized.applications[0]],
    });
    expect(
      (await adapter.listAssessments()).map((item) => [item.id, item.number]),
    ).toEqual([
      ["one", 1],
      ["two", 2],
    ]);
    expect(await adapter.getApplication(application.id)).toMatchObject({
      status: "Accepted",
      company: "Edited elsewhere",
    });
  });
  it("refuses future data formats before saving or refreshing the cache", async () => {
    const api = new FakeCloudApi();
    api.state = {
      revision: 1,
      snapshot: { ...createSnapshot([application]), dataVersion: 999 },
      updatedAt: application.updatedAt,
    };
    const adapter = createCloudStorageAdapter({
      api,
      cache: createCache("future-assessment-data"),
    });
    await expect(adapter.initialize()).rejects.toThrow("newer data format");
    expect(api.state.revision).toBe(1);
  });
});
