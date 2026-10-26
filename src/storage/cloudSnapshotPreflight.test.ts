import { describe, expect, it, vi } from "vitest";
import { snapshot, timestamp } from "../test/assessmentFixtures";
import { snapshotWithBytes } from "../test/snapshotSize";
import { createTestStorageAdapter } from "../test/indexedDb";
import { RevisionApi } from "../test/revisionApi";
import type { CloudApiClient } from "./cloudApi";
import { createCloudStorageAdapter } from "./cloudStorageAdapter";
import { CloudSnapshotSizeError, MAX_CLOUD_SNAPSHOT_BYTES } from "./snapshotSize";

const document = { id: "doc", storageKey: "file", displayName: "Resume", originalFileName: "r.pdf", downloadFileName: "r.pdf", fileExtension: "pdf" as const, mimeType: "application/pdf", contentHash: "hash", fileSize: 5, uploadedAt: timestamp, updatedAt: timestamp };

async function setup() {
  const api = new RevisionApi(snapshot());
  const adapter = createCloudStorageAdapter({ api, cache: createTestStorageAdapter() });
  await adapter.initialize();
  return { api, adapter };
}

describe("snapshot size checks before document uploads", () => {
  it("rejects oversized normalized backup restores before uploading any files", async () => {
    const { api, adapter } = await setup();
    const before = adapter.getCurrentSnapshot();
    const save = vi.spyOn(api, "saveState");
    const upload = vi.spyOn(api, "putResumeFile");
    const legacy = snapshotWithBytes(MAX_CLOUD_SNAPSHOT_BYTES - 1);
    // Normalization adds migrated fields, so preflight must measure its result.
    expect(new TextEncoder().encode(JSON.stringify(legacy)).byteLength).toBeLessThan(MAX_CLOUD_SNAPSHOT_BYTES);
    await expect(adapter.importSnapshot(legacy, [{ storageKey: "file", file: new Blob(["bytes"]) }])).rejects.toBeInstanceOf(CloudSnapshotSizeError);
    expect(save).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(adapter.getCurrentSnapshot()).toEqual(before);
    expect(adapter.getCacheWarning()).toBeNull();
  });

  it("includes added document metadata in the proposed snapshot before uploading", async () => {
    const { api, adapter } = await setup();
    api.state = { ...api.state, revision: api.state.revision + 1, snapshot: snapshotWithBytes(MAX_CLOUD_SNAPSHOT_BYTES - 100, adapter.getCurrentSnapshot()) };
    await adapter.refresh();
    const before = adapter.getCurrentSnapshot();
    const save = vi.spyOn(api, "saveState");
    const upload = vi.spyOn(api, "putResumeFile");
    await expect(adapter.commitMutation({ resumes: [document], creates: { resumes: [document.id] }, resumeFiles: [{ storageKey: "file", file: new Blob(["bytes"]) }] })).rejects.toBeInstanceOf(CloudSnapshotSizeError);
    expect(save).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(adapter.getCurrentSnapshot()).toEqual(before);
  });

  it("rejects oversized first-login migration before cloud file or snapshot writes", async () => {
    const api = new RevisionApi(snapshot());
    vi.spyOn<CloudApiClient, "getState">(api, "getState").mockResolvedValueOnce(null);
    const cache = createTestStorageAdapter();
    vi.spyOn(cache, "initialize").mockResolvedValue(snapshotWithBytes(MAX_CLOUD_SNAPSHOT_BYTES - 1));
    vi.spyOn(cache, "listResumeFiles").mockResolvedValue([{ storageKey: "file", file: new Blob(["bytes"]) }]);
    const save = vi.spyOn(api, "saveState");
    const upload = vi.spyOn(api, "putResumeFile");
    const adapter = createCloudStorageAdapter({ api, cache });
    await expect(adapter.initialize()).rejects.toBeInstanceOf(CloudSnapshotSizeError);
    expect(save).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("permits restores with large binary files when snapshot metadata fits", async () => {
    const { api, adapter } = await setup();
    const file = new Blob(["%PDF-", "x".repeat(MAX_CLOUD_SNAPSHOT_BYTES + 1)], { type: "application/pdf" });
    await adapter.importSnapshot({ ...adapter.getCurrentSnapshot(), resumes: [{ ...document, fileSize: file.size }] }, [{ storageKey: "file", file }]);
    expect([...api.files.values()][0]?.size).toBe(file.size);
    expect(adapter.getCurrentSnapshot().resumes[0].id).toBe(document.id);
  });
});
