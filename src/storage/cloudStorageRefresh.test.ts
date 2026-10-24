import { describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { application, interview, snapshot, timestamp } from "../test/assessmentFixtures";
import { createTestStorageAdapter } from "../test/indexedDb";
import { RevisionApi } from "../test/revisionApi";
import { createCloudStorageAdapter } from "./cloudStorageAdapter";
import { CloudApiError, type CloudStateEnvelope, type CloudApiClient } from "./cloudApi";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

async function setup() {
  const api = new RevisionApi(snapshot());
  const cache = createTestStorageAdapter();
  const adapter = createCloudStorageAdapter({ api, cache });
  await adapter.initialize();
  return { api, cache, adapter };
}

describe("current state after memoized startup", () => {
  it("returns later acknowledged saves without replaying startup", async () => {
    const { api, adapter } = await setup();
    const fetch = vi.spyOn(api, "getState");
    await adapter.saveSettings({ ...api.state.snapshot.settings, defaultFollowUpPromptDays: 42 });
    await adapter.saveSettings({ ...api.state.snapshot.settings, defaultFollowUpPromptDays: 43 });
    const result = await adapter.initialize();
    expect(result.settings.defaultFollowUpPromptDays).toBe(43);
    expect(result).toEqual(await adapter.exportSnapshot());
    expect(fetch).not.toHaveBeenCalled();
    result.applications.length = 0;
    expect(adapter.getCurrentSnapshot().applications).toHaveLength(1);
  });

  it("does not return a startup snapshot after a save during the final session check", async () => {
    const { api, adapter } = await setup();
    const entered = deferred<void>();
    const held = deferred<void>();
    const session = api.getSession.bind(api);
    vi.spyOn(api, "getSession").mockImplementationOnce(async () => {
      entered.resolve(); await held.promise; return session();
    });
    const pending = adapter.initialize();
    await entered.promise;
    await adapter.saveSettings({ ...api.state.snapshot.settings, defaultFollowUpPromptDays: 57 });
    held.resolve();
    expect((await pending).settings.defaultFollowUpPromptDays).toBe(57);
  });
});

describe("explicit remote refresh", () => {
  it.each([401, 403, "account switch"] as const)("invalidates a pending refresh after %s without publishing or caching its result", async (failure) => {
    const { api, cache } = await setup();
    const changed = vi.fn();
    const adapter = createCloudStorageAdapter({ api, cache, onAccountChanged: changed });
    await adapter.initialize();
    const entered = deferred<void>();
    const held = deferred<CloudStateEnvelope>();
    vi.spyOn(api, "getState").mockImplementationOnce(() => { entered.resolve(); return held.promise; });
    const write = vi.spyOn(cache, "importSnapshot");
    const pending = adapter.refresh().catch((error: unknown) => error);
    await entered.promise;
    if (failure === "account switch") vi.spyOn(api, "getSession").mockResolvedValue({ id: "other", email: "other@example.edu" });
    else vi.spyOn(api, "getSession").mockRejectedValue(new CloudApiError("Logged out", failure));
    await expect(adapter.listApplications()).rejects.toThrow("Reload the tracker");
    held.resolve(api.state);
    expect(await pending).toBeInstanceOf(Error);
    await expect(adapter.refresh()).rejects.toThrow("Reload the tracker");
    expect(write).not.toHaveBeenCalled();
    expect(changed).toHaveBeenCalledTimes(1);
    expect(adapter.getAccount()).toBeNull();
  });

  it("allows retry after an authorization failure before any account was established", async () => {
    const api = new RevisionApi(snapshot());
    vi.spyOn(api, "getSession").mockRejectedValueOnce(new CloudApiError("Sign in required", 401));
    const changed = vi.fn();
    const adapter = createCloudStorageAdapter({ api, cache: createTestStorageAdapter(), onAccountChanged: changed });
    await expect(adapter.initialize()).rejects.toThrow("Sign in required");
    await expect(adapter.refresh()).resolves.toMatchObject({ applications: [{ id: application.id }] });
    expect(changed).not.toHaveBeenCalled();
  });

  it("fetches remote edits and deletions after several saves and cache repair", async () => {
    const { api, cache, adapter } = await setup();
    const unavailable = vi.spyOn(cache, "importSnapshot").mockRejectedValue(new Error("Cache full"));
    await adapter.saveSettings({ ...api.state.snapshot.settings, defaultFollowUpPromptDays: 42 });
    await adapter.saveSettings({ ...api.state.snapshot.settings, defaultFollowUpPromptDays: 43 });
    unavailable.mockRestore();
    await adapter.repairCache();
    const other = createCloudStorageAdapter({ api, cache: createTestStorageAdapter() });
    await other.initialize();
    await other.deleteApplication(application.id);
    const save = vi.spyOn(api, "saveState");
    const result = await adapter.refresh();
    expect(result.applications).toEqual([]);
    expect(result.settings.defaultFollowUpPromptDays).toBe(43);
    expect(result).toEqual(api.state.snapshot);
    expect(await cache.exportSnapshot()).toMatchObject(result);
    expect(save).not.toHaveBeenCalled();
  });

  it("waits for a pending cloud save and serializes repair and overlapping refreshes", async () => {
    const { api, cache, adapter } = await setup();
    const entered = deferred<void>();
    const held = deferred<void>();
    const save = api.saveState.bind(api);
    vi.spyOn(api, "saveState").mockImplementationOnce(async (...args) => {
      entered.resolve(); await held.promise; return save(...args);
    });
    const pendingSave = adapter.saveSettings({ ...api.state.snapshot.settings, defaultFollowUpPromptDays: 75 });
    await entered.promise;
    const fetch = vi.spyOn(api, "getState");
    const first = adapter.refresh();
    const repair = adapter.repairCache();
    const second = adapter.refresh();
    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled();
    held.resolve();
    await pendingSave;
    const results = await Promise.all([first, repair, second]);
    expect(results[0]?.settings.defaultFollowUpPromptDays).toBe(75);
    expect(results[2]?.settings.defaultFollowUpPromptDays).toBe(75);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(await cache.exportSnapshot()).toMatchObject(api.state.snapshot);
  });

  it("orders a later save and repair behind a delayed refresh result", async () => {
    const { api, cache, adapter } = await setup();
    const entered = deferred<void>();
    const held = deferred<CloudStateEnvelope>();
    const old = structuredClone(api.state);
    vi.spyOn(api, "getState").mockImplementationOnce(() => { entered.resolve(); return held.promise; });
    const refreshing = adapter.refresh();
    await entered.promise;
    const saving = adapter.saveSettings({ ...api.state.snapshot.settings, defaultFollowUpPromptDays: 88 });
    const repairing = adapter.repairCache();
    held.resolve(old);
    await Promise.all([refreshing, saving, repairing]);
    expect(adapter.getCurrentSnapshot().settings.defaultFollowUpPromptDays).toBe(88);
    expect(await cache.exportSnapshot()).toMatchObject(api.state.snapshot);
  });

  it("waits for an in-progress repair before fetching cloud state", async () => {
    const { api, cache, adapter } = await setup();
    const entered = deferred<void>();
    const held = deferred<void>();
    const cacheImport = cache.importSnapshot.bind(cache);
    vi.spyOn(cache, "importSnapshot").mockImplementationOnce(async (...args) => {
      entered.resolve(); await held.promise; return cacheImport(...args);
    });
    const repair = adapter.repairCache();
    await entered.promise;
    const fetch = vi.spyOn(api, "getState");
    const refresh = adapter.refresh();
    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled();
    held.resolve();
    await Promise.all([repair, refresh]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retains a cache warning when a successful refresh cannot cache its result", async () => {
    const { api, cache, adapter } = await setup();
    vi.spyOn(cache, "importSnapshot").mockRejectedValue(new Error("IndexedDB unavailable"));
    api.state.revision++;
    api.state.snapshot.settings.defaultFollowUpPromptDays = 91;
    expect((await adapter.refresh()).settings.defaultFollowUpPromptDays).toBe(91);
    expect(adapter.getCacheWarning()).not.toBeNull();
  });

  it("reopens temporarily unavailable IndexedDB using current remote data", async () => {
    const api = new RevisionApi(snapshot());
    const indexedDb = new IDBFactory();
    const open = indexedDb.open.bind(indexedDb);
    const blocked = vi.spyOn(indexedDb, "open").mockImplementation(() => { throw new Error("Temporarily disabled"); });
    const cache = createTestStorageAdapter({ indexedDb });
    const adapter = createCloudStorageAdapter({ api, cache });
    await adapter.initialize();
    expect(adapter.getCacheWarning()).not.toBeNull();
    await adapter.saveSettings({ ...api.state.snapshot.settings, defaultFollowUpPromptDays: 92 });
    blocked.mockImplementation(open);
    await adapter.refresh();
    expect(adapter.getCacheWarning()).toBeNull();
    expect((await cache.exportSnapshot()).settings.defaultFollowUpPromptDays).toBe(92);
  });

  it("retries failed startup reads and coalesces concurrent initialization", async () => {
    const api = new RevisionApi(snapshot());
    const fetch = vi.spyOn(api, "getState").mockRejectedValueOnce(new Error("Offline"));
    const adapter = createCloudStorageAdapter({ api, cache: createTestStorageAdapter() });
    await expect(adapter.initialize()).rejects.toThrow("Offline");
    api.state.revision++;
    api.state.snapshot.settings.defaultFollowUpPromptDays = 93;
    const results = await Promise.all([adapter.initialize(), adapter.initialize()]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(results.map((result) => result.settings.defaultFollowUpPromptDays)).toEqual([93, 93]);
    expect((await adapter.refresh()).settings.defaultFollowUpPromptDays).toBe(93);
  });

  it.each(["fetch failure", "missing workspace", "older revision", "newer format"])("preserves acknowledged state and cache on %s", async (failure) => {
    const { api, cache, adapter } = await setup();
    await adapter.saveSettings({ ...api.state.snapshot.settings, defaultFollowUpPromptDays: 94 });
    const before = adapter.getCurrentSnapshot();
    const write = vi.spyOn(cache, "importSnapshot");
    const save = vi.spyOn(api, "saveState");
    const fetch = vi.spyOn<CloudApiClient, "getState">(api, "getState");
    if (failure === "fetch failure") fetch.mockRejectedValueOnce(new Error("Offline"));
    if (failure === "missing workspace") fetch.mockResolvedValueOnce(null);
    if (failure === "older revision") fetch.mockResolvedValueOnce({ ...api.state, revision: 1, snapshot: snapshot() });
    if (failure === "newer format") fetch.mockResolvedValueOnce({ ...api.state, snapshot: { ...snapshot(), dataVersion: 999 } });
    await expect(adapter.refresh()).rejects.toThrow();
    expect(adapter.getCurrentSnapshot()).toEqual(before);
    expect(write).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(adapter.getCacheWarning()).toBeNull();
    expect(await cache.exportSnapshot()).toMatchObject(before);
    await expect(adapter.refresh()).resolves.toEqual(before);
  });

  it("reads an uncertain save outcome without repeating the cloud mutation", async () => {
    const { api, adapter } = await setup();
    const save = api.saveState.bind(api);
    const write = vi.spyOn(api, "saveState").mockImplementationOnce(async (...args) => {
      await save(...args);
      throw new CloudApiError("The save outcome could not be confirmed.", 0);
    });
    await expect(adapter.saveSettings({ ...api.state.snapshot.settings, defaultFollowUpPromptDays: 95 })).rejects.toThrow("outcome could not be confirmed");
    expect(adapter.getCurrentSnapshot().settings.defaultFollowUpPromptDays).not.toBe(95);
    expect((await adapter.refresh()).settings.defaultFollowUpPromptDays).toBe(95);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("hydrates and normalizes child and document collections without saving migrations", async () => {
    const { api, cache, adapter } = await setup();
    const save = vi.spyOn(api, "saveState");
    const document = { id: "doc", displayName: "Resume", originalFileName: "r.pdf", downloadFileName: "r.pdf", fileExtension: "pdf" as const, mimeType: "application/pdf", fileSize: 5, storageKey: "file", contentHash: "hash", uploadedAt: timestamp, updatedAt: timestamp };
    api.state.revision++;
    api.state.snapshot = snapshot({
      applications: [{ ...application, resumeId: document.id }],
      contacts: [{ id: "contact", applicationId: application.id, name: "Remote", createdAt: timestamp, updatedAt: timestamp }],
      interviews: [interview(1)], resumes: [document], coverLetters: [{ ...document, id: "letter" }],
      assessments: undefined,
    });
    const result = await adapter.refresh();
    expect(result.contacts).toEqual(api.state.snapshot.contacts);
    expect(result.interviews).toEqual(api.state.snapshot.interviews);
    expect(result.resumes).toEqual([document]);
    expect(result.coverLetters).toEqual(api.state.snapshot.coverLetters);
    expect(result.assessments).toEqual([]);
    expect(result.applications[0].resumeId).toBe(document.id);
    expect(await cache.exportSnapshot()).toMatchObject(result);
    expect(save).not.toHaveBeenCalled();
  });
});
