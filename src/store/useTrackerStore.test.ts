import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ANALYTICS_SETTINGS, DEFAULT_NOTIFICATION_STATE, DEFAULT_USER_SETTINGS } from "../lib/domain";
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
  getSettings: vi.fn(), saveSettings: vi.fn(),
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
