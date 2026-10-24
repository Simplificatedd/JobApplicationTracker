import { describe, expect, it, vi } from "vitest";
import { snapshot } from "../test/assessmentFixtures";
import { createTestStorageAdapter } from "../test/indexedDb";
import { RevisionApi } from "../test/revisionApi";
import { CloudApiError } from "./cloudApi";
import { createCloudStorageAdapter } from "./cloudStorageAdapter";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => { resolve = complete; });
  return { promise, resolve };
}

describe("session invalidation while repairing the cache", () => {
  it("keeps an established account active after a transient session-check network failure", async () => {
    const api = new RevisionApi(snapshot());
    const changed = vi.fn();
    const adapter = createCloudStorageAdapter({ api, cache: createTestStorageAdapter(), onAccountChanged: changed });
    await adapter.initialize();
    const session = vi.spyOn(api, "getSession").mockRejectedValue(new CloudApiError("Network unavailable", 0));
    await expect(adapter.repairCache()).rejects.toThrow("Network unavailable");
    expect(changed).not.toHaveBeenCalled();
    expect(adapter.getAccount()?.id).toBe("owner");
    session.mockRestore();
    await expect(adapter.repairCache()).resolves.toBeUndefined();
  });

  it.each([401, 403, "account switch"] as const)("blocks pending cache completion after %s", async (failure) => {
    const api = new RevisionApi(snapshot());
    const cache = createTestStorageAdapter();
    const changed = vi.fn();
    const adapter = createCloudStorageAdapter({ api, cache, onAccountChanged: changed });
    await adapter.initialize();
    const entered = deferred();
    const held = deferred();
    vi.spyOn(cache, "importSnapshot").mockImplementation(() => { entered.resolve(); return held.promise; });
    const pending = adapter.repairCache().then(() => null, (error: unknown) => error);
    await entered.promise;
    if (failure === "account switch") vi.spyOn(api, "getSession").mockResolvedValue({ id: "other", email: "other@example.edu" });
    else vi.spyOn(api, "getSession").mockRejectedValue(new CloudApiError("Session is no longer authorized", failure));
    await expect(adapter.listApplications()).rejects.toThrow();
    held.resolve();
    expect(await pending).toBeInstanceOf(Error);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(adapter.getAccount()).toBeNull();
    expect(() => adapter.getCurrentSnapshot()).toThrow("Reload the tracker");
  });
});
