import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ANALYTICS_SETTINGS, DEFAULT_NOTIFICATION_STATE, DEFAULT_USER_SETTINGS } from "../lib/domain";
import { application, interview } from "../test/assessmentFixtures";
import { createTestStorageAdapter } from "../test/indexedDb";
import { RevisionApi } from "../test/revisionApi";
import { snapshot as createSnapshot } from "../test/assessmentFixtures";
import { StorageConflictError } from "../storage/mutationRebase";
import type { StorageSnapshot } from "../storage/StorageAdapter";
import { CloudApiError, type CloudStateEnvelope } from "../storage/cloudApi";
import { createBackupFile, parseBackupFile } from "../lib/backups";
import { populatedBackup, backupFile } from "../test/backupFixtures";
import { snapshotWithBytes } from "../test/snapshotSize";
import { MAX_CLOUD_SNAPSHOT_BYTES } from "../storage/snapshotSize";
import { CLOUD_SNAPSHOT_SIZE_MESSAGE } from "../storage/snapshotSize";
import { DEFAULT_APPLICATION_FILTERS, DEFAULT_SORT_STATE } from "../features/applications/applicationFilters";
import type { TablePreferences } from "../types/tablePreferences";

// A small hook host lets these tests control promise/event ordering without a
// browser or network. State, refs and memoized callbacks persist across renders;
// dependency changes run effect cleanup before the replacement effect.
const host = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[], effects: [] as (() => unknown)[], setters: new Map<number, (value: unknown) => void>() }));
vi.mock("react", () => ({
  useState(initial: unknown) {
    const slot = host.cursor++;
    if (!(slot in host.slots)) host.slots[slot] = typeof initial === "function" ? initial() : initial;
    if (!host.setters.has(slot)) host.setters.set(slot, (value: unknown) => {
      host.slots[slot] = typeof value === "function" ? value(host.slots[slot]) : value;
    });
    return [host.slots[slot], host.setters.get(slot)];
  },
  useRef(initial: unknown) {
    const slot = host.cursor++;
    if (!(slot in host.slots)) host.slots[slot] = { current: initial };
    return host.slots[slot];
  },
  useCallback(callback: unknown, deps: unknown[]) {
    const slot = host.cursor++;
    const previous = host.slots[slot] as { callback: unknown; deps: unknown[] } | undefined;
    if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) host.slots[slot] = { callback, deps };
    return (host.slots[slot] as { callback: unknown }).callback;
  },
  useEffect(effect: () => unknown, deps: unknown[]) {
    const slot = host.cursor++;
    const previous = host.slots[slot] as { deps: unknown[]; cleanup?: () => void } | undefined;
    if (previous && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) return;
    const state: { deps: unknown[]; cleanup?: () => void } = { deps };
    host.slots[slot] = state;
    host.effects.push(() => {
      previous?.cleanup?.();
      if (previous) previous.cleanup = undefined;
      const cleanup = effect();
      if (typeof cleanup === "function") state.cleanup = cleanup as () => void;
      return () => { state.cleanup?.(); state.cleanup = undefined; };
    });
  },
}));
const storage = vi.hoisted(() => ({
  initialize: vi.fn(), getAccount: vi.fn(), commitMutation: vi.fn(),
  getSettings: vi.fn(), saveSettings: vi.fn(),
  getNotificationState: vi.fn(), saveNotificationState: vi.fn(),
  getAnalyticsSettings: vi.fn(), saveAnalyticsSettings: vi.fn(),
  getTablePreferences: vi.fn(), saveTablePreferences: vi.fn(), exportSnapshot: vi.fn(), getCurrentSnapshot: vi.fn(),
  getApplication: vi.fn(), listInterviews: vi.fn(), listResumeMetadata: vi.fn(),
  listCoverLetterMetadata: vi.fn(), listContacts: vi.fn(), deleteApplication: vi.fn(),
  importSnapshot: vi.fn(), getResumeFile: vi.fn(),
  getDocumentCleanupWarning: vi.fn(), subscribeDocumentCleanupWarning: vi.fn(),
  getCacheWarning: vi.fn(), subscribeCacheWarning: vi.fn(), repairCache: vi.fn(), refresh: vi.fn(),
}));
vi.mock("../storage/cloudStorageAdapter", () => ({ cloudStorageAdapter: storage }));
import { useTrackerStore } from "./useTrackerStore";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}
const snapshot: StorageSnapshot = {
  activities: [], applications: [], contacts: [], coverLetters: [], interviews: [], resumes: [],
  analyticsSettings: DEFAULT_ANALYTICS_SETTINGS, notificationState: DEFAULT_NOTIFICATION_STATE,
  settings: { ...DEFAULT_USER_SETTINGS, defaultFollowUpPromptDays: 99 }, tablePreferences: null,
};
const cleanups: (() => void)[] = [];
function RenderStore() {
  host.cursor = 0;
  const store = useTrackerStore();
  for (const effect of host.effects.splice(0)) {
    const cleanup = effect();
    if (typeof cleanup === "function") cleanups.push(cleanup as () => void);
  }
  return store;
}
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
function invalidate() { window.dispatchEvent(new Event("tracker-account-changed")); }

