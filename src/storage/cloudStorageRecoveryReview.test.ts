import { describe, expect, it, vi } from "vitest";
import { snapshot } from "../test/assessmentFixtures";
import { createTestStorageAdapter } from "../test/indexedDb";
import { RevisionApi } from "../test/revisionApi";
import { createCloudStorageAdapter } from "./cloudStorageAdapter";
import { CloudApiError, type CloudStateEnvelope } from "./cloudApi";

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
