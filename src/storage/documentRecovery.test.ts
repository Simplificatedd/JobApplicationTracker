import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequest } from "../../functions/api/[[path]]";
import { DOCUMENT_GRACE_MS, reconcileDocuments } from "../../functions/lib/documentLifecycle";
import { getCloudState } from "../../functions/lib/state";
import { SqliteD1, MemoryR2, documentEnvironment } from "../test/documentServer";
import { createTestStorageAdapter } from "../test/indexedDb";
import { populatedBackup, backupDocument } from "../test/backupFixtures";
import { snapshot } from "../test/assessmentFixtures";
import { base64ToBlob, createFullBackupFile, parseBackupFile } from "../lib/backups";
import { createCloudApiClient, CloudApiError } from "./cloudApi";
import { createCloudStorageAdapter } from "./cloudStorageAdapter";

let db: SqliteD1, r2: MemoryR2;
beforeEach(() => { db = new SqliteD1(); r2 = new MemoryR2(); });
afterEach(() => { db.close(); vi.restoreAllMocks(); });
const user = { id: "local:student@example.edu", email: "student@example.edu" };
async function setup() {
  const env = { ...documentEnvironment(db, r2), LOCAL_DEV_AUTH_EMAIL: user.email };
  let lostSave: "before" | "after" | null = null;
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const request = new Request(String(input), { ...init, headers: { ...init?.headers, Origin: "http://127.0.0.1:8788" } });
    const stateWrite = request.method === "PUT" && new URL(request.url).pathname === "/api/state";
    if (stateWrite && lostSave === "before") throw new Error("Network interrupted");
    const response = await onRequest({ request, env } as never);
    if (stateWrite && lostSave === "after" && response.ok) throw new Error("Lost acknowledgement");
    return response;
  });
  const api = createCloudApiClient({ baseUrl: "http://127.0.0.1:8788/api", fetcher, retryDelays: [] });
  const cache = createTestStorageAdapter();
  const adapter = createCloudStorageAdapter({ api, cache, legacyCache: createTestStorageAdapter() });
  await adapter.initialize();
  const original = backupDocument("original");
  await adapter.saveResume(original.metadata, original.record.file);
  const before = await getCloudState(env.DB, user.id);
  const backup = await parseBackupFile(await createFullBackupFile(populatedBackup()));
  const files = [...backup.resumeFiles, ...backup.coverLetterFiles].map((payload) => ({
    storageKey: payload.storageKey, file: base64ToBlob(payload.dataBase64, payload.mimeType),
  }));
  return { env, api, cache, adapter, original, before, backup, files, fetcher, loseSave: (when: "before" | "after") => { lostSave = when; } };
}