beforeEach(() => {
  host.slots = []; host.effects = []; host.cursor = 0; host.setters.clear();
  vi.stubGlobal("window", new EventTarget());
  vi.clearAllMocks();
  storage.initialize.mockResolvedValue(snapshot);
  storage.refresh.mockResolvedValue(snapshot);
  storage.getAccount.mockReturnValue({ id: "A", email: "a@example.edu" });
  storage.commitMutation.mockResolvedValue(undefined);
  storage.getSettings.mockResolvedValue(snapshot.settings);
  storage.saveSettings.mockResolvedValue(undefined);
  storage.getNotificationState.mockResolvedValue(snapshot.notificationState);
  storage.saveNotificationState.mockResolvedValue(undefined);
  storage.getAnalyticsSettings.mockResolvedValue(snapshot.analyticsSettings);
  storage.saveAnalyticsSettings.mockResolvedValue(undefined);
  storage.getTablePreferences.mockResolvedValue(snapshot.tablePreferences);
  storage.saveTablePreferences.mockResolvedValue(undefined);
  storage.exportSnapshot.mockResolvedValue(snapshot);
  storage.getCurrentSnapshot.mockReturnValue(snapshot);
  storage.getApplication.mockResolvedValue(application);
  storage.listInterviews.mockResolvedValue([]);
  storage.listResumeMetadata.mockResolvedValue([]);
  storage.listCoverLetterMetadata.mockResolvedValue([]);
  storage.listContacts.mockResolvedValue([]);
  storage.deleteApplication.mockResolvedValue(undefined);
  storage.getDocumentCleanupWarning.mockReturnValue(null);
  storage.subscribeDocumentCleanupWarning.mockReturnValue(() => {});
  storage.getCacheWarning.mockReturnValue(null);
  storage.subscribeCacheWarning.mockReturnValue(() => {});
  storage.repairCache.mockResolvedValue(undefined);
  storage.importSnapshot.mockResolvedValue(undefined);
  storage.getResumeFile.mockResolvedValue(undefined);
});
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); vi.unstubAllGlobals(); });

describe("store account invalidation", () => {
  it("retries an initial storage failure through remote refresh", async () => {
    storage.initialize.mockRejectedValueOnce(new Error("Initial storage failure"));
    RenderStore(); await flush();
    expect(RenderStore().storageError).toBe("Initial storage failure");
    RenderStore().retryStorage();
    RenderStore(); await flush();
    expect(storage.refresh).toHaveBeenCalledTimes(1);
    expect(RenderStore().settings.defaultFollowUpPromptDays).toBe(99);
    expect(RenderStore().storageError).toBeNull();
    expect(RenderStore().isStorageLoading).toBe(false);
  });

  it("ignores an older retry completion after a later retry hydrates current state", async () => {
    RenderStore(); await flush();
    const old = deferred<StorageSnapshot>();
    const latest = { ...snapshot, settings: { ...snapshot.settings, defaultFollowUpPromptDays: 71 } };
    storage.refresh.mockReturnValueOnce(old.promise).mockResolvedValueOnce(latest);
    RenderStore().retryStorage(); RenderStore(); await flush();
    storage.getCurrentSnapshot.mockReturnValue(latest);
    RenderStore().retryStorage(); RenderStore(); await flush();
    old.resolve(snapshot); await flush();
    // Finishing the predecessor must not publish any snapshot at all.
    expect(RenderStore().settings.defaultFollowUpPromptDays).toBe(71);
    expect(storage.getCurrentSnapshot).toHaveBeenCalledTimes(2);
  });

  it("publishes the current acknowledgement if a save follows the refresh response", async () => {
    RenderStore(); await flush();
    const latest = { ...snapshot, settings: { ...snapshot.settings, defaultFollowUpPromptDays: 72 } };
    storage.refresh.mockImplementationOnce(async () => {
      storage.getCurrentSnapshot.mockReturnValue(latest);
      return snapshot;
    });
    RenderStore().retryStorage(); RenderStore(); await flush();
    expect(RenderStore().settings.defaultFollowUpPromptDays).toBe(72);
  });

  it("keeps loaded editors mounted and ignores pending retry results after logout", async () => {
    RenderStore(); await flush();
    const held = deferred<StorageSnapshot>();
    storage.refresh.mockReturnValueOnce(held.promise);
    RenderStore().retryStorage(); RenderStore(); await flush();
    expect(RenderStore().isStorageLoading).toBe(false);
    invalidate(); held.resolve(snapshot); await flush();
    expect(RenderStore().settings).toEqual(DEFAULT_USER_SETTINGS);
    expect(RenderStore().storageError).toContain("Signed-in account changed");
    RenderStore().retryStorage(); RenderStore(); await flush();
    expect(storage.refresh).toHaveBeenCalledTimes(1);
  });

  it("hydrates normally before invalidation", async () => {
    RenderStore(); await flush();
    expect(RenderStore().settings.defaultFollowUpPromptDays).toBe(99);
    expect(RenderStore().cloudAccountEmail).toBe("a@example.edu");
  });

  it("hydrates cloud data with a separate cache warning", async () => {
    storage.getCacheWarning.mockReturnValue("Browser cache is unavailable. Confirmed saves do not need to be repeated.");
    RenderStore(); await flush();
    expect(RenderStore().isStorageLoading).toBe(false);
    expect(RenderStore().settings.defaultFollowUpPromptDays).toBe(99);
    expect(RenderStore().cacheWarning).toContain("Browser cache is unavailable");
    expect(RenderStore().storageError).toBeNull();
  });

  it("cannot hydrate from an initialization continuation after the account event", async () => {
    const held = deferred<StorageSnapshot>();
    storage.initialize.mockReturnValue(held.promise);
    RenderStore(); invalidate(); held.resolve(snapshot); await flush();
    const store = RenderStore();
    expect(store.settings).toEqual(DEFAULT_USER_SETTINGS);
    expect(store.cloudAccountEmail).toBeNull();
    expect(store.storageError).toContain("Signed-in account changed");
  });

  it("cannot publish a late mutation or erase the account-change error", async () => {
    RenderStore(); await flush();
    const held = deferred<void>();
    storage.commitMutation.mockReturnValue(held.promise);
    const pending = RenderStore().appendActivity("app-A", "updated", "A private activity");
    invalidate(); held.resolve(); await pending;
    expect(RenderStore().activities).toEqual([]);
    expect(RenderStore().storageError).toContain("Signed-in account changed");
  });

  it("cannot publish a late settings write", async () => {
    RenderStore(); await flush();
    const held = deferred<void>();
    const entered = deferred<void>();
    storage.saveSettings.mockImplementation(() => { entered.resolve(); return held.promise; });
    const pending = RenderStore().updateSettings({ defaultFollowUpPromptDays: 42 });
    await entered.promise;
    invalidate(); held.resolve();
    expect(await pending).toBe(false);
    expect(RenderStore().settings).toEqual(DEFAULT_USER_SETTINGS);
    expect(RenderStore().storageError).toContain("Signed-in account changed");
  });

  it("blocks publication when invalidation falls between persistence and its caller", async () => {
    RenderStore(); await flush();
    const pending = RenderStore().appendActivity("app-A", "updated", "A private activity");
    // commitMutation's already-resolved await resumes first; the outer action
    // resumes after this event. A guard in commitMutation alone cannot cover it.
    queueMicrotask(invalidate);
    await pending;
    expect(RenderStore().activities).toEqual([]);
    expect(RenderStore().storageError).toContain("Signed-in account changed");
  });
});


