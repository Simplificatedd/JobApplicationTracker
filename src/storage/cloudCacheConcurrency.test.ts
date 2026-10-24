import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import { application, snapshot, timestamp } from "../test/assessmentFixtures";
import { createTestStorageAdapter } from "../test/indexedDb";
import { RevisionApi } from "../test/revisionApi";
import { createCloudStorageAdapter } from "./cloudStorageAdapter";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

async function sessions() {
  const api = new RevisionApi(snapshot());
  const indexedDb = new IDBFactory();
  const options = { indexedDb, databaseName: "shared-account-cache" };
  const cacheA = createTestStorageAdapter(options);
  const cacheB = createTestStorageAdapter(options);
  const a = createCloudStorageAdapter({ api, cache: cacheA });
  const b = createCloudStorageAdapter({ api, cache: cacheB });
  await a.initialize();
  await b.initialize();
  return { api, a, b, cacheA, cacheB };
}

describe("independent tabs sharing one account cache", () => {
  it("does not restore records deleted by another tab when repairing an older acknowledged state", async () => {
    const { api, a, b, cacheA } = await sessions();
    await b.deleteApplication(application.id);
    const save = vi.spyOn(api, "saveState");
    const fetch = vi.spyOn(api, "getState");
    await a.repairCache();
    expect((await cacheA.exportSnapshot()).applications).toEqual([]);
    expect(api.state.snapshot.applications).toEqual([]);
    expect(a.getCurrentSnapshot().applications).toHaveLength(1);
    expect(save).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not let an older successful save response overwrite a newer cached commit", async () => {
    const { api, a, b, cacheA } = await sessions();
    const originalSave = api.saveState.bind(api);
    const saved = deferred<void>();
    const release = deferred<void>();
    let calls = 0;
    vi.spyOn(api, "saveState").mockImplementation(async (...args) => {
      const response = await originalSave(...args);
      if (++calls === 1) { saved.resolve(); await release.promise; }
      return response;
    });
    const first = a.updateApplication({ ...application, notes: "A notes" });
    await saved.promise;
    await b.updateApplication({ ...application, company: "B company" });
    release.resolve();
    await first;
    expect((await cacheA.exportSnapshot()).applications[0]).toMatchObject({ company: "B company", notes: "A notes" });
    expect(a.getCurrentSnapshot().applications[0].company).toBe(application.company);
    expect(api.state.snapshot.applications[0].company).toBe("B company");
  });

  it("does not recache a delayed download after another tab removes its document", async () => {
    const { api, a, b, cacheA } = await sessions();
    const document = { id: "doc", displayName: "Resume", originalFileName: "r.pdf", downloadFileName: "r.pdf", fileExtension: "pdf" as const, mimeType: "application/pdf", fileSize: 5, storageKey: "old-file", contentHash: "hash", uploadedAt: timestamp, updatedAt: timestamp };
    await a.createResumeMetadata(document);
    // Bring B to the document revision through a normal conflict/rebase.
    await b.updateApplication({ ...application, notes: "B notes" });
    const download = deferred<Blob>();
    const started = deferred<void>();
    vi.spyOn(api, "getResumeFile").mockImplementation(() => { started.resolve(); return download.promise; });
    const reading = a.getResumeFile(document.storageKey);
    await started.promise;
    await b.commitMutation({ deleteResumeIds: [document.id], deleteResumeFileKeys: [document.storageKey] });
    download.resolve(new Blob(["old bytes"]));
    await reading;
    expect(await cacheA.getResumeFile(document.storageKey)).toBeUndefined();
    expect((await cacheA.exportSnapshot()).resumes).toEqual([]);
  });
});
