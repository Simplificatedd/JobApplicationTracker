import { describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { application, snapshot } from "../test/assessmentFixtures";
import { createTestStorageAdapter } from "../test/indexedDb";
import { RevisionApi } from "../test/revisionApi";
import { CloudApiError, createCloudApiClient } from "./cloudApi";
import { createCloudStorageAdapter } from "./cloudStorageAdapter";

const quotaError = () => new DOMException("Quota exceeded", "QuotaExceededError");

async function setup() {
  const api = new RevisionApi(snapshot());
  const cache = createTestStorageAdapter();
  const adapter = createCloudStorageAdapter({ api, cache });
  await adapter.initialize();
  const save = vi.spyOn(api, "saveState");
  return { api, cache, adapter, save };
}

describe("authoritative cloud snapshots with a degraded browser cache", () => {
  it("does not initialize or migrate cloud data when repair is requested before startup", async () => {
    const api = new RevisionApi(snapshot());
    const fetch = vi.spyOn(api, "getState");
    const save = vi.spyOn(api, "saveState");
    const adapter = createCloudStorageAdapter({ api, cache: createTestStorageAdapter() });
    await expect(adapter.repairCache()).rejects.toThrow("has not been initialized");
    expect(fetch).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("reopens a temporarily unavailable cache and repairs the latest confirmed state", async () => {
    const api = new RevisionApi(snapshot());
    const indexedDb = new IDBFactory();
    const openDatabase = indexedDb.open.bind(indexedDb);
    let available = false;
    const open = vi.spyOn(indexedDb, "open").mockImplementation((...args) => {
      if (!available) throw new Error("Storage disabled");
      return openDatabase(...args);
    });
    const cache = createTestStorageAdapter({ indexedDb });
    const adapter = createCloudStorageAdapter({ api, cache });
    await adapter.initialize();
    expect(adapter.getCacheWarning()).not.toBeNull();
    const save = vi.spyOn(api, "saveState");
    await adapter.updateApplication({ ...application, notes: "Confirmed while cache unavailable" });
    expect(adapter.getCacheWarning()).not.toBeNull();
    available = true;
    await adapter.repairCache();
    expect(open).toHaveBeenCalledTimes(3);
    expect(save).toHaveBeenCalledTimes(1);
    expect(adapter.getCacheWarning()).toBeNull();
    expect((await cache.exportSnapshot()).applications[0].notes).toBe("Confirmed while cache unavailable");
  });

  it("waits for startup cache work before repairing or saving a newer snapshot", async () => {
    const api = new RevisionApi(snapshot());
    await createCloudStorageAdapter({ api, cache: createTestStorageAdapter() }).initialize();
    const cache = createTestStorageAdapter();
    vi.spyOn(cache, "listResumeFiles").mockResolvedValue([]);
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    let cached = api.state.snapshot;
    let imports = 0;
    vi.spyOn(cache, "importSnapshot").mockImplementation(async (data) => {
      if (++imports === 1) { entered(); await held; }
      cached = structuredClone(data);
    });
    const adapter = createCloudStorageAdapter({ api, cache });
    const startup = adapter.initialize();
    await started;
    const repair = adapter.repairCache();
    const update = adapter.updateApplication({ ...application, notes: "After startup" });
    for (let i = 0; i < 50; i++) await Promise.resolve();
    release();
    await Promise.all([startup, repair, update]);
    expect(cached).toEqual(api.state.snapshot);
    expect(cached.applications[0].notes).toBe("After startup");
  });

  it.each(["read", "write", "open"])("loads remote data despite a cache %s failure", async (failure) => {
    const api = new RevisionApi(snapshot());
    const cache = createTestStorageAdapter();
    const fetch = vi.spyOn(api, "getState");
    if (failure === "read") vi.spyOn(cache, "listResumeFiles").mockRejectedValue(new Error("Read failed"));
    if (failure === "write") vi.spyOn(cache, "importSnapshot").mockRejectedValue(quotaError());
    const adapter = createCloudStorageAdapter({
      api, cache: failure === "open" ? undefined : cache,
      cacheForAccount: () => { throw new Error("IndexedDB unavailable"); },
    });
    const result = await adapter.initialize();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual(api.state.snapshot);
    expect(adapter.getCurrentSnapshot()).toEqual(api.state.snapshot);
    expect(adapter.getCacheWarning()).toContain("Browser cache is unavailable");
  });

  it("acknowledges a save and refreshes a working cache", async () => {
    const { adapter, api, cache, save } = await setup();
    await adapter.updateApplication({ ...application, notes: "Saved" });
    expect(save).toHaveBeenCalledTimes(1);
    expect(adapter.getCacheWarning()).toBeNull();
    expect((await cache.exportSnapshot()).applications).toMatchObject(api.state.snapshot.applications);
  });

  it("acknowledges creates, updates and deletes without replaying them during cache repair", async () => {
    const { adapter, api, cache, save } = await setup();
    const refresh = vi.spyOn(cache, "importSnapshot").mockRejectedValue(quotaError());
    const status = vi.fn();
    const unsubscribe = adapter.subscribeCacheWarning(status);
    const created = { ...application, id: "new-application" };
    await adapter.createApplication(created);
    await adapter.updateApplication({ ...created, notes: "Confirmed" });
    await adapter.deleteApplication(created.id);
    expect(save).toHaveBeenCalledTimes(3);
    expect(adapter.getCurrentSnapshot()).toEqual(api.state.snapshot);
    expect(api.state.snapshot.applications.map((item) => item.id)).toEqual([application.id]);
    expect(adapter.getCacheWarning()).toContain("confirmed saves do not need to be repeated");
    await adapter.repairCache();
    expect(adapter.getCacheWarning()).not.toBeNull();
    refresh.mockRestore();
    await adapter.repairCache();
    expect(save).toHaveBeenCalledTimes(3);
    expect(adapter.getCacheWarning()).toBeNull();
    expect((await cache.exportSnapshot()).applications).toMatchObject(api.state.snapshot.applications);
    expect(status.mock.calls.map(([warning]) => warning)).toEqual([expect.any(String), null]);
    unsubscribe();
  });

  it("preserves genuine cloud errors without writing the proposed snapshot to cache", async () => {
    const { adapter, api, cache, save } = await setup();
    const before = adapter.getCurrentSnapshot();
    const refresh = vi.spyOn(cache, "importSnapshot");
    save.mockRejectedValue(new CloudApiError("Cloud quota exceeded", 413));
    await expect(adapter.updateApplication({ ...application, notes: "Unsaved" })).rejects.toThrow("Cloud quota exceeded");
    expect(refresh).not.toHaveBeenCalled();
    expect(api.state.snapshot).toEqual(before);
    expect(adapter.getCurrentSnapshot()).toEqual(before);
    expect(adapter.getCacheWarning()).toBeNull();
  });

  it("keeps lost cloud responses uncertain and does not replay a committed request", async () => {
    const server = new RevisionApi(snapshot());
    const normalized = createCloudStorageAdapter({ api: server, cache: createTestStorageAdapter() });
    await normalized.initialize();
    let puts = 0;
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (path.endsWith("/session")) return Response.json(await server.getSession());
      if (init?.method === "PUT") {
        puts++;
        const body = JSON.parse(String(init.body));
        await server.saveState(body.snapshot, body.baseRevision);
        throw new TypeError("Connection lost after commit");
      }
      return Response.json(server.state);
    });
    const cache = createTestStorageAdapter();
    const adapter = createCloudStorageAdapter({ api: createCloudApiClient({ fetcher, retryDelays: [0] }), cache });
    await adapter.initialize();
    const before = adapter.getCurrentSnapshot();
    const refresh = vi.spyOn(cache, "importSnapshot");
    await expect(adapter.updateApplication({ ...application, notes: "Response lost" })).rejects.toThrow("outcome could not be confirmed");
    expect(puts).toBe(1);
    expect(server.state.snapshot.applications[0].notes).toBe("Response lost");
    expect(adapter.getCurrentSnapshot()).toEqual(before);
    expect(refresh).not.toHaveBeenCalled();
    expect(adapter.getCacheWarning()).toBeNull();
  });

  it("retains changed-field rebasing across sessions after a conflict and cache failure", async () => {
    const { adapter: a, api } = await setup();
    const cache = createTestStorageAdapter();
    const b = createCloudStorageAdapter({ api, cache });
    await b.initialize();
    await a.updateApplication({ ...application, company: "Concurrent company" });
    vi.spyOn(cache, "importSnapshot").mockRejectedValue(quotaError());
    const before = api.state.revision;
    await b.updateApplication({ ...application, notes: "My notes" });
    expect(api.conflicts).toBe(1);
    expect(api.state.revision).toBe(before + 1);
    expect(b.getCurrentSnapshot().applications[0]).toMatchObject({ company: "Concurrent company", notes: "My notes" });
    expect(b.getCacheWarning()).not.toBeNull();
    await expect(b.commitMutation({ applications: [{ ...application, company: "Stale company" }], expected: { applications: [application] } })).rejects.toThrow(/changed.*another session/);
    const latest = createCloudStorageAdapter({ api, cache: createTestStorageAdapter() });
    await latest.initialize();
    await latest.deleteApplication(application.id);
    await expect(b.updateApplication({ ...application, notes: "Stale edit" })).rejects.toThrow(/removed|deleted/);
    expect(api.state.snapshot.applications).toEqual([]);
  });

  it("serializes repair with queued writes and repairs the latest acknowledged snapshot", async () => {
    const { adapter, cache, api, save } = await setup();
    const refresh = vi.spyOn(cache, "importSnapshot").mockRejectedValueOnce(quotaError());
    await adapter.updateApplication({ ...application, notes: "First" });
    refresh.mockRestore();
    const base = adapter.getCurrentSnapshot().applications[0];
    await Promise.all([
      adapter.updateApplication({ ...base, notes: "Second" }),
      adapter.repairCache(),
      adapter.updateApplication({ ...base, company: "Third" }),
    ]);
    expect(save).toHaveBeenCalledTimes(3);
    expect((await cache.exportSnapshot()).applications).toMatchObject(api.state.snapshot.applications);
    expect(adapter.getCurrentSnapshot().applications[0]).toMatchObject({ notes: "Second", company: "Third" });
  });

  it("keeps settings and backup restore commits successful when cache persistence fails", async () => {
    const { adapter, cache, api, save } = await setup();
    vi.spyOn(cache, "importSnapshot").mockRejectedValue(quotaError());
    await adapter.saveSettings({ ...api.state.snapshot.settings, defaultFollowUpPromptDays: 42 });
    await adapter.saveNotificationState({ ...api.state.snapshot.notificationState, lastOpenedAt: application.createdAt });
    await adapter.saveAnalyticsSettings({ ...api.state.snapshot.analyticsSettings, includeArchived: false });
    const restored = { ...adapter.getCurrentSnapshot(), applications: [] };
    await adapter.importSnapshot(restored);
    expect(save).toHaveBeenCalledTimes(4);
    expect(adapter.getCurrentSnapshot()).toEqual(api.state.snapshot);
    expect(api.state.snapshot.settings.defaultFollowUpPromptDays).toBe(42);
    expect(api.state.snapshot.applications).toEqual([]);
  });
});
