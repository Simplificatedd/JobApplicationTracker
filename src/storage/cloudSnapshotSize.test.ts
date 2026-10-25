import { describe, expect, it, vi } from "vitest";
import { snapshot } from "../test/assessmentFixtures";
import { snapshotWithBytes } from "../test/snapshotSize";
import { createTestStorageAdapter } from "../test/indexedDb";
import { RevisionApi } from "../test/revisionApi";
import { CloudRevisionConflictError, createCloudApiClient } from "./cloudApi";
import { createCloudStorageAdapter } from "./cloudStorageAdapter";
import { MAX_CLOUD_SNAPSHOT_BYTES } from "./snapshotSize";
import { createBackupFile } from "../lib/backups";

async function setup() {
  const server = new RevisionApi(snapshot());
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).endsWith("/session")) return Response.json(await server.getSession());
    if (String(url).includes("/resume-files/")) {
      const key = decodeURIComponent(String(url).split("/resume-files/")[1]);
      if (init?.method === "PUT") {
        await server.putResumeFile(key, init.body as Blob);
        return Response.json({});
      }
      return new Response(await server.getResumeFile(key));
    }
    if (init?.method !== "PUT") return Response.json(await server.getState());
    const { snapshot: data, baseRevision } = JSON.parse(String(init.body));
    try { return Response.json(await server.saveState(data, baseRevision)); }
    catch (error) {
      if (error instanceof CloudRevisionConflictError) return Response.json({ current: error.current }, { status: 409 });
      throw error;
    }
  });
  const cache = createTestStorageAdapter();
  const api = createCloudApiClient({ fetcher, retryDelays: [0, 0] });
  const adapter = createCloudStorageAdapter({ api, cache });
  await adapter.initialize();
  return { server, fetcher, cache, adapter, api };
}

describe("snapshot size enforcement during conflict recovery", () => {
  it("rejects an oversized rebase without replaying, corrupting committed state or misreporting a cache failure", async () => {
    const { server, fetcher, cache, adapter } = await setup();
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

  it("keeps existing over-limit cloud data readable/exportable and permits a reducing save", async () => {
    const { server, api, adapter } = await setup();
    const large = snapshotWithBytes(MAX_CLOUD_SNAPSHOT_BYTES + 100, adapter.getCurrentSnapshot());
    server.state = { ...server.state, revision: server.state.revision + 1, snapshot: large };
    const save = vi.spyOn(server, "saveState");
    const reader = createCloudStorageAdapter({ api, cache: createTestStorageAdapter() });
    await reader.initialize();
    const exported = await reader.exportSnapshot();
    expect(exported).toEqual(large);
    const backup = await createBackupFile({ snapshot: exported, resumeFiles: [], coverLetterFiles: [] });
    expect(backup.size).toBeGreaterThan(MAX_CLOUD_SNAPSHOT_BYTES);
    expect(save).not.toHaveBeenCalled();
    await reader.updateApplication({ ...exported.applications[0], notes: "Reduced to fit" });
    expect(save).toHaveBeenCalledTimes(1);
    expect(server.state.snapshot.applications[0].notes).toBe("Reduced to fit");
  });

  it("preserves committed documents when a post-upload rebase exceeds capacity", async () => {
    const { server, fetcher, adapter } = await setup();
    const document = { id: "original", storageKey: "original-file", displayName: "Resume", originalFileName: "r.pdf", downloadFileName: "r.pdf", fileExtension: "pdf" as const, mimeType: "application/pdf", contentHash: "hash", fileSize: 5, uploadedAt: "2026-10-25T00:00:00.000Z", updatedAt: "2026-10-25T00:00:00.000Z" };
    const original = new Blob(["saved"]);
    await adapter.saveResume(document, original);
    await adapter.updateApplication({ ...adapter.getCurrentSnapshot().applications[0], resumeId: document.id });
    await server.saveState(snapshotWithBytes(MAX_CLOUD_SNAPSHOT_BYTES - 100, adapter.getCurrentSnapshot()), server.state.revision);
    const committed = structuredClone(server.state);
    fetcher.mockClear();
    const additional = { ...document, id: "additional", storageKey: "additional-file" };
    await expect(adapter.saveResume(additional, new Blob(["added"]))).rejects.toMatchObject({ status: 413 });
    expect(server.state).toEqual(committed);
    expect(adapter.getCurrentSnapshot()).toEqual(committed.snapshot);
    expect(await server.files.get(document.storageKey)!.text()).toBe(await original.text());
    expect(adapter.getCurrentSnapshot().applications[0].resumeId).toBe(document.id);
    expect(adapter.getCurrentSnapshot().resumes).toEqual([document]);
    expect(adapter.getCacheWarning()).toBeNull();
    await adapter.refresh();
    const stateWrites = fetcher.mock.calls.filter(([url, init]) => String(url).endsWith("/state") && init?.method === "PUT");
    const uploads = fetcher.mock.calls.filter(([url, init]) => String(url).includes("/resume-files/") && init?.method === "PUT");
    expect(stateWrites).toHaveLength(1); // The stale attempt only; the rebase is rejected locally.
    expect(uploads).toHaveLength(1);
  });

  it("keeps a later cache-repair failure separate from a rejected size-limited save", async () => {
    const { server, fetcher, cache, adapter } = await setup();
    const committed = structuredClone(server.state);
    const cacheWrite = vi.spyOn(cache, "importSnapshot").mockRejectedValue(new Error("IndexedDB unavailable"));
    fetcher.mockClear();
    await expect(adapter.updateApplication({ ...adapter.getCurrentSnapshot().applications[0], notes: "x".repeat(MAX_CLOUD_SNAPSHOT_BYTES) })).rejects.toMatchObject({ status: 413 });
    expect(cacheWrite).not.toHaveBeenCalled();
    expect(adapter.getCacheWarning()).toBeNull();
    await adapter.repairCache();
    expect(adapter.getCacheWarning()).toContain("Browser cache is unavailable");
    expect(server.state).toEqual(committed);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(0);
    cacheWrite.mockRestore();
    await adapter.repairCache();
    expect(adapter.getCacheWarning()).toBeNull();
    expect(adapter.getCurrentSnapshot()).toEqual(committed.snapshot);
  });
});
