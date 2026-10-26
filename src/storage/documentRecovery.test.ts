import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequest } from "../../functions/api/[[path]]";
import { getCloudState } from "../../functions/lib/state";
import { SqliteD1, MemoryR2, documentEnvironment } from "../test/documentServer";
import { createTestStorageAdapter } from "../test/indexedDb";
import { populatedBackup, backupDocument } from "../test/backupFixtures";
import { snapshot } from "../test/assessmentFixtures";
import { base64ToBlob, createFullBackupFile, parseBackupFile } from "../lib/backups";
import { createCloudApiClient } from "./cloudApi";
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
});
