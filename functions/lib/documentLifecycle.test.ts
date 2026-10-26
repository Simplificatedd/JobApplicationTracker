import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SqliteD1, MemoryR2, documentEnvironment } from "../../src/test/documentServer";
import { backupDocument } from "../../src/test/backupFixtures";
import { snapshot } from "../../src/test/assessmentFixtures";
import type { StorageSnapshot } from "../../src/storage/StorageAdapter";
import { getResumeFile, putResumeFile } from "./resumeFiles";
import { getCloudState, saveCloudState } from "./state";
import { documentObjectKey } from "./documentLifecycle";

const user = { id: "owner/界", email: "owner@example.edu" };
let db: SqliteD1, r2: MemoryR2;
beforeEach(() => { db = new SqliteD1(); r2 = new MemoryR2(); });
afterEach(() => { db.close(); });
const env = () => documentEnvironment(db, r2);
const objectKey = (key = "file") => documentObjectKey(user, key);
const row = (key = "file") => db.sqlite.prepare("SELECT * FROM resume_objects WHERE owner_id = ? AND storage_key = ?").get(user.id, key);
const data = (key = "file") => snapshot({ applications: [], resumes: [backupDocument(key).metadata] });
const upload = (key = "file", bytes = "%PDF-original") => putResumeFile(new Request("https://example.test", {
  method: "PUT", headers: { "Content-Type": "application/pdf" }, body: bytes,
}), env(), user, key);
async function save(value: StorageSnapshot, revision: number | null = null) {
  return saveCloudState(env().DB, user, { snapshot: value, baseRevision: revision });
}
describe("durable document uploads", () => {
  it("persists real bytes, commits associations and clears the orphan deadline", async () => {
    await upload();
    expect(row()?.lifecycle).toBe("ready");
    expect(row()?.content_hash).toMatch(/^[a-f0-9]{64}$/);
    await save(data());
    expect(row()?.cleanup_after).toBeNull();
    expect(await (await getResumeFile(env(), user, "file")).text()).toBe("%PDF-original");
    expect(r2.files.has(objectKey())).toBe(true);
  });

  it("makes same-content retries idempotent and rejects same-size different-content overwrite", async () => {
    const put = vi.spyOn(r2, "put");
    await upload(); await save(data()); await upload();
    expect(put).toHaveBeenCalledTimes(1);
    await expect(upload("file", "%PDF-differnt")).rejects.toMatchObject({ status: 409 });
    expect(await (await getResumeFile(env(), user, "file")).text()).toBe("%PDF-original");
    expect((await getCloudState(env().DB, user.id))?.revision).toBe(1);
  });

  it("recovers a lost PUT acknowledgement without replacing bytes or duplicating metadata", async () => {
    r2.afterPut = async () => { r2.afterPut = undefined; throw new Error("Lost response"); };
    await expect(upload()).rejects.toThrow("Lost response");
    expect(row()?.lifecycle).toBe("uploading");
    await upload();
    expect(row()?.lifecycle).toBe("ready");
    expect(r2.files.size).toBe(1);
    expect(db.sqlite.prepare("SELECT COUNT(*) AS n FROM resume_objects").get()?.n).toBe(1);
  });

  it("accepts an identical retry when another request commits the upload before intent insertion", async () => {
    r2.afterPut = async () => { r2.afterPut = undefined; throw new Error("Lost response"); };
    await expect(upload()).rejects.toThrow("Lost response");
    let committed = false;
    db.beforeQuery = (sql) => {
      if (!committed && sql.includes("INSERT INTO resume_objects")) {
        committed = true;
        db.sqlite.prepare("UPDATE resume_objects SET lifecycle = 'ready'").run();
        db.sqlite.prepare("INSERT INTO tracker_state VALUES (?, ?, 1, ?, ?, ?)")
          .run(user.id, user.email, JSON.stringify(data()), new Date().toISOString(), new Date().toISOString());
      }
    };
    await expect(upload()).resolves.toMatchObject({ storageKey: "file" });
    expect((await getCloudState(env().DB, user.id))?.snapshot.resumes[0].storageKey).toBe("file");
    expect(r2.files.size).toBe(1);
  });

  it.each([false, true])("rejects mismatched R2 size before hashing unknown contents (legacy metadata=%s)", async (legacy) => {
    r2.files.set(objectKey(), { bytes: new TextEncoder().encode("%PDF-original"), mime: "application/pdf", uploaded: new Date() });
    if (legacy) db.sqlite.prepare(`INSERT INTO resume_objects
      (owner_id,storage_key,mime_type,file_size,updated_at) VALUES (?, 'file', 'application/pdf', 13, 'now')`).run(user.id);
    const read = vi.fn(async () => { throw new Error("Unbounded body read"); });
    vi.spyOn(r2, "get").mockResolvedValue({ size: 20 * 1024 * 1024, body: new Blob().stream(), arrayBuffer: read });
    await expect(upload()).rejects.toMatchObject({ status: 409 });
    expect(read).not.toHaveBeenCalled();
    expect(new TextDecoder().decode(r2.files.get(objectKey())!.bytes)).toBe("%PDF-original");
  });

  it("records an orphan when metadata finalization fails after R2 PUT", async () => {
    db.beforeQuery = (sql) => { if (sql.includes("SET lifecycle = 'ready'")) throw new Error("D1 interrupted"); };
    await expect(upload()).rejects.toThrow("D1 interrupted");
    expect(r2.files.has(objectKey())).toBe(true);
    expect(row()?.lifecycle).toBe("uploading");
    db.beforeQuery = undefined;
    await upload();
    expect(row()?.lifecycle).toBe("ready");
    expect(r2.files.size).toBe(1);
  });

  it("does not touch R2 when the durable intent cannot be recorded", async () => {
    const put = vi.spyOn(r2, "put");
    db.beforeQuery = (sql) => { if (sql.includes("INSERT INTO resume_objects")) throw new Error("D1 unavailable"); };
    await expect(upload()).rejects.toThrow("D1 unavailable");
    expect(put).not.toHaveBeenCalled();
  });

  it("serializes competing different-content uploads under one key", async () => {
    const results = await Promise.allSettled([upload(), upload("file", "%PDF-differnt")]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((item) => item.status === "rejected")).toHaveLength(1);
    expect(r2.files.size).toBe(1);
    expect(row()?.lifecycle).toBe("ready");
  });

  it("does not overwrite an R2 object that predates its missing D1 metadata", async () => {
    r2.files.set(objectKey(), { bytes: new TextEncoder().encode("%PDF-differnt"), mime: "application/pdf", uploaded: new Date() });
    await expect(upload()).rejects.toMatchObject({ status: 409 });
    expect(new TextDecoder().decode(r2.files.get(objectKey())!.bytes)).toBe("%PDF-differnt");
  });

  it("does not poison an authoritative legacy reference when its object metadata is missing", async () => {
    await save(data());
    await expect(upload()).rejects.toThrow();
    expect(row()).toBeUndefined();
    await expect(save(data(), 1)).resolves.toMatchObject({ revision: 2 });
  });
});
