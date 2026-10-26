import { describe, expect, it, vi } from "vitest";
import { base64ToBlob, createFullBackupFile, parseBackupFile } from "../lib/backups";
import { backupDocument, populatedBackup } from "../test/backupFixtures";
import { application, snapshot } from "../test/assessmentFixtures";
import { createTestStorageAdapter } from "../test/indexedDb";
import { RevisionApi } from "../test/revisionApi";
import { createCloudStorageAdapter } from "./cloudStorageAdapter";
import { CloudApiError, CloudRevisionConflictError } from "./cloudApi";
import { normalizeSnapshot } from "./normalizeSnapshot";
import { MAX_RESUME_FILE_BYTES } from "../lib/resumeFiles";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function setup() {
  const original = backupDocument("resume", "%PDF-original committed bytes");
  const api = new RevisionApi(snapshot({ resumes: [original.metadata], applications: [{ ...application, resumeId: original.metadata.id }] }));
  api.files.set(original.metadata.storageKey, original.record.file);
  const cache = createTestStorageAdapter();
  const changed = vi.fn();
  const adapter = createCloudStorageAdapter({ api, cache, onAccountChanged: changed });
  await adapter.initialize();
  const before = structuredClone(api.state);
  const restored = populatedBackup();
  // Same original key, different contents: this previously overwrote live files.
  const parsed = await parseBackupFile(await createFullBackupFile(restored));
  const files = [...parsed.resumeFiles, ...parsed.coverLetterFiles].map((payload) => ({ storageKey: payload.storageKey, file: base64ToBlob(payload.dataBase64, payload.mimeType) }));
  const upload = vi.spyOn(api, "putResumeFile");
  const save = vi.spyOn(api, "saveState");
  const remove = vi.spyOn(api, "deleteResumeFile");
  async function assertOriginal() {
    expect(api.state).toEqual(before);
    expect(await api.files.get(original.metadata.storageKey)!.text()).toBe(await original.record.file.text());
    expect((await cache.exportSnapshot()).applications[0].resumeId).toBe(original.metadata.id);
  }
  return { api, adapter, cache, changed, before, original, parsed, files, upload, save, remove, assertOriginal };
}

