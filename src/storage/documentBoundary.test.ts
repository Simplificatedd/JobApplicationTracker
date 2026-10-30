import { describe, expect, it, vi } from "vitest";
import { createCloudStorageAdapter } from "./cloudStorageAdapter";
import { CloudApiError, createCloudApiClient } from "./cloudApi";
import { RevisionApi } from "../test/revisionApi";
import { createTestStorageAdapter } from "../test/indexedDb";
import { snapshot } from "../test/assessmentFixtures";
import { backupDocument } from "../test/backupFixtures";
import { normalizeSnapshot } from "./normalizeSnapshot";
import { createCoverLetterUploadResult, createResumeUploadResult } from "../lib/resumeFiles";

async function setup() {
  const api = new RevisionApi(normalizeSnapshot(snapshot()));
  const cache = createTestStorageAdapter();
  const adapter = createCloudStorageAdapter({ api, cache });
  await adapter.initialize();
  return { api, adapter, cache };
}

describe("validated document MIME reaches upload and cache", () => {
  it.each(["pdf", "docx"] as const)("uses the validated %s MIME for both document collections", async extension => {
    for (const collection of ["resume", "cover"] as const) {
      const { api, adapter } = await setup();
      const file = new File([extension === "pdf" ? "%PDF-document" : "PK\u0003\u0004document"], `document.${extension}`, { type: "" });
      const metadata = collection === "resume"
        ? (await createResumeUploadResult({ existingResumes: [], file, options: {} })).resume
        : (await createCoverLetterUploadResult({ existingCoverLetters: [], file, options: {} })).coverLetter;
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}));
      const http = createCloudApiClient({ fetcher, retryDelays: [] });
      const put = api.putResumeFile.bind(api);
      vi.spyOn(api, "putResumeFile").mockImplementation(async (key, bytes) => {
        await http.putResumeFile(key, bytes, "owner"); await put(key, bytes);
      });
      if (collection === "resume") await adapter.saveResume(metadata, file);
      else await adapter.saveCoverLetter(metadata, file);
      expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ "Content-Type": metadata.mimeType, "X-Tracker-Account-Id": "owner" });
      expect(await (fetcher.mock.calls[0][1]?.body as Blob).text()).toBe(await file.text());
      const remoteRead = vi.spyOn(api, "getResumeFile");
      const cached = await adapter.getResumeFile(metadata.storageKey);
      expect(cached?.type).toBe(metadata.mimeType); expect(await cached?.text()).toBe(await file.text());
      expect(remoteRead).not.toHaveBeenCalled();
    }
  });
});

it("reports failed cleanup separately from an acknowledged metadata save", async () => {
  const { api, adapter } = await setup(); const doc = backupDocument();
  await adapter.saveResume(doc.metadata, doc.record.file);
  const save = vi.spyOn(api, "saveState"), failedDelete = vi.spyOn(api, "deleteResumeFile").mockRejectedValueOnce(new Error("R2 unavailable"));
  const warning = vi.fn(); const unsubscribe = adapter.subscribeDocumentCleanupWarning(warning);
  await expect(adapter.commitMutation({ deleteResumeIds: [doc.metadata.id], deleteResumeFileKeys: [doc.metadata.storageKey] })).resolves.toBeUndefined();
  expect(save).toHaveBeenCalledTimes(1); expect(failedDelete).toHaveBeenCalledTimes(1);
  expect(adapter.getCurrentSnapshot().resumes).toEqual([]); expect(api.files.has(doc.metadata.storageKey)).toBe(true);
  expect(adapter.getDocumentCleanupWarning()).toContain("Cloud changes were saved");
  expect(warning).toHaveBeenCalledWith(expect.stringContaining("Do not repeat")); expect(adapter.getCacheWarning()).toBeNull();
  unsubscribe();
});

it("retains uploaded bytes after an uncertain snapshot acknowledgement without replay or compensation", async () => {
  const { api, adapter } = await setup(); const doc = backupDocument();
  const save = api.saveState.bind(api);
  const saves = vi.spyOn(api, "saveState").mockImplementationOnce(async (...args) => {
    await save(...args); throw new CloudApiError("Unconfirmed save; reload and inspect", 0);
  });
  const remove = vi.spyOn(api, "deleteResumeFile");
  await expect(adapter.saveResume(doc.metadata, doc.record.file)).rejects.toThrow("Unconfirmed");
  expect(saves).toHaveBeenCalledTimes(1); expect(remove).not.toHaveBeenCalled();
  expect(api.state.snapshot.resumes[0].id).toBe(doc.metadata.id); expect(api.files.has(doc.metadata.storageKey)).toBe(true);
});

it("does not claim an explicit file clear succeeded or clear cache after a partial failure", async () => {
  const { api, adapter, cache } = await setup(); const doc = backupDocument();
  await adapter.saveResume(doc.metadata, doc.record.file);
  vi.spyOn(api, "deleteResumeFile").mockRejectedValueOnce(new Error("Delete failed"));
  const clearCache = vi.spyOn(cache, "clearResumeFiles");
  await expect(adapter.clearResumeFiles()).rejects.toThrow("may be partial"); expect(clearCache).not.toHaveBeenCalled();
  expect(api.files.has(doc.metadata.storageKey)).toBe(true);
});
