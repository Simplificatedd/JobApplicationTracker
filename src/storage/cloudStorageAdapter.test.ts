import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ANALYTICS_SETTINGS,
  DEFAULT_NOTIFICATION_STATE,
  DEFAULT_USER_SETTINGS,
} from "../lib/domain";
import type { Application, ResumeMetadata } from "../types/application";
import {
  CloudApiError,
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
import { CLOUD_SNAPSHOT_SIZE_MESSAGE } from "./snapshotSize";

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
  account: CloudAccount = { id: "student-id", email: "student@example.edu" };
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

describe("account invalidation during pending work", () => {
  function setup() {
    const api = new FakeCloudApi();
    api.state = {
      revision: 1,
      snapshot: { ...createSnapshot([application], [resume]), dataVersion: TRACKER_DATA_VERSION },
      updatedAt: application.updatedAt,
    };
    const cache = createCache("invalidation-races");
    const changed = vi.fn();
    const adapter = createCloudStorageAdapter({ api, cache, onAccountChanged: changed });
    async function invalidate() {
      api.account = { id: "other-id", email: "other@example.edu" };
      await expect(adapter.listApplications()).rejects.toThrow("Signed-in account changed");
      expect(changed).toHaveBeenCalledTimes(1);
      expect(adapter.getAccount()).toBeNull();
    }
    return { api, cache, adapter, invalidate, changed };
  }

  it("rejects an old final session response instead of returning initialization data", async () => {
    const { api, adapter, invalidate } = setup();
    const entered = deferred<void>();
    const session = deferred<CloudAccount>();
    const oldAccount = api.account;
    let calls = 0;
    vi.spyOn(api, "getSession").mockImplementation(async () => {
      if (++calls === 2) {
        entered.resolve();
        return session.promise;
      }
      return api.account;
    });
    const pending = expect(adapter.initialize()).rejects.toThrow("Signed-in account changed");
    await entered.promise;
    await invalidate();
    session.resolve(oldAccount);
    await pending;
  });

  it("rejects a cached A file that resolves after B was detected", async () => {
    const { cache, adapter, invalidate } = setup();
    await adapter.initialize();
    const entered = deferred<void>();
    const file = deferred<Blob>();
    vi.spyOn(cache, "getResumeFile").mockImplementation(() => {
      entered.resolve();
      return file.promise;
    });
    const pending = expect(adapter.getResumeFile(resume.storageKey)).rejects.toThrow("Signed-in account changed");
    await entered.promise;
    await invalidate();
    file.resolve(new Blob(["A private bytes"]));
    await pending;
  });

  it("rejects a late cloud file without writing it into a cache", async () => {
    const { api, cache, adapter, invalidate } = setup();
    await adapter.initialize();
    const entered = deferred<void>();
    const file = deferred<Blob>();
    vi.spyOn(api, "getResumeFile").mockImplementation(() => {
      entered.resolve();
      return file.promise;
    });
    const cacheWrite = vi.spyOn(cache, "saveResumeFile");
    const pending = expect(adapter.getResumeFile(resume.storageKey)).rejects.toThrow("Signed-in account changed");
    await entered.promise;
    await invalidate();
    file.resolve(new Blob(["A cloud bytes"]));
    await pending;
    expect(cacheWrite).not.toHaveBeenCalled();
  });

  it("rejects a successful late state write without refreshing or resurrecting state", async () => {
    const { api, cache, adapter, invalidate } = setup();
    await adapter.initialize();
    const entered = deferred<void>();
    const saved = deferred<CloudStateEnvelope>();
    const oldState = api.state!;
    vi.spyOn(api, "saveState").mockImplementation(() => {
      entered.resolve();
      return saved.promise;
    });
    const refresh = vi.spyOn(cache, "importSnapshot");
    const pending = expect(adapter.commitMutation({ applications: [application] }))
      .rejects.toThrow("Signed-in account changed");
    await entered.promise;
    await invalidate();
    saved.resolve({ ...oldState, revision: 2 });
    await pending;
    expect(refresh).not.toHaveBeenCalled();
    await expect(adapter.exportSnapshot()).rejects.toThrow("Signed-in account changed");
  });

  it("rejects a late cached file write instead of reporting success", async () => {
    const { cache, adapter, invalidate } = setup();
    await adapter.initialize();
    const entered = deferred<void>();
    const written = deferred<void>();
    vi.spyOn(cache, "saveResumeFile").mockImplementation(() => {
      entered.resolve();
      return written.promise;
    });
    const pending = expect(adapter.saveResumeFile(resume.storageKey, new Blob(["A"])))
      .rejects.toThrow("Signed-in account changed");
    await entered.promise;
    await invalidate();
    written.resolve();
    await pending;
  });

  it("does not retry a late revision conflict after invalidation", async () => {
    const { api, adapter, invalidate, changed } = setup();
    await adapter.initialize();
    const entered = deferred<void>();
    let reject!: (error: Error) => void;
    const response = new Promise<CloudStateEnvelope>((_, fail) => { reject = fail; });
    const save = vi.spyOn(api, "saveState").mockImplementation(() => {
      entered.resolve();
      return response;
    });
    const pending = expect(adapter.commitMutation({ applications: [application] }))
      .rejects.toThrow("Signed-in account changed");
    await entered.promise;
    await invalidate();
    reject(new CloudRevisionConflictError(api.state));
    await pending;
    expect(save).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(adapter.getAccount()).toBeNull();
  });

  it("prioritizes account invalidation over a late size rejection without caching or replay", async () => {
    const { api, cache, adapter, invalidate } = setup();
    await adapter.initialize();
    const entered = deferred<void>();
    let reject!: (error: Error) => void;
    const response = new Promise<CloudStateEnvelope>((_, fail) => { reject = fail; });
    const save = vi.spyOn(api, "saveState").mockImplementation(() => {
      entered.resolve();
      return response;
    });
    const cacheWrite = vi.spyOn(cache, "importSnapshot");
    const pending = expect(adapter.updateApplication({ ...application, notes: "edit" })).rejects.toThrow("Signed-in account changed");
    await entered.promise;
    await invalidate();
    reject(new CloudApiError(CLOUD_SNAPSHOT_SIZE_MESSAGE, 413));
    await pending;
    expect(save).toHaveBeenCalledTimes(1);
    expect(cacheWrite).not.toHaveBeenCalled();
    expect(() => adapter.getCurrentSnapshot()).toThrow("Signed-in account changed");
  });
});

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
    const adapter = createCloudStorageAdapter({
      api,
      cache: createCache("cloud-migration-account"),
      legacyCache: cache,
      confirmLegacyMigration: () => true,
    });

    await expect(adapter.initialize()).resolves.toMatchObject({
      applications: [{ id: application.id }],
      resumes: [{ id: resume.id }],
    });
    expect(adapter.getAccount()).toEqual({ id: "student-id", email: "student@example.edu" });
    expect(api.state).toMatchObject({ revision: 1 });
    await expect(api.files.get(resume.storageKey)?.text()).resolves.toBe("%PDF-");
    await expect(cache.exportSnapshot()).resolves.toMatchObject({
      applications: [{ id: application.id }],
    });
    await expect(cache.getResumeFile(resume.storageKey)).resolves.toBeDefined();
  });

  it("does not transfer unowned local data when migration is declined", async () => {
    const legacyCache = createCache("cloud-unowned-declined");
    await legacyCache.initialize();
    await legacyCache.importSnapshot(createSnapshot([application], [resume]), [
      { file: new Blob(["private"]), storageKey: resume.storageKey },
    ]);
    const api = new FakeCloudApi();
    let prompts = 0;
    const adapter = createCloudStorageAdapter({
      api,
      cache: createCache("cloud-declined-account"),
      legacyCache,
      confirmLegacyMigration: () => { prompts += 1; return false; },
    });

    await expect(adapter.initialize()).resolves.toMatchObject({
      applications: [], resumes: [],
    });
    expect(prompts).toBe(1);
    expect(api.files.size).toBe(0);
    expect(api.state?.snapshot.applications).toEqual([]);
    await expect(legacyCache.getResumeFile(resume.storageKey)).resolves.toBeDefined();
  });

  it("keeps legacy data for a retry when migration upload fails", async () => {
    const legacyCache = createCache("cloud-unowned-retry");
    await legacyCache.initialize();
    await legacyCache.importSnapshot(createSnapshot([application], [resume]), [
      { file: new Blob(["private"]), storageKey: resume.storageKey },
    ]);
    const api = new FakeCloudApi();
    let failUpload = true;
    const originalPut = api.putResumeFile.bind(api);
    api.putResumeFile = async (key, file) => {
      if (failUpload) {
        failUpload = false;
        throw new Error("Upload interrupted");
      }
      return originalPut(key, file);
    };
    let prompts = 0;
    const adapter = createCloudStorageAdapter({
      api,
      cache: createCache("cloud-unowned-retry-account"),
      legacyCache,
      confirmLegacyMigration: () => { prompts += 1; return true; },
    });

    await expect(adapter.initialize()).rejects.toThrow("Upload interrupted");
    expect(api.state).toBeNull();
    await expect(legacyCache.getResumeFile(resume.storageKey)).resolves.toBeDefined();
    await expect(adapter.initialize()).resolves.toMatchObject({
      applications: [{ id: application.id }],
      resumes: [{ id: resume.id }],
    });
    expect(prompts).toBe(2);
  });

  it("keeps account caches separate and blocks stale-tab reads after a switch", async () => {
    const api = new FakeCloudApi();
    api.state = {
      revision: 1,
      snapshot: createSnapshot([application], [resume]),
      updatedAt: application.updatedAt,
    };
    const indexedDb = new IDBFactory();
    const caches = new Map<string, ReturnType<typeof createCache>>();
    const cacheForAccount = (id: string) => {
      let cache = caches.get(id);
      if (!cache) {
        cache = createIndexedDbStorageAdapter({
          databaseName: `cloud-owner-${id}`,
          indexedDb,
        });
        caches.set(id, cache);
      }
      return cache;
    };
    const originalFile = new Blob(["account A only"]);
    await cacheForAccount("student-id").initialize();
    await cacheForAccount("student-id").importSnapshot(
      createSnapshot([application], [resume]),
      [{ file: originalFile, storageKey: resume.storageKey }],
    );
    let accountChanged = 0;
    const adapter = createCloudStorageAdapter({
      api,
      cacheForAccount,
      onAccountChanged: () => { accountChanged += 1; },
    });
    await adapter.initialize();
    await expect(caches.get("student-id")?.listApplications()).resolves.toHaveLength(1);
    await expect(adapter.getResumeFile(resume.storageKey)).resolves.toBeDefined();

    api.account = { id: "other-id", email: "other@example.edu" };
    api.state = null;
    await expect(adapter.listApplications()).rejects.toThrow("Signed-in account changed");
    await expect(adapter.getResumeFile(resume.storageKey)).rejects.toThrow("Signed-in account changed");
    await expect(adapter.commitMutation({ applications: [application] })).rejects.toThrow("Signed-in account changed");
    expect(accountChanged).toBe(1);
    expect(api.state).toBeNull();

    const other = createCloudStorageAdapter({
      api,
      cacheForAccount,
      legacyCache: createCache("cloud-owner-empty-legacy"),
    });
    await expect(other.initialize()).resolves.toMatchObject({ applications: [] });
    await expect(caches.get("student-id")?.listApplications()).resolves.toHaveLength(1);
    await expect(caches.get("other-id")?.listApplications()).resolves.toHaveLength(0);
    await expect(caches.get("other-id")?.listResumeFiles()).resolves.toEqual([]);
    await expect(caches.get("student-id")?.getResumeFile(resume.storageKey)).resolves.toBeDefined();

    api.account = { id: "student-id", email: "student@example.edu" };
    api.state = {
      revision: 1,
      snapshot: createSnapshot([application], [resume]),
      updatedAt: application.updatedAt,
    };
    const restored = createCloudStorageAdapter({ api, cacheForAccount });
    await expect(restored.initialize()).resolves.toMatchObject({
      applications: [{ id: application.id }],
      resumes: [{ id: resume.id }],
    });
    await expect(restored.getResumeFile(resume.storageKey)).resolves.toBeDefined();
  });

  it("does not use unowned data when the second account already has remote state", async () => {
    const legacyCache = createCache("cloud-existing-b-legacy");
    await legacyCache.initialize();
    await legacyCache.importSnapshot(createSnapshot([application]));
    const api = new FakeCloudApi();
    api.account = { id: "other-id", email: "other@example.edu" };
    api.state = {
      revision: 2,
      snapshot: createSnapshot([{ ...application, id: "other-app" }]),
      updatedAt: application.updatedAt,
    };
    const adapter = createCloudStorageAdapter({
      api,
      cache: createCache("cloud-existing-b-account"),
      legacyCache,
      confirmLegacyMigration: () => { throw new Error("must not prompt"); },
    });

    await expect(adapter.initialize()).resolves.toMatchObject({
      applications: [{ id: "other-app" }],
    });
    expect(api.state.snapshot.applications).toHaveLength(1);
    await expect(legacyCache.listApplications()).resolves.toMatchObject([
      { id: application.id },
    ]);
  });

  it("locks a stale tab when the server rejects a raced account change", async () => {
    const api = new FakeCloudApi();
    api.state = {
      revision: 1,
      snapshot: createSnapshot(),
      updatedAt: application.updatedAt,
    };
    let changed = 0;
    const adapter = createCloudStorageAdapter({
      api,
      cache: createCache("cloud-raced-account"),
      onAccountChanged: () => { changed += 1; },
    });
    await adapter.initialize();
    api.saveState = async () => {
      throw new CloudApiError("Signed-in account changed.", 412);
    };
    await expect(adapter.commitMutation({ applications: [application], creates: { applications: [application.id] } }))
      .rejects.toThrow("Signed-in account changed");
    expect(changed).toBe(1);
    await expect(adapter.listApplications()).rejects.toThrow("Signed-in account changed");
    expect(() => adapter.getCurrentSnapshot()).toThrow("Signed-in account changed");
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

    await adapter.commitMutation({ applications: [application], creates: { applications: [application.id] } });

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
      creates: { assessments: ["two"] },
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
