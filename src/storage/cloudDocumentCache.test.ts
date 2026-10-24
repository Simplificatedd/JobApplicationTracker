import { describe, expect, it, vi } from "vitest";
import { createAssessment } from "../lib/assessments";
import { application, interview, snapshot, timestamp } from "../test/assessmentFixtures";
import { createTestStorageAdapter } from "../test/indexedDb";
import { RevisionApi } from "../test/revisionApi";
import type { ResumeMetadata } from "../types/application";
import { CloudApiError } from "./cloudApi";
import { createCloudStorageAdapter } from "./cloudStorageAdapter";

const document: ResumeMetadata = {
  id: "document", displayName: "Document", originalFileName: "doc.pdf", downloadFileName: "doc.pdf",
  fileExtension: "pdf", mimeType: "application/pdf", fileSize: 5, storageKey: "doc-file",
  contentHash: "hash", uploadedAt: timestamp, updatedAt: timestamp,
};
const cacheError = new Error("Browser cache unavailable");

async function setup() {
  const api = new RevisionApi(snapshot({ resumes: [document] }));
  const cache = createTestStorageAdapter();
  const adapter = createCloudStorageAdapter({ api, cache });
  await adapter.initialize();
  return { api, cache, adapter };
}

describe("cloud documents with a degraded browser cache", () => {
  it.each(["read", "write"])("returns downloaded bytes despite a cache %s failure", async (failure) => {
    const { api, cache, adapter } = await setup();
    api.files.set(document.storageKey, new Blob(["cloud bytes"]));
    if (failure === "read") vi.spyOn(cache, "getResumeFile").mockRejectedValue(cacheError);
    if (failure === "write") vi.spyOn(cache, "saveResumeFile").mockRejectedValue(cacheError);
    const download = vi.spyOn(api, "getResumeFile");
    expect(await (await adapter.getResumeFile(document.storageKey))!.text()).toBe("cloud bytes");
    expect(download).toHaveBeenCalledTimes(1);
    expect(adapter.getCacheWarning()).not.toBeNull();
    expect(await adapter.listResumeFiles()).toHaveLength(1);
  });

  it("repairs stale cached bytes without replaying an acknowledged file upload", async () => {
    const { api, cache, adapter } = await setup();
    await cache.saveResumeFile(document.storageKey, new Blob(["old bytes"]));
    const put = vi.spyOn(api, "putResumeFile");
    const write = vi.spyOn(cache, "saveResumeFile").mockRejectedValue(cacheError);
    await adapter.saveResumeFile(document.storageKey, new Blob(["new bytes"]));
    expect(await api.files.get(document.storageKey)!.text()).toBe("new bytes");
    expect(adapter.getCacheWarning()).not.toBeNull();
    write.mockRestore();
    await adapter.repairCache();
    expect(await cache.getResumeFile(document.storageKey)).toBeUndefined();
    expect(await (await adapter.getResumeFile(document.storageKey))!.text()).toBe("new bytes");
    expect(put).toHaveBeenCalledTimes(1);
    expect(adapter.getCacheWarning()).toBeNull();
  });

  it.each(["delete", "clear"])("does not return deleted cached bytes after a cloud %s and cache failure", async (operation) => {
    const { api, cache, adapter } = await setup();
    const file = new Blob(["old bytes"]);
    api.files.set(document.storageKey, file);
    await cache.saveResumeFile(document.storageKey, file);
    vi.spyOn(cache, operation === "delete" ? "deleteResumeFile" : "clearResumeFiles").mockRejectedValue(cacheError);
    const remove = vi.spyOn(api, "deleteResumeFile");
    if (operation === "delete") await adapter.deleteResumeFile(document.storageKey);
    else await adapter.clearResumeFiles();
    expect(api.files.has(document.storageKey)).toBe(false);
    expect(adapter.getCacheWarning()).not.toBeNull();
    const read = vi.spyOn(cache, "getResumeFile");
    vi.spyOn(api, "getResumeFile").mockRejectedValue(new CloudApiError("File missing", 404));
    await expect(adapter.getResumeFile(document.storageKey)).rejects.toThrow("File missing");
    expect(read).not.toHaveBeenCalled();
    await adapter.repairCache();
    expect(await cache.getResumeFile(document.storageKey)).toBeUndefined();
    expect(remove).toHaveBeenCalledTimes(1);
    await expect(adapter.getResumeFile(document.storageKey)).rejects.toThrow("File missing");
  });

  it("keeps genuine upload failures separate from cache failures", async () => {
    const { api, cache, adapter } = await setup();
    vi.spyOn(api, "putResumeFile").mockRejectedValue(new CloudApiError("Upload rejected", 413));
    const write = vi.spyOn(cache, "saveResumeFile");
    await expect(adapter.saveResumeFile(document.storageKey, new Blob(["bytes"]))).rejects.toThrow("Upload rejected");
    expect(write).not.toHaveBeenCalled();
    expect(adapter.getCacheWarning()).toBeNull();
  });

  it("acknowledges child records and document associations, then their deletion despite failed caching", async () => {
    const { api, cache, adapter } = await setup();
    vi.spyOn(cache, "importSnapshot").mockRejectedValue(cacheError);
    const contact = { id: "contact", applicationId: application.id, name: "Contact", createdAt: timestamp, updatedAt: timestamp };
    const round = interview(1);
    const assessment = createAssessment({ applicationId: application.id, type: "coding", proctored: "no", progress: "not-started", result: "pending" }, [], timestamp);
    const letter = { ...document, id: "letter", storageKey: "letter-file" };
    const upload = vi.spyOn(api, "putResumeFile");
    await adapter.commitMutation({
      contacts: [contact], interviews: [round], coverLetters: [letter],
      applications: [{ ...adapter.getCurrentSnapshot().applications[0], resumeId: document.id, coverLetterId: letter.id }],
      creates: { contacts: [contact.id], interviews: [round.id], coverLetters: [letter.id] },
      resumeFiles: [{ storageKey: letter.storageKey, file: new Blob(["letter"]) }],
    });
    expect(adapter.getCurrentSnapshot()).toEqual(api.state.snapshot);
    expect(api.state.snapshot.applications[0]).toMatchObject({ contactsCount: 1, resumeId: document.id, coverLetterId: letter.id });
    expect(api.state.snapshot.contacts).toHaveLength(1);
    expect(api.state.snapshot.interviews).toHaveLength(1);
    await adapter.commitMutation({ assessments: [assessment], creates: { assessments: [assessment.id] } });
    expect(api.state.snapshot.assessments).toHaveLength(1);
    const remove = vi.spyOn(api, "deleteResumeFile");
    await adapter.commitMutation({ deleteCoverLetterIds: [letter.id], deleteResumeFileKeys: [letter.storageKey] });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(api.state.snapshot.coverLetters).toEqual([]);
    expect(api.state.snapshot.applications[0].coverLetterId).toBeUndefined();
    await adapter.deleteApplication(application.id);
    expect(api.state.snapshot).toMatchObject({ applications: [], contacts: [], interviews: [], assessments: [] });
    expect(adapter.getCurrentSnapshot()).toEqual(api.state.snapshot);
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("does not let delayed file caching refill bytes removed by a queued repair", async () => {
    const { api, cache, adapter } = await setup();
    api.files.set(document.storageKey, new Blob(["bytes"]));
    const write = vi.spyOn(cache, "saveResumeFile").mockRejectedValueOnce(cacheError);
    await adapter.getResumeFile(document.storageKey);
    write.mockRestore();
    await Promise.all([
      adapter.getResumeFile(document.storageKey),
      adapter.deleteResumeFile(document.storageKey),
      adapter.repairCache(),
    ]);
    expect(api.files.has(document.storageKey)).toBe(false);
    expect(await cache.getResumeFile(document.storageKey)).toBeUndefined();
    expect(adapter.getCacheWarning()).toBeNull();
  });
});
