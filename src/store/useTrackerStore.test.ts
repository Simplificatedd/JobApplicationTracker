import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ANALYTICS_SETTINGS, DEFAULT_NOTIFICATION_STATE, DEFAULT_USER_SETTINGS } from "../lib/domain";
import { application } from "../test/assessmentFixtures";
import { createTestStorageAdapter } from "../test/indexedDb";
import { RevisionApi } from "../test/revisionApi";
import { snapshot as createSnapshot } from "../test/assessmentFixtures";
import { StorageConflictError } from "../storage/mutationRebase";
import type { StorageSnapshot } from "../storage/StorageAdapter";

// A small hook host lets these tests control promise/event ordering without a
// browser or network. State and refs persist across renders; effects run once.
const host = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[], effects: [] as (() => unknown)[] }));
vi.mock("react", () => ({
  useState(initial: unknown) {
    const slot = host.cursor++;
    if (!(slot in host.slots)) host.slots[slot] = typeof initial === "function" ? initial() : initial;
    return [host.slots[slot], (value: unknown) => {
      host.slots[slot] = typeof value === "function" ? value(host.slots[slot]) : value;
    }];
  },
  useRef(initial: unknown) {
    const slot = host.cursor++;
    if (!(slot in host.slots)) host.slots[slot] = { current: initial };
    return host.slots[slot];
  },
  useCallback(callback: unknown) { return callback; },
  useEffect(effect: () => unknown) {
    const slot = host.cursor++;
    if (!(slot in host.slots)) { host.slots[slot] = true; host.effects.push(effect); }
  },
}));
const storage = vi.hoisted(() => ({
  initialize: vi.fn(), getAccount: vi.fn(), commitMutation: vi.fn(),
  getSettings: vi.fn(), saveSettings: vi.fn(), exportSnapshot: vi.fn(), getCurrentSnapshot: vi.fn(),
  getApplication: vi.fn(), listInterviews: vi.fn(), listResumeMetadata: vi.fn(),
  listCoverLetterMetadata: vi.fn(), listContacts: vi.fn(), deleteApplication: vi.fn(),
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
  host.slots = []; host.effects = []; host.cursor = 0;
  vi.stubGlobal("window", new EventTarget());
  vi.clearAllMocks();
  storage.initialize.mockResolvedValue(snapshot);
  storage.getAccount.mockReturnValue({ id: "A", email: "a@example.edu" });
  storage.commitMutation.mockResolvedValue(undefined);
  storage.getSettings.mockResolvedValue(snapshot.settings);
  storage.saveSettings.mockResolvedValue(undefined);
  storage.exportSnapshot.mockResolvedValue(snapshot);
  storage.getCurrentSnapshot.mockReturnValue(snapshot);
  storage.getApplication.mockResolvedValue(application);
  storage.listInterviews.mockResolvedValue([]);
  storage.listResumeMetadata.mockResolvedValue([]);
  storage.listCoverLetterMetadata.mockResolvedValue([]);
  storage.listContacts.mockResolvedValue([]);
  storage.deleteApplication.mockResolvedValue(undefined);
});
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); vi.unstubAllGlobals(); });

describe("store account invalidation", () => {
  it("hydrates normally before invalidation", async () => {
    RenderStore(); await flush();
    expect(RenderStore().settings.defaultFollowUpPromptDays).toBe(99);
    expect(RenderStore().cloudAccountEmail).toBe("a@example.edu");
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
  async function sessions() {
    const { createCloudStorageAdapter } = await vi.importActual<typeof import("../storage/cloudStorageAdapter")>("../storage/cloudStorageAdapter");
    const api = new RevisionApi(createSnapshot());
    const a = createCloudStorageAdapter({ api, cache: createTestStorageAdapter() });
    const cache = createTestStorageAdapter();
    const b = createCloudStorageAdapter({ api, cache });
    await a.initialize();
    storage.initialize.mockImplementation(b.initialize);
    storage.commitMutation.mockImplementation(b.commitMutation);
    storage.getCurrentSnapshot.mockImplementation(b.getCurrentSnapshot);
    storage.getApplication.mockImplementation(b.getApplication);
    storage.listInterviews.mockImplementation(b.listInterviews);
    storage.listResumeMetadata.mockImplementation(b.listResumeMetadata);
    storage.listCoverLetterMetadata.mockImplementation(b.listCoverLetterMetadata);
    storage.listContacts.mockImplementation(b.listContacts);
    RenderStore();
    await vi.waitFor(() => expect(RenderStore().isStorageLoading).toBe(false));
    return { api, a, b, cache, store: RenderStore() };
  }

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
});