describe("document recovery through the actual cloud API and SQLite persistence", () => {
  it("restores metadata-only backups even after their original storage keys were retired", async () => {
    const { adapter, original, env } = await setup();
    await adapter.commitMutation({ deleteResumeIds: [original.metadata.id], deleteResumeFileKeys: [original.metadata.storageKey] });
    const metadataOnly = await parseBackupFile(await createFullBackupFile({
      snapshot: snapshot({
        resumes: [{ ...original.metadata, fileSize: 0 }],
        applications: [{ ...snapshot().applications[0], resumeId: original.metadata.id }],
      }), resumeFiles: [],
    }));
    await expect(adapter.importSnapshot(metadataOnly.snapshot)).resolves.toBeUndefined();
    const committed = await getCloudState(env.DB, user.id);
    expect(committed!.snapshot.resumes[0]).toMatchObject({ id: original.metadata.id, fileSize: 0, storageKey: expect.stringMatching(/^restore-/) });
    expect(committed!.snapshot.resumes[0].storageKey).not.toBe(original.metadata.storageKey);
    expect(committed!.snapshot.applications[0].resumeId).toBe(original.metadata.id);
    expect(r2.files.size).toBe(0);
  });

  it("keeps a confirmed deletion successful despite cleanup/cache failures and retries without a new snapshot", async () => {
    const { api, cache, adapter, original, env } = await setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    r2.beforeDelete = async () => { throw new Error("R2 unavailable"); };
    vi.spyOn(cache, "importSnapshot").mockRejectedValue(new Error("Cache quota"));
    await expect(adapter.commitMutation({ deleteResumeIds: [original.metadata.id], deleteResumeFileKeys: [original.metadata.storageKey] })).resolves.toBeUndefined();
    expect(adapter.getCurrentSnapshot().resumes).toEqual([]);
    expect(adapter.getCacheWarning()).not.toBeNull();
    expect(adapter.getDocumentCleanupWarning()).toContain("cleanup failed");
    const revision = (await getCloudState(env.DB, user.id))!.revision;
    const save = vi.spyOn(api, "saveState"), put = vi.spyOn(api, "putResumeFile"), cleanup = vi.spyOn(api, "reconcileDocuments");
    await adapter.repairCache();
    expect(cleanup).not.toHaveBeenCalled();
    r2.beforeDelete = undefined;
    await adapter.retryDocumentCleanup();
    expect(adapter.getDocumentCleanupWarning()).toBeNull();
    expect((await getCloudState(env.DB, user.id))!.revision).toBe(revision);
    expect(save).not.toHaveBeenCalled(); expect(put).not.toHaveBeenCalled();
    expect(r2.files.size).toBe(0);
  });

  it.each(["before", "after"] as const)("reconciles an ambiguous restore using committed references (response lost %s persistence)", async (when) => {
    const { adapter, env, before, backup, files, loseSave } = await setup();
    loseSave(when);
    await expect(adapter.importSnapshot(backup.snapshot, files)).rejects.toThrow("unconfirmed");
    expect(r2.files.size).toBe(3);
    await reconcileDocuments(env, user, Date.now() + 2 * DOCUMENT_GRACE_MS);
    const authoritative = await getCloudState(env.DB, user.id);
    if (when === "before") {
      expect(authoritative).toEqual(before);
      expect(r2.files.size).toBe(1);
    } else {
      expect(authoritative!.snapshot.resumes[0].storageKey).toMatch(/^restore-/);
      expect(authoritative!.snapshot.applications).toEqual(backup.snapshot.applications);
      expect(r2.files.size).toBe(2);
    }
    for (const doc of [...authoritative!.snapshot.resumes, ...authoritative!.snapshot.coverLetters]) {
      expect(r2.files.has(`${encodeURIComponent(user.id)}/${doc.storageKey}`)).toBe(true);
    }
  });

  it("recovers partial restore uploads without changing the old committed snapshot or files", async () => {
    const { adapter, env, before, backup, files, original } = await setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    let uploads = 0;
    r2.beforePut = async () => { if (++uploads === 2) throw new Error("Upload interrupted"); };
    await expect(adapter.importSnapshot(backup.snapshot, files)).rejects.toThrow();
    expect(await getCloudState(env.DB, user.id)).toEqual(before);
    expect(r2.files.size).toBe(1);
    expect(await (await adapter.getResumeFile(original.metadata.storageKey))!.text()).toBe("%PDF-original");
  });

  it("rejects a replacement without deleting live files when other pending uploads occupy quota", async () => {
    const { adapter, env, before, backup, files } = await setup();
    const insert = db.sqlite.prepare(`INSERT INTO resume_objects
      (owner_id,storage_key,mime_type,file_size,updated_at,lifecycle,cleanup_after)
      VALUES (?,?,'application/pdf',?,'now','uploading',?)`);
    // Valid durable intents can exist before R2 PUT starts. Fill the remaining
    // budget with such concurrent work; no inconsistent fake file bytes needed.
    for (let i = 0; i < 10; i++) insert.run(user.id, `other-pending-${i}`, 10 * 1024 * 1024 - (i === 0 ? 13 : 0), Date.now() + DOCUMENT_GRACE_MS);
    const put = vi.spyOn(r2, "put"), remove = vi.spyOn(r2, "delete");
    await expect(adapter.importSnapshot(backup.snapshot, files)).rejects.toThrow("100 MB per user");
    expect(await getCloudState(env.DB, user.id)).toEqual(before);
    expect(put).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
    expect(r2.files.size).toBe(1);
  });

  it("fences account invalidation during cleanup and never redirects a retry", async () => {
    const { api, adapter } = await setup();
    vi.spyOn(api, "reconcileDocuments").mockRejectedValue(new CloudApiError("Account changed", 412));
    // Use an explicit handler because Node has no browser reload implementation.
    const changed = vi.fn();
    const isolated = createCloudStorageAdapter({ api, cache: createTestStorageAdapter(), onAccountChanged: changed });
    await expect(isolated.initialize()).rejects.toThrow("Signed-in account changed");
    expect(changed).toHaveBeenCalledTimes(1);
    const cleanup = vi.spyOn(api, "reconcileDocuments");
    await expect(isolated.retryDocumentCleanup()).rejects.toThrow("Signed-in account changed");
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(adapter.getCurrentSnapshot().resumes).toHaveLength(1);
  });
});