describe("backup restore persistence and failure boundaries", () => {
  it("restores real exported data, documents and associations to cloud/cache and survives refresh", async () => {
    const { api, adapter, cache, parsed, files, original } = await setup();
    await adapter.importSnapshot(parsed.snapshot, files);
    const committed = adapter.getCurrentSnapshot();
    expect(committed).toEqual(api.state.snapshot);
    const keys = [...committed.resumes, ...committed.coverLetters].map((doc) => doc.storageKey);
    expect(keys.every((key) => /^restore-[a-f0-9-]{36}$/.test(key))).toBe(true);
    expect(committed.applications).toEqual(parsed.snapshot.applications);
    expect(committed.contacts).toEqual(parsed.snapshot.contacts);
    expect(committed.resumes[0]).toEqual({ ...parsed.snapshot.resumes[0], storageKey: keys[0] });
    expect(committed.coverLetters[0]).toEqual({ ...parsed.snapshot.coverLetters[0], storageKey: keys[1] });
    expect(await (await adapter.getResumeFile(keys[0]))!.text()).toBe("%PDF-original");
    expect(await (await adapter.getResumeFile(keys[1]))!.text()).toBe("%PDF-cover");
    expect(await api.files.get(original.metadata.storageKey)!.text()).toBe(await original.record.file.text());
    expect((await cache.exportSnapshot()).resumes).toEqual(committed.resumes);
    await adapter.refresh();
    expect(adapter.getCurrentSnapshot()).toEqual(committed);
    await adapter.importSnapshot(parsed.snapshot, files);
    expect(api.state.snapshot.resumes).toHaveLength(1);
    expect(api.state.snapshot.applications).toEqual(parsed.snapshot.applications);
  });

  it("restores an empty workspace while retaining old files until reconciliation", async () => {
    const { api, adapter, remove } = await setup();
    const empty = await parseBackupFile(await createFullBackupFile({ snapshot: snapshot({ applications: [] }), resumeFiles: [] }));
    await adapter.importSnapshot(empty.snapshot);
    expect(api.state.snapshot.applications).toEqual([]);
    expect(api.state.snapshot.resumes).toEqual([]);
    expect(remove).not.toHaveBeenCalled();
  });

  it("preserves metadata-only legacy documents and their application links", async () => {
    const { api, adapter } = await setup();
    const doc = backupDocument("missing").metadata;
    await adapter.importSnapshot(snapshot({ resumes: [{ ...doc, fileSize: 0 }], applications: [{ ...application, resumeId: doc.id }] }));
    expect(api.state.snapshot.resumes[0]).toEqual({ ...doc, fileSize: 0 });
    expect(api.state.snapshot.applications[0].resumeId).toBe(doc.id);
  });

  it.each([0, 1])("compensates a partial upload failure at index %i without touching committed files", async (failure) => {
    const { api, adapter, parsed, files, upload, save, remove, assertOriginal } = await setup();
    const put = (key: string, file: Blob) => RevisionApi.prototype.putResumeFile.call(api, key, file);
    let index = 0;
    upload.mockImplementation(async (key, file) => {
      await put(key, file); // Upload may succeed even when its response is lost.
      if (index++ === failure) throw new Error("Upload interrupted");
    });
    await expect(adapter.importSnapshot(parsed.snapshot, files)).rejects.toThrow("Upload interrupted");
    expect(save).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledTimes(failure + 1);
    expect(api.files.size).toBe(1);
    await assertOriginal();
  });

  it("reports failed compensation and preserves committed data", async () => {
    const { api, adapter, parsed, files, upload, remove, assertOriginal } = await setup();
    upload.mockRejectedValueOnce(new Error("Upload failed"));
    remove.mockRejectedValue(new Error("Cleanup failed"));
    await expect(adapter.importSnapshot(parsed.snapshot, files)).rejects.toThrow("staged files could not be removed");
    expect(api.files.has("resume")).toBe(true);
    await assertOriginal();
  });

  it.each([413, 507])("handles cloud quota errors without risking committed files (%i)", async (status) => {
    const { api, adapter, parsed, files, save, remove, assertOriginal } = await setup();
    save.mockRejectedValue(new CloudApiError("Cloud capacity exhausted", status));
    await expect(adapter.importSnapshot(parsed.snapshot, files)).rejects.toThrow("Cloud capacity exhausted");
    // 507 is ambiguous: a proxy/server error might hide a commit.
    expect(remove).toHaveBeenCalledTimes(status < 500 ? 2 : 0);
    expect(api.files.size).toBe(status < 500 ? 1 : 3);
    await assertOriginal();
  });

  it.each([false, true])("retains staged files on an unconfirmed save (actually committed=%s)", async (committed) => {
    const { api, adapter, parsed, files, save, remove, before, original } = await setup();
    const persist = RevisionApi.prototype.saveState.bind(api);
    save.mockImplementation(async (data, revision) => {
      if (committed) await persist(data, revision);
      throw new CloudApiError("Lost save response", 0);
    });
    await expect(adapter.importSnapshot(parsed.snapshot, files)).rejects.toThrow("Reload and inspect cloud data");
    expect(remove).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
    expect(await api.files.get(original.metadata.storageKey)!.text()).toBe(await original.record.file.text());
    if (committed) {
      for (const doc of [...api.state.snapshot.resumes, ...api.state.snapshot.coverLetters]) expect(api.files.has(doc.storageKey)).toBe(true);
      await adapter.refresh();
      expect(adapter.getCurrentSnapshot()).toEqual(api.state.snapshot);
    } else expect(api.state).toEqual(before);
  });

  it("reports an unconfirmed attachment-free restore without replaying or implying rejection", async () => {
    const { adapter, api, save, remove } = await setup();
    const persist = RevisionApi.prototype.saveState.bind(api);
    save.mockImplementation(async (data, revision) => {
      await persist(data, revision);
      throw new CloudApiError("Server response lost", 0);
    });
    await expect(adapter.importSnapshot(snapshot({ applications: [] }))).rejects.toThrow("Reload and inspect cloud data");
    expect(api.state.snapshot.applications).toEqual([]);
    expect(save).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
  });

  it("reports cloud success when cache persistence fails and repairs without replaying the restore", async () => {
    const { adapter, api, cache, parsed, files, save, upload } = await setup();
    const cacheWrite = vi.spyOn(cache, "importSnapshot").mockRejectedValue(new Error("QuotaExceededError"));
    await expect(adapter.importSnapshot(parsed.snapshot, files)).resolves.toBeUndefined();
    expect(adapter.getCurrentSnapshot()).toEqual(api.state.snapshot);
    expect(adapter.getCacheWarning()).toContain("Browser cache is unavailable");
    const restored = api.state.snapshot;
    cacheWrite.mockRestore();
    await adapter.repairCache();
    expect(adapter.getCacheWarning()).toBeNull();
    expect(save).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(2);
    expect((await cache.exportSnapshot()).applications).toEqual(restored.applications);
    // Repair can omit cached files: reads recover them from authoritative R2.
    expect(await (await adapter.getResumeFile(restored.resumes[0].storageKey))!.text()).toBe("%PDF-original");
  });

  it.each(["upload", "save"] as const)("fences an account change during %s without publishing or cleaning another account", async (during) => {
    const { adapter, api, cache, parsed, files, upload, save, remove, changed, before } = await setup();
    if (during === "upload") upload.mockRejectedValueOnce(new CloudApiError("Account mismatch", 412));
    else save.mockRejectedValueOnce(new CloudApiError("Account mismatch", 412));
    const cacheWrite = vi.spyOn(cache, "importSnapshot");
    await expect(adapter.importSnapshot(parsed.snapshot, files)).rejects.toThrow("Signed-in account changed");
    expect(changed).toHaveBeenCalledTimes(1);
    expect(api.state).toEqual(before);
    expect(remove).not.toHaveBeenCalled();
    expect(cacheWrite).not.toHaveBeenCalled();
    await expect(adapter.exportSnapshot()).rejects.toThrow("Signed-in account changed");
  });

  it("rejects a concurrent remote edit after staging without replacing cloud data or live bytes", async () => {
    const { adapter, api, parsed, files, upload, remove, original } = await setup();
    const put = (key: string, file: Blob) => RevisionApi.prototype.putResumeFile.call(api, key, file);
    upload.mockImplementation(async (key, file) => {
      await put(key, file);
      api.state = { ...api.state, revision: api.state.revision + 1, snapshot: { ...api.state.snapshot, settings: { ...api.state.snapshot.settings, quickLocation: "Other session" } } };
    });
    await expect(adapter.importSnapshot(parsed.snapshot, files)).rejects.toThrow("Workspace changed");
    expect(api.state.snapshot.settings.quickLocation).toBe("Other session");
    expect(await api.files.get(original.metadata.storageKey)!.text()).toBe(await original.record.file.text());
    expect(remove).toHaveBeenCalledTimes(2);
    expect(api.files.size).toBe(1);
  });

  it("retries an equivalent revision conflict without reuploading", async () => {
    const { adapter, api, parsed, files, save, upload, remove } = await setup();
    save.mockImplementationOnce(async () => {
      api.state = { ...api.state, revision: api.state.revision + 1 };
      throw new CloudRevisionConflictError(structuredClone(api.state));
    });
    await adapter.importSnapshot(parsed.snapshot, files);
    expect(save).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(remove).not.toHaveBeenCalled();
    expect(adapter.getCurrentSnapshot()).toEqual(api.state.snapshot);
  });

  it("does not clean files after an equivalent conflict followed by an ambiguous successful retry", async () => {
    const { adapter, api, parsed, files, save, remove } = await setup();
    const persist = RevisionApi.prototype.saveState.bind(api);
    save.mockImplementationOnce(async () => {
      api.state = { ...api.state, revision: api.state.revision + 1 };
      throw new CloudRevisionConflictError(structuredClone(api.state));
    }).mockImplementationOnce(async (data, revision) => {
      await persist(data, revision);
      throw new CloudApiError("Lost acknowledgement", 0);
    });
    await expect(adapter.importSnapshot(parsed.snapshot, files)).rejects.toThrow("unconfirmed");
    expect(remove).not.toHaveBeenCalled();
    for (const document of api.state.snapshot.resumes) expect(api.files.has(document.storageKey)).toBe(true);
  });

  it("bounds equivalent conflict retries and compensates after exhaustion", async () => {
    const { adapter, api, parsed, files, save, upload, remove, original } = await setup();
    save.mockImplementation(async () => {
      api.state = { ...api.state, revision: api.state.revision + 1 };
      throw new CloudRevisionConflictError(structuredClone(api.state));
    });
    await expect(adapter.importSnapshot(parsed.snapshot, files)).rejects.toThrow("changed repeatedly");
    expect(save).toHaveBeenCalledTimes(3);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(api.state.snapshot.resumes[0].storageKey).toBe(original.metadata.storageKey);
  });

  it("serializes settings writes behind a pending restore and rebases their field intent", async () => {
    const { adapter, api, parsed, files, upload } = await setup();
    const entered = deferred(), release = deferred();
    const put = (key: string, file: Blob) => RevisionApi.prototype.putResumeFile.call(api, key, file);
    upload.mockImplementationOnce(async (key, file) => { entered.resolve(); await release.promise; await put(key, file); });
    const restore = adapter.importSnapshot(parsed.snapshot, files);
    await entered.promise;
    const settings = await adapter.getSettings();
    const edit = adapter.saveSettings({ ...settings, quickLocation: "After restore" });
    release.resolve();
    await Promise.all([restore, edit]);
    expect(api.state.snapshot.settings.quickLocation).toBe("After restore");
    expect(api.state.snapshot.resumes[0].storageKey).toMatch(/^restore-/);
  });

  it("freezes the incoming snapshot before asynchronous initialization can mutate the caller's data", async () => {
    const { adapter, parsed, files } = await setup();
    const pending = adapter.importSnapshot(parsed.snapshot, files);
    parsed.snapshot.applications[0].notes = "Caller changed after invocation";
    await pending;
    expect(adapter.getCurrentSnapshot().applications[0].notes).not.toBe("Caller changed after invocation");
  });

  it.each(["missing", "duplicate", "size", "mime", "signature", "oversized"] as const)("rejects %s document data before side effects", async (damage) => {
    const { adapter, parsed, files, upload, save, assertOriginal } = await setup();
    if (damage === "missing") files.pop();
    if (damage === "duplicate") files.push(files[0]);
    if (damage === "size") parsed.snapshot.resumes[0].fileSize++;
    if (damage === "mime") files[0].file = new Blob(["%PDF-original"], { type: "application/zip" });
    if (damage === "signature") files[0].file = new Blob(["wrong contents"], { type: "application/pdf" });
    if (damage === "oversized") files[0].file = new Blob(["x".repeat(MAX_RESUME_FILE_BYTES + 1)], { type: "application/pdf" });
    await expect(adapter.importSnapshot(parsed.snapshot, files)).rejects.toThrow();
    expect(save).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled();
    await assertOriginal();
  });

  it("preserves live files when replacement staging exceeds available physical quota", async () => {
    const { adapter, api, parsed, files, upload, save, assertOriginal } = await setup();
    upload.mockImplementation(async (key, file) => {
      const used = [...api.files.values()].reduce((sum, stored) => sum + stored.size, 0);
      if (used + file.size > 45) throw new CloudApiError("Cloud document quota exhausted", 413);
      await RevisionApi.prototype.putResumeFile.call(api, key, file);
    });
    await expect(adapter.importSnapshot(parsed.snapshot, files)).rejects.toThrow("quota exhausted");
    expect(save).not.toHaveBeenCalled();
    expect(api.files.size).toBe(1);
    await assertOriginal();
  });

  it("fences a late successful upload after another operation detects account switching", async () => {
    const { adapter, api, parsed, files, upload, save, remove, cache, changed } = await setup();
    const entered = deferred(), release = deferred();
    upload.mockImplementationOnce(async (key, file) => {
      entered.resolve(); await release.promise;
      await RevisionApi.prototype.putResumeFile.call(api, key, file);
    });
    const cacheWrite = vi.spyOn(cache, "importSnapshot");
    const pending = expect(adapter.importSnapshot(parsed.snapshot, files)).rejects.toThrow("Signed-in account changed");
    await entered.promise;
    vi.spyOn(api, "getSession").mockResolvedValue({ id: "other", email: "other@example.edu" });
    await expect(adapter.listApplications()).rejects.toThrow("Signed-in account changed");
    release.resolve(); await pending;
    expect(changed).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(cacheWrite).not.toHaveBeenCalled();
  });

  it("restores a legacy snapshot only after migration and uses the migrated committed result", async () => {
    const { adapter, api } = await setup();
    const legacy = snapshot({ dataVersion: 1, applications: [{ ...application, status: "Offered" }] });
    await adapter.importSnapshot(legacy);
    expect(api.state.snapshot).toMatchObject(normalizeSnapshot(legacy));
    expect(api.state.snapshot.applications[0].status).toBe("Accepted");
  });
});
