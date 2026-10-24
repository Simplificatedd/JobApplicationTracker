import { describe, expect, it, vi } from "vitest";
import { snapshot } from "../test/assessmentFixtures";
import { createTestStorageAdapter } from "../test/indexedDb";
import { RevisionApi } from "../test/revisionApi";
import { createCloudStorageAdapter } from "./cloudStorageAdapter";
import { CloudApiError, type CloudStateEnvelope } from "./cloudApi";
import { DEFAULT_APPLICATION_FILTERS, DEFAULT_SORT_STATE } from "../features/applications/applicationFilters";
import type { TablePreferences } from "../types/tablePreferences";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

describe("initialization after partial startup failure", () => {
  it("does not allow a delayed startup retry to roll back a later acknowledged save", async () => {
    const api = new RevisionApi(snapshot());
    const cache = createTestStorageAdapter();
    const save = api.saveState.bind(api);
    vi.spyOn(api, "saveState").mockImplementationOnce(async (...args) => {
      await save(...args);
      throw new CloudApiError("Migration response lost", 0);
    });
    const adapter = createCloudStorageAdapter({ api, cache });
    await expect(adapter.initialize()).rejects.toThrow("Migration response lost");
    const oldRemote = structuredClone(api.state);
    const entered = deferred<void>();
    const releaseSave = deferred<void>();
    vi.spyOn(api, "saveState").mockImplementationOnce(async (...args) => {
      entered.resolve(); await releaseSave.promise; return save(...args);
    });
    const saving = adapter.saveSettings({ ...api.state.snapshot.settings, defaultFollowUpPromptDays: 42 });
    await entered.promise;
    const read = deferred<CloudStateEnvelope>();
    const readEntered = deferred<void>();
    vi.spyOn(api, "getState").mockImplementationOnce(() => {
      readEntered.resolve(); return read.promise;
    });
    const retry = adapter.initialize();
    // A completed startup returns immediately. An unfinished startup would
    // instead enter a new remote read while the save is already in flight.
    await Promise.race([readEntered.promise, retry]);
    releaseSave.resolve();
    await saving;
    read.resolve(oldRemote);
    await retry;
    expect(api.state.snapshot.settings.defaultFollowUpPromptDays).toBe(42);
    expect(adapter.getCurrentSnapshot().settings.defaultFollowUpPromptDays).toBe(42);
    expect((await cache.exportSnapshot()).settings.defaultFollowUpPromptDays).toBe(42);
  });
});

describe("unverified remote state during recovery", () => {
  it.each([
    ["missing revision", { revision: undefined }],
    ["string revision", { revision: "99" }],
    ["fractional revision", { revision: 99.5 }],
    ["missing timestamp", { updatedAt: undefined }],
    ["invalid notification state", { snapshot: snapshot({ notificationState: null as never }) }],
    ["invalid analytics settings", { snapshot: snapshot({ analyticsSettings: [] as never }) }],
  ])("rejects %s without changing acknowledged state or cache", async (_name, patch) => {
    const api = new RevisionApi(snapshot());
    const cache = createTestStorageAdapter();
    const adapter = createCloudStorageAdapter({ api, cache });
    await adapter.initialize();
    const before = adapter.getCurrentSnapshot();
    const write = vi.spyOn(cache, "importSnapshot");
    vi.spyOn(api, "getState").mockResolvedValueOnce({ ...api.state, ...patch } as unknown as CloudStateEnvelope);
    await expect(adapter.refresh()).rejects.toThrow();
    expect(adapter.getCurrentSnapshot()).toEqual(before);
    expect(write).not.toHaveBeenCalled();
    expect(adapter.getCacheWarning()).toBeNull();
  });
});

describe("explicit preference baselines across refresh", () => {
  it("retains same-field conflict detection against the caller's original settings", async () => {
    const api = new RevisionApi(snapshot());
    const adapter = createCloudStorageAdapter({ api, cache: createTestStorageAdapter() });
    await adapter.initialize();
    const before = await adapter.getSettings();
    api.state.revision++;
    api.state.snapshot = { ...api.state.snapshot, settings: { ...before, defaultFollowUpPromptDays: 60 } };
    await adapter.refresh();
    const save = vi.spyOn(api, "saveState");
    await expect(adapter.saveSettings({ ...before, defaultFollowUpPromptDays: 42 }, before)).rejects.toThrow(/changed in another session/);
    expect(save).not.toHaveBeenCalled();
    expect(adapter.getCurrentSnapshot().settings.defaultFollowUpPromptDays).toBe(60);
  });

  it("treats an explicitly empty table baseline as an observed absence", async () => {
    const api = new RevisionApi(snapshot());
    const adapter = createCloudStorageAdapter({ api, cache: createTestStorageAdapter() });
    await adapter.initialize();
    expect(await adapter.getTablePreferences()).toBeNull();
    const remote: TablePreferences = {
      columnWidths: {}, filters: DEFAULT_APPLICATION_FILTERS, needsAttentionOnly: false,
      searchQuery: "Remote search", sort: DEFAULT_SORT_STATE, visibleApplicationColumns: ["jobTitle"],
    };
    api.state.revision++;
    api.state.snapshot = { ...api.state.snapshot, tablePreferences: remote };
    await adapter.refresh();
    const save = vi.spyOn(api, "saveState");
    await expect(adapter.saveTablePreferences({ ...remote, searchQuery: "Local search" }, null)).rejects.toThrow(/changed in another session/);
    expect(save).not.toHaveBeenCalled();
    expect(adapter.getCurrentSnapshot().tablePreferences).toEqual(remote);
  });
});
