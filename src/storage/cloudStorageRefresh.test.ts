import { describe, expect, it, vi } from "vitest";
import { snapshot } from "../test/assessmentFixtures";
import { createTestStorageAdapter } from "../test/indexedDb";
import { RevisionApi } from "../test/revisionApi";
import { createCloudStorageAdapter } from "./cloudStorageAdapter";

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
