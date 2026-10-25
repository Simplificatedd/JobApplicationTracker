import { describe, expect, it, vi } from "vitest";
import { snapshot } from "../test/assessmentFixtures";
import { snapshotWithBytes } from "../test/snapshotSize";
import { createTestStorageAdapter } from "../test/indexedDb";
import { RevisionApi } from "../test/revisionApi";
import { CloudRevisionConflictError, createCloudApiClient } from "./cloudApi";
import { createCloudStorageAdapter } from "./cloudStorageAdapter";
import { MAX_CLOUD_SNAPSHOT_BYTES } from "./snapshotSize";

describe("snapshot size enforcement during conflict recovery", () => {
  it("rejects an oversized rebase without replaying, corrupting committed state or misreporting a cache failure", async () => {
    const server = new RevisionApi(snapshot());
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).endsWith("/session")) return Response.json(await server.getSession());
      if (init?.method !== "PUT") return Response.json(await server.getState());
      const { snapshot: data, baseRevision } = JSON.parse(String(init.body));
      try { return Response.json(await server.saveState(data, baseRevision)); }
      catch (error) {
        if (error instanceof CloudRevisionConflictError) return Response.json({ current: error.current }, { status: 409 });
        throw error;
      }
    });
    const cache = createTestStorageAdapter();
    const adapter = createCloudStorageAdapter({ api: createCloudApiClient({ fetcher, retryDelays: [0, 0] }), cache });
    await adapter.initialize();
    const before = adapter.getCurrentSnapshot();
    await server.saveState(snapshotWithBytes(MAX_CLOUD_SNAPSHOT_BYTES - 20, before), server.state.revision);
    const committed = structuredClone(server.state);
    fetcher.mockClear();
    await expect(adapter.updateApplication({ ...before.applications[0], jobDescription: "Local edit".repeat(20) })).rejects.toMatchObject({ status: 413 });
    const writes = fetcher.mock.calls.filter(([, init]) => init?.method === "PUT");
    expect(writes).toHaveLength(1); // Only the stale attempt; the merged request is rejected locally.
    expect(server.state).toEqual(committed);
    expect(adapter.getCurrentSnapshot()).toEqual(committed.snapshot);
    expect(adapter.getCacheWarning()).toBeNull();
    await adapter.repairCache();
    await adapter.refresh();
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1);
    expect((await cache.exportSnapshot()).applications[0].notes).toBe(committed.snapshot.applications[0].notes);
    await adapter.updateApplication({ ...adapter.getCurrentSnapshot().applications[0], jobDescription: "ok" });
    expect(server.state.snapshot.applications[0].jobDescription).toBe("ok");
    expect(adapter.getCurrentSnapshot()).toEqual(server.state.snapshot);
  });
});