describe("store reconciliation after mutations", () => {
  const initial = { ...snapshot, applications: [application] };
  async function mounted() {
    storage.initialize.mockResolvedValue(initial);
    storage.getCurrentSnapshot.mockReturnValue(initial);
    RenderStore(); await flush();
    return RenderStore();
  }

  it("publishes the committed application, children and derived fields instead of its proposed copy", async () => {
    const store = await mounted();
    const savedContact = { id: "contact", applicationId: application.id, name: "Added elsewhere", createdAt: application.createdAt, updatedAt: application.updatedAt };
    const saved = {
      ...initial, contacts: [savedContact],
      applications: [{ ...application, company: "Concurrent company", notes: "My notes", contactsCount: 1 }],
    };
    storage.getCurrentSnapshot.mockReturnValue(saved);
    const result = await store.updateApplication(application.id, { notes: "My notes" });
    expect(result.ok).toBe(true);
    expect(RenderStore().applications[0]).toMatchObject(saved.applications[0]);
    expect(RenderStore().contacts).toEqual([savedContact]);
    expect(RenderStore().storageError).toBeNull();
  });

  it("surfaces a conflict, synchronizes the backing UI, and does not claim the rejected edit was saved", async () => {
    const store = await mounted();
    const latest = { ...initial, applications: [{ ...application, company: "Server value" }] };
    storage.commitMutation.mockRejectedValueOnce(new StorageConflictError("applications.company changed in another session."));
    storage.getCurrentSnapshot.mockReturnValue(latest);
    const result = await store.updateApplication(application.id, { company: "Rejected value" });
    expect(result.ok).toBe(false);
    expect(RenderStore().applications[0].company).toBe("Server value");
    expect(RenderStore().storageError).toContain("No changes were saved");
    expect(storage.commitMutation).toHaveBeenCalledTimes(1);
  });

  it("passes the editor's original field baseline after another operation updated the same adapter", async () => {
    const store = await mounted();
    storage.getApplication.mockResolvedValue({ ...application, company: "New local value", notes: "Unrelated current notes" });
    await store.updateApplication(application.id, { company: "My draft" }, undefined, undefined, application);
    const mutation = storage.commitMutation.mock.calls[0][0];
    expect(mutation.expected.applications[0]).toMatchObject({ company: application.company, notes: "Unrelated current notes" });
    expect(mutation.applications[0]).toMatchObject({ company: "My draft", notes: "Unrelated current notes" });
  });

  it("uses the displayed field baseline for quick edits when the adapter has advanced", async () => {
    const store = await mounted();
    storage.getApplication.mockResolvedValue({ ...application, company: "Advanced adapter", notes: "Current notes" });
    await store.updateApplication(application.id, { company: "Quick edit" });
    const mutation = storage.commitMutation.mock.calls[0][0];
    expect(mutation.expected.applications[0]).toMatchObject({ company: application.company, notes: "Current notes" });
  });

  it("publishes other-session records after deletion instead of only filtering its old UI arrays", async () => {
    const store = await mounted();
    const other = { ...application, id: "other", company: "Created elsewhere" };
    storage.getCurrentSnapshot.mockReturnValue({ ...initial, applications: [other] });
    expect((await store.deleteApplication(application.id)).ok).toBe(true);
    expect(RenderStore().applications).toEqual([other]);
  });

  it("declares explicit creation and returns the committed new record", async () => {
    const store = await mounted();
    const other = { ...application, id: "other" };
    storage.commitMutation.mockImplementation(async (mutation) => {
      const proposed = mutation.applications[0];
      expect(mutation.creates.applications).toEqual([proposed.id]);
      storage.getCurrentSnapshot.mockReturnValue({ ...initial, applications: [other, { ...proposed, company: "Committed normalized company" }] });
    });
    const result = await store.createApplication({ ...application, company: "Proposed company" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.company).toBe("Committed normalized company");
    expect(RenderStore().applications.map((item) => item.company)).toContain("Committed normalized company");
  });
});


describe("store with two independent revision-aware cloud adapters", () => {
  async function sessions(data = createSnapshot()) {
    const { createCloudStorageAdapter } = await vi.importActual<typeof import("../storage/cloudStorageAdapter")>("../storage/cloudStorageAdapter");
    const api = new RevisionApi(data);
    const a = createCloudStorageAdapter({ api, cache: createTestStorageAdapter() });
    const cache = createTestStorageAdapter();
    const b = createCloudStorageAdapter({ api, cache });
    await a.initialize();
    storage.initialize.mockImplementation(b.initialize);
    storage.refresh.mockImplementation(b.refresh);
    storage.commitMutation.mockImplementation(b.commitMutation);
    storage.getCurrentSnapshot.mockImplementation(b.getCurrentSnapshot);
    storage.getApplication.mockImplementation(b.getApplication);
    storage.listInterviews.mockImplementation(b.listInterviews);
    storage.listResumeMetadata.mockImplementation(b.listResumeMetadata);
    storage.listCoverLetterMetadata.mockImplementation(b.listCoverLetterMetadata);
    storage.listContacts.mockImplementation(b.listContacts);
    storage.deleteApplication.mockImplementation(b.deleteApplication);
    storage.getSettings.mockImplementation(b.getSettings);
    storage.saveSettings.mockImplementation(b.saveSettings);
    storage.getNotificationState.mockImplementation(b.getNotificationState);
    storage.saveNotificationState.mockImplementation(b.saveNotificationState);
    storage.getAnalyticsSettings.mockImplementation(b.getAnalyticsSettings);
    storage.saveAnalyticsSettings.mockImplementation(b.saveAnalyticsSettings);
    storage.getTablePreferences.mockImplementation(b.getTablePreferences);
    storage.saveTablePreferences.mockImplementation(b.saveTablePreferences);
    storage.getCacheWarning.mockImplementation(b.getCacheWarning);
    storage.subscribeCacheWarning.mockImplementation(b.subscribeCacheWarning);
    storage.repairCache.mockImplementation(b.repairCache);
    storage.exportSnapshot.mockImplementation(b.exportSnapshot);
    storage.importSnapshot.mockImplementation(b.importSnapshot);
    storage.getResumeFile.mockImplementation(b.getResumeFile);
    RenderStore();
    await vi.waitFor(() => expect(RenderStore().isStorageLoading).toBe(false));
    return { api, a, b, cache, store: RenderStore() };
  }

  it("reports size failures without changing displayed data, and retains repair/Retry responsibilities", async () => {
    const { api, store } = await sessions();
    const before = structuredClone(RenderStore().applications);
    vi.spyOn(api, "saveState").mockRejectedValueOnce(new CloudApiError(CLOUD_SNAPSHOT_SIZE_MESSAGE, 413));
    const result = await store.updateApplication(application.id, { notes: "Rejected edit" });
    expect(result.ok).toBe(false);
    expect(RenderStore().applications).toEqual(before);
    expect(RenderStore().storageError).toBe(CLOUD_SNAPSHOT_SIZE_MESSAGE);
    expect(RenderStore().cacheWarning).toBeNull();
    await RenderStore().repairCache();
    expect(RenderStore().storageError).toBe(CLOUD_SNAPSHOT_SIZE_MESSAGE);
    RenderStore().retryStorage(); RenderStore();
    await vi.waitFor(() => expect(storage.refresh).toHaveResolvedTimes(1));
    expect(RenderStore().storageError).toBeNull();
    expect(RenderStore().applications).toEqual(before);
  });

  it.each(["settings", "analyticsSettings", "notificationState", "tablePreferences"] as const)("retains changed-field intent for %s edits started during remote refresh", async (kind) => {
    const preferences: TablePreferences = {
      columnWidths: {}, filters: DEFAULT_APPLICATION_FILTERS, needsAttentionOnly: false,
      searchQuery: "", sort: DEFAULT_SORT_STATE,
      visibleApplicationColumns: DEFAULT_USER_SETTINGS.visibleApplicationColumns,
    };
    const { api, a, b } = await sessions(createSnapshot({ tablePreferences: preferences }));
    const readEntered = deferred<void>();
    const releaseRead = deferred<void>();
    function heldRead<Value>(load: () => Promise<Value>) {
      return async () => {
        const old = await load();
        readEntered.resolve(); await releaseRead.promise; return old;
      };
    }
    let edit: () => Promise<boolean>;
    let expected: object;
    switch (kind) {
      case "settings":
        await a.saveSettings({ ...api.state.snapshot.settings, quickLocation: "Remote city" });
        storage.getSettings.mockImplementationOnce(heldRead(b.getSettings));
        edit = () => RenderStore().updateSettings({ defaultFollowUpPromptDays: 58 });
        expected = { quickLocation: "Remote city", defaultFollowUpPromptDays: 58 };
        break;
      case "analyticsSettings":
        await a.saveAnalyticsSettings({ ...api.state.snapshot.analyticsSettings, includeArchived: true });
        storage.getAnalyticsSettings.mockImplementationOnce(heldRead(b.getAnalyticsSettings));
        edit = () => RenderStore().updateAnalyticsSettings({ enabled: true });
        expected = { includeArchived: true, enabled: true };
        break;
      case "notificationState":
        await a.saveNotificationState({ ...api.state.snapshot.notificationState, lastOpenedAt: application.createdAt });
        storage.getNotificationState.mockImplementationOnce(heldRead(b.getNotificationState));
        edit = () => RenderStore().dismissNotification("local-notification");
        expected = { lastOpenedAt: application.createdAt, dismissedNotificationIds: ["local-notification"] };
        break;
      case "tablePreferences":
        await a.saveTablePreferences({ ...preferences, searchQuery: "Remote search" });
        storage.getTablePreferences.mockImplementationOnce(heldRead(b.getTablePreferences));
        edit = () => RenderStore().updateTablePreferences({ needsAttentionOnly: true });
        expected = { searchQuery: "Remote search", needsAttentionOnly: true };
        break;
    }
    const fetchEntered = deferred<void>();
    const fetched = deferred<CloudStateEnvelope>();
    vi.spyOn(api, "getState").mockImplementationOnce(() => { fetchEntered.resolve(); return fetched.promise; });
    RenderStore().retryStorage(); RenderStore();
    await fetchEntered.promise;
    const editing = edit();
    await readEntered.promise;
    fetched.resolve(structuredClone(api.state));
    await vi.waitFor(() => expect(storage.refresh).toHaveResolvedTimes(1));
    RenderStore();
    releaseRead.resolve();
    expect(await editing).toBe(true);
    expect(api.state.snapshot[kind]).toMatchObject(expected);
    expect(RenderStore()[kind]).toMatchObject(expected);
  });

  it("retains multiple saved settings and sees remote edits on retry after cache recovery", async () => {
    const { api, a, cache } = await sessions();
    const failed = vi.spyOn(cache, "importSnapshot").mockRejectedValue(new Error("Cache unavailable"));
    await RenderStore().updateSettings({ defaultFollowUpPromptDays: 42 });
    await RenderStore().updateSettings({ defaultFollowUpPromptDays: 43 });
    failed.mockRestore();
    await RenderStore().repairCache();
    await a.updateApplication({ ...a.getCurrentSnapshot().applications[0], company: "Remote edit" });
    const save = vi.spyOn(api, "saveState");
    RenderStore().retryStorage(); RenderStore();
    await vi.waitFor(() => expect(RenderStore().applications[0].company).toBe("Remote edit"));
    expect(RenderStore().settings.defaultFollowUpPromptDays).toBe(43);
    expect(RenderStore().cacheWarning).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it("preserves editor conflict and changed-field protections after refreshing remote state", async () => {
    const { a, api } = await sessions();
    const baseline = RenderStore().applications[0];
    await a.updateApplication({ ...baseline, company: "Remote company" });
    RenderStore().retryStorage(); RenderStore();
    await vi.waitFor(() => expect(RenderStore().applications[0].company).toBe("Remote company"));
    const conflict = await RenderStore().updateApplication(baseline.id, { company: "Stale local company" }, undefined, undefined, baseline);
    expect(conflict.ok).toBe(false);
    expect(api.state.snapshot.applications[0].company).toBe("Remote company");
    expect((await RenderStore().updateApplication(baseline.id, { notes: "Unsubmitted local notes" }, undefined, undefined, baseline)).ok).toBe(true);
    expect(RenderStore().applications[0]).toMatchObject({ company: "Remote company", notes: "Unsubmitted local notes" });
    await a.refresh();
    await a.deleteApplication(baseline.id);
    RenderStore().retryStorage(); RenderStore();
    await vi.waitFor(() => expect(RenderStore().applications).toEqual([]));
    expect((await RenderStore().updateApplication(baseline.id, { notes: "Old deleted draft" }, undefined, undefined, baseline)).ok).toBe(false);
    expect(api.state.snapshot.applications).toEqual([]);
  });

  it("waits for whole editor actions and queued settings saves before refresh hydration", async () => {
    const { api, b } = await sessions();
    const read = deferred<typeof application>();
    storage.getApplication.mockReturnValueOnce(read.promise);
    const edit = RenderStore().updateApplication(application.id, { notes: "Pending local edit" });
    const first = RenderStore().updateSettings({ defaultFollowUpPromptDays: 44 });
    const second = RenderStore().updateSettings({ defaultFollowUpPromptDays: 45 });
    const fetch = vi.spyOn(api, "getState");
    RenderStore().retryStorage(); RenderStore(); await flush();
    expect(fetch).not.toHaveBeenCalled();
    expect(RenderStore().isStorageLoading).toBe(false);
    read.resolve(b.getCurrentSnapshot().applications[0]);
    expect((await edit).ok).toBe(true);
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    await vi.waitFor(() => expect(storage.refresh).toHaveResolvedTimes(1));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(RenderStore().applications[0].notes).toBe("Pending local edit");
    expect(RenderStore().settings.defaultFollowUpPromptDays).toBe(45);
  });

  it("preserves displayed state on a refresh failure and retries with newer committed state", async () => {
    const { api } = await sessions();
    await RenderStore().updateSettings({ defaultFollowUpPromptDays: 46 });
    vi.spyOn(api, "getState").mockRejectedValueOnce(new Error("Cloud read failed"));
    RenderStore().retryStorage(); RenderStore();
    await vi.waitFor(() => expect(RenderStore().storageError).toBe("Cloud read failed"));
    expect(RenderStore().settings.defaultFollowUpPromptDays).toBe(46);
    expect(RenderStore().isStorageLoading).toBe(false);
    expect(RenderStore().cacheWarning).toBeNull();
    await RenderStore().updateSettings({ defaultFollowUpPromptDays: 47 });
    RenderStore().retryStorage(); RenderStore();
    await vi.waitFor(() => expect(storage.refresh).toHaveResolvedTimes(1));
    expect(storage.refresh).toHaveBeenCalledTimes(2);
    expect(RenderStore().settings.defaultFollowUpPromptDays).toBe(47);
    expect(RenderStore().storageError).toBeNull();
  });

  it("reconciles real conflict retries into the rendered store and browser cache", async () => {
    const { api, a, b, cache, store } = await sessions();
    const original = RenderStore().applications[0];
    await a.updateApplication({ ...original, company: "A company" });
    expect((await store.updateApplication(original.id, { notes: "B notes" })).ok).toBe(true);
    expect(api.conflicts).toBe(1);
    expect(RenderStore().applications[0]).toMatchObject({ company: "A company", notes: "B notes" });
    expect(b.getCurrentSnapshot().applications).toEqual(api.state.snapshot.applications);
    expect((await cache.exportSnapshot()).applications).toMatchObject(api.state.snapshot.applications);
  });

  it("publishes confirmed creates, rebased edits and deletes while showing cache degradation separately", async () => {
    const { api, a, b, cache, store } = await sessions();
    const refresh = vi.spyOn(cache, "importSnapshot").mockRejectedValue(new Error("Cache full"));
    const save = vi.spyOn(api, "saveState");
    await a.updateApplication({ ...a.getCurrentSnapshot().applications[0], company: "A company" });
    expect((await store.updateApplication(application.id, { notes: "B notes" })).ok).toBe(true);
    expect(RenderStore().applications[0]).toMatchObject({ company: "A company", notes: "B notes" });
    expect(RenderStore().cacheWarning).toContain("Browser cache is unavailable");
    expect(RenderStore().storageError).toBeNull();
    const result = await RenderStore().createApplication({ ...application, company: "Created once" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected confirmed create");
    expect(RenderStore().applications).toHaveLength(2);
    expect((await RenderStore().deleteApplication(result.value.id)).ok).toBe(true);
    expect(RenderStore().applications).toEqual(b.getCurrentSnapshot().applications);
    expect(RenderStore().applications).toHaveLength(1);
    const calls = save.mock.calls.length;
    await RenderStore().repairCache();
    expect(RenderStore().cacheWarning).not.toBeNull();
    refresh.mockRestore();
    await RenderStore().repairCache();
    expect(save).toHaveBeenCalledTimes(calls);
    expect(RenderStore().cacheWarning).toBeNull();
    expect(RenderStore().storageError).toBeNull();
    expect(RenderStore().applications).toEqual(api.state.snapshot.applications);
  });

  it("keeps settings saves successful while caching is unavailable", async () => {
    const { api, cache } = await sessions();
    vi.spyOn(cache, "importSnapshot").mockRejectedValue(new Error("Cache full"));
    expect(await RenderStore().updateSettings({ defaultFollowUpPromptDays: 42 })).toBe(true);
    expect(RenderStore().settings.defaultFollowUpPromptDays).toBe(42);
    expect(api.state.snapshot.settings.defaultFollowUpPromptDays).toBe(42);
    expect(RenderStore().cacheWarning).not.toBeNull();
    expect(RenderStore().storageError).toBeNull();
  });

  it.each(["Cloud write rejected", "The save outcome could not be confirmed. Reload the tracker before retrying."])("preserves cloud errors and displayed data during cache repair: %s", async (message) => {
    const { api, cache } = await sessions();
    const refresh = vi.spyOn(cache, "importSnapshot").mockRejectedValue(new Error("Cache full"));
    expect((await RenderStore().updateApplication(application.id, { notes: "Confirmed" })).ok).toBe(true);
    vi.spyOn(api, "saveState").mockRejectedValue(new Error(message));
    expect((await RenderStore().updateApplication(application.id, { notes: "Rejected" })).ok).toBe(false);
    expect(RenderStore().storageError).toContain(message);
    refresh.mockRestore();
    await RenderStore().repairCache();
    expect(RenderStore().applications[0].notes).toBe("Confirmed");
    expect(RenderStore().storageError).toContain(message);
    expect(RenderStore().cacheWarning).toBeNull();
  });

  it("blocks late cache warning publication and repair after account invalidation", async () => {
    const { api, cache } = await sessions();
    const entered = deferred<void>();
    const held = deferred<void>();
    vi.spyOn(cache, "importSnapshot").mockImplementation(() => {
      entered.resolve();
      return held.promise.then(() => { throw new Error("Cache full"); });
    });
    const pending = RenderStore().updateApplication(application.id, { notes: "A notes" });
    await entered.promise;
    invalidate();
    held.resolve();
    expect((await pending).ok).toBe(false);
    expect(RenderStore().applications).toEqual([]);
    expect(RenderStore().cacheWarning).toBeNull();
    expect(RenderStore().storageError).toContain("Signed-in account changed");
    const revision = api.state.revision;
    await RenderStore().repairCache();
    expect(api.state.revision).toBe(revision);
  });

  it("rejects same-field conflicts visibly, preserves the draft baseline, and never replays a rejected edit", async () => {
    const { api, a, store } = await sessions();
    const original = RenderStore().applications[0];
    await a.updateApplication({ ...original, company: "A company" });
    expect((await store.updateApplication(original.id, { company: "B company" }, undefined, undefined, original)).ok).toBe(false);
    expect(RenderStore().applications[0].company).toBe("A company");
    expect(RenderStore().storageError).toContain("No changes were saved");
    const revision = api.state.revision;
    expect((await RenderStore().updateApplication(original.id, { company: "B company" }, undefined, undefined, original)).ok).toBe(false);
    expect(api.state.revision).toBe(revision);
    expect(api.state.snapshot.applications[0].company).toBe("A company");
  });

  it("publishes authoritative contact counts and both sessions' contacts", async () => {
    const { api, a, store } = await sessions();
    await a.createContact({ id: "remote-contact", applicationId: application.id, name: "A contact", createdAt: application.createdAt, updatedAt: application.updatedAt });
    expect((await store.addContact({ applicationId: application.id, name: "B contact" })).ok).toBe(true);
    expect(RenderStore().contacts).toHaveLength(2);
    expect(RenderStore().applications[0].contactsCount).toBe(2);
    expect(api.state.snapshot.applications[0].contactsCount).toBe(2);
  });

  it("rejects a stale table interview edit after the same adapter received a newer value", async () => {
    const source = { ...interview(1), dateTime: "2026-11-01T10:00:00.000Z" };
    const { api, b, store } = await sessions(createSnapshot({ interviews: [source] }));
    await b.saveInterview({ ...source, dateTime: "2026-11-02T10:00:00.000Z" });
    const saved = structuredClone(api.state);
    const result = await store.updateApplication(application.id, { interviewDateTime: "2026-11-03T10:00:00.000Z" });
    expect(result.ok).toBe(false);
    expect(api.state).toEqual(saved);
    expect(RenderStore().interviews[0].dateTime).toBe("2026-11-02T10:00:00.000Z");
  });

  it("preserves an independent interview field when a stale table edit changes its schedule", async () => {
    const source = { ...interview(1), dateTime: "2026-11-01T10:00:00.000Z" };
    const { api, b, store } = await sessions(createSnapshot({ interviews: [source] }));
    await b.saveInterview({ ...source, location: "New location" });
    const result = await store.updateApplication(application.id, { interviewDateTime: "2026-11-03T10:00:00.000Z" });
    expect(result.ok).toBe(true);
    expect(api.state.snapshot.interviews[0]).toMatchObject({ location: "New location", dateTime: "2026-11-03T10:00:00.000Z" });
  });

  it("does not apply a table edit to a different interview selected after a refresh", async () => {
    const source = { ...interview(1), dateTime: "2026-11-03T10:00:00.000Z" };
    const { api, b, store } = await sessions(createSnapshot({ interviews: [source] }));
    const added = { ...interview(2), dateTime: "2026-11-01T10:00:00.000Z" };
    await b.commitMutation({ interviews: [added], creates: { interviews: [added.id] } });
    const saved = structuredClone(api.state);
    expect((await store.updateApplication(application.id, { interviewLocation: "Old table edit" })).ok).toBe(false);
    expect(api.state).toEqual(saved);
  });

  it("keeps the old editor from editing a recreated application after adapter refresh", async () => {
    const { api, b, store } = await sessions();
    await b.deleteApplication(application.id);
    await b.createApplication({ ...application, createdAt: "2026-10-23T00:00:00.000Z" });
    const saved = structuredClone(api.state);
    expect((await store.updateApplication(application.id, { notes: "Old draft" }, undefined, undefined, application)).ok).toBe(false);
    expect(api.state).toEqual(saved);
  });

  it("does not associate a replacement document using an old displayed selection", async () => {
    const document = { id: "doc", displayName: "Resume", originalFileName: "r.pdf", downloadFileName: "r.pdf", fileExtension: "pdf" as const, mimeType: "application/pdf", fileSize: 5, storageKey: "old-file", contentHash: "hash", uploadedAt: application.createdAt, updatedAt: application.updatedAt };
    const { api, b, store } = await sessions(createSnapshot({ resumes: [document] }));
    await b.deleteResumeMetadata(document.id);
    await b.createResumeMetadata({ ...document, storageKey: "new-file", uploadedAt: "2026-10-23T00:00:00.000Z" });
    const saved = structuredClone(api.state);
    expect((await store.updateApplication(application.id, { resumeId: document.id })).ok).toBe(false);
    expect(api.state).toEqual(saved);
  });

  it("restores a parsed full backup into cloud and publishes all committed store collections despite cache failure", async () => {
    const { api, cache, store } = await sessions();
    vi.spyOn(cache, "importSnapshot").mockRejectedValue(new Error("Cache full"));
    const file = backupFile(populatedBackup());
    const preview = await store.previewBackupImport(file);
    expect(preview).toMatchObject({ resumes: 1, coverLetters: 1, contacts: 1 });
    await store.importFullBackup(file);
    expect(RenderStore().applications).toEqual(api.state.snapshot.applications);
    expect(RenderStore().resumes).toEqual(api.state.snapshot.resumes);
    expect(RenderStore().coverLetters).toEqual(api.state.snapshot.coverLetters);
    expect(RenderStore().contacts).toEqual(api.state.snapshot.contacts);
    expect(RenderStore().cacheWarning).toContain("Browser cache is unavailable");
  });

  it("keeps displayed and committed data after restore upload failure", async () => {
    const { api, store } = await sessions();
    const displayed = RenderStore().applications;
    const committed = structuredClone(api.state);
    vi.spyOn(api, "putResumeFile").mockRejectedValue(new Error("Upload failed"));
    await expect(store.importFullBackup(backupFile(populatedBackup()))).rejects.toThrow("Upload failed");
    expect(RenderStore().applications).toEqual(displayed);
    expect(api.state).toEqual(committed);
  });

  it("rejects invalid backups at preview and import without calling storage", async () => {
    const { store } = await sessions();
    const bad = populatedBackup(); bad.coverLetterFiles = [];
    storage.importSnapshot.mockClear();
    await expect(store.previewBackupImport(backupFile(bad))).rejects.toThrow("missing a stored cover letter");
    await expect(store.importFullBackup(backupFile(bad))).rejects.toThrow("missing a stored cover letter");
    expect(storage.importSnapshot).not.toHaveBeenCalled();
  });

  it("keeps over-limit recovery export available while refusing to advertise a full backup", async () => {
    const { store, b } = await sessions();
    const large = snapshotWithBytes(MAX_CLOUD_SNAPSHOT_BYTES + 100, b.getCurrentSnapshot());
    storage.exportSnapshot.mockResolvedValue(large);
    await expect(store.exportFullBackup()).rejects.toThrow("1,900,000-byte");
    const recovery = await store.exportRecoveryBackup();
    const data = JSON.parse(await recovery.text());
    expect(data.snapshot).toEqual(JSON.parse(JSON.stringify(large)));
    await expect(parseBackupFile(recovery)).rejects.toThrow("1,900,000-byte");
    expect((await createBackupFile({ snapshot: large, resumeFiles: [] })).size).toBe(recovery.size);
  });


  it("exports metadata-only legacy documents without attempting nonexistent cloud file downloads", async () => {
    const backup = populatedBackup();
    backup.snapshot.resumes[0].fileSize = 0;
    backup.snapshot.coverLetters[0].fileSize = 0;
    const { store } = await sessions(backup.snapshot);
    storage.getResumeFile.mockClear();
    const parsed = await parseBackupFile(await store.exportFullBackup());
    expect(storage.getResumeFile).not.toHaveBeenCalled();
    expect(parsed.resumeFiles).toEqual([]);
    expect(parsed.coverLetterFiles).toEqual([]);
    expect(parsed.snapshot.applications[0].resumeId).toBe(backup.snapshot.resumes[0].id);
    expect(parsed.snapshot.applications[0].coverLetterId).toBe(backup.snapshot.coverLetters[0].id);
  });

  it.each(["not-found", "missing"])("preserves metadata in recovery archives when attachments are %s", async (kind) => {
    const backup = populatedBackup();
    const { store } = await sessions(backup.snapshot);
    if (kind === "not-found") storage.getResumeFile.mockRejectedValue(new CloudApiError("Missing cloud file", 404));
    else storage.getResumeFile.mockResolvedValue(undefined);
    await expect(store.exportFullBackup()).rejects.toThrow();
    const recovered = JSON.parse(await (await store.exportRecoveryBackup()).text());
    expect(recovered.snapshot.resumes).toEqual(backup.snapshot.resumes);
    expect(recovered.snapshot.coverLetters).toEqual(backup.snapshot.coverLetters);
    expect(recovered.resumeFiles).toEqual([]);
    expect(recovered.coverLetterFiles).toEqual([]);
    await expect(parseBackupFile(backupFile(recovered))).rejects.toThrow("missing a stored resume file");
  });

  it.each([0, 401, 412, 500])("keeps recovery export account/network failures visible (%i)", async (status) => {
    const { store } = await sessions(populatedBackup().snapshot);
    storage.getResumeFile.mockRejectedValue(new CloudApiError("Cloud read failed", status));
    await expect(store.exportRecoveryBackup()).rejects.toThrow("Cloud read failed");
  });

  it.each(["resume", "cover letter"])("does not download a retained same-key object for metadata-only %s entries", async (kind) => {
    const backup = populatedBackup();
    const document = kind === "resume" ? backup.snapshot.resumes[0] : backup.snapshot.coverLetters[0];
    document.fileSize = 0;
    const { api, store } = await sessions(backup.snapshot);
    api.files.set(document.storageKey, new Blob(["%PDF-unrelated retained contents"], { type: document.mimeType }));
    storage.getResumeFile.mockClear();
    const download = kind === "resume" ? store.getResumeFile : store.getCoverLetterFile;
    await expect(download(document.id)).rejects.toThrow("metadata only");
    expect(storage.getResumeFile).not.toHaveBeenCalled();
    expect(await api.files.get(document.storageKey)!.text()).toBe("%PDF-unrelated retained contents");
  });

});

describe("table preference saves", () => {
  const saved: TablePreferences = {
    columnWidths: { company: 180 },
    filters: DEFAULT_APPLICATION_FILTERS,
    needsAttentionOnly: false,
    searchQuery: "",
    sort: DEFAULT_SORT_STATE,
    visibleApplicationColumns: ["jobTitle", "company"],
  };

  it("skips the save when nothing changed, even given fresh arrays and objects", async () => {
    storage.getTablePreferences.mockResolvedValue(saved);
    RenderStore(); await flush();

    expect(await RenderStore().updateTablePreferences(structuredClone(saved))).toBe(true);
    expect(storage.saveTablePreferences).not.toHaveBeenCalled();
  });

  it("still saves a real change", async () => {
    storage.getTablePreferences.mockResolvedValue(saved);
    RenderStore(); await flush();

    expect(await RenderStore().updateTablePreferences({ needsAttentionOnly: true })).toBe(true);
    expect(storage.saveTablePreferences).toHaveBeenCalledTimes(1);
    expect(storage.saveTablePreferences.mock.calls[0][0]).toMatchObject({ needsAttentionOnly: true });
  });

  it("saves the first preferences when none are stored yet", async () => {
    storage.getTablePreferences.mockResolvedValue(null);
    RenderStore(); await flush();

    expect(await RenderStore().updateTablePreferences(structuredClone(saved))).toBe(true);
    expect(storage.saveTablePreferences).toHaveBeenCalledTimes(1);
  });

  it("settles after one save when the page re-saves fresh copies after every publish", async () => {
    // The Applications page persists whenever settings are republished, and
    // each publish rebuilds visibleApplicationColumns, so it re-saves equal
    // preferences with new identities. Previously each of these was written.
    let stored: TablePreferences | null = saved;
    storage.getTablePreferences.mockImplementation(async () => stored);
    storage.saveTablePreferences.mockImplementation(async (next: TablePreferences) => {
      stored = structuredClone(next);
    });
    RenderStore(); await flush();

    const searched = { ...saved, searchQuery: "react" };
    for (let republish = 0; republish < 5; republish++) {
      await RenderStore().updateTablePreferences(structuredClone(searched));
    }

    expect(storage.saveTablePreferences).toHaveBeenCalledTimes(1);
    expect(stored).toMatchObject({ searchQuery: "react" });
  });

});

it("exposes cleanup warnings without reporting a failed cloud save and ignores stale account warnings", async () => {
  storage.getDocumentCleanupWarning.mockReturnValue("Cloud changes were saved; cleanup failed.");
  RenderStore(); await flush();
  expect(RenderStore().documentCleanupWarning).toContain("Cloud changes were saved");
  expect(RenderStore().storageError).toBeNull();
  const lateWarning = storage.subscribeDocumentCleanupWarning.mock.calls[0][0] as (warning: string) => void;
  invalidate(); lateWarning("Late old-account cleanup warning");
  expect(RenderStore().documentCleanupWarning).toBeNull();
});
