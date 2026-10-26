import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SqliteD1, MemoryR2, documentEnvironment } from "../../src/test/documentServer";
import { backupDocument } from "../../src/test/backupFixtures";
import { snapshot } from "../../src/test/assessmentFixtures";
import type { StorageSnapshot } from "../../src/storage/StorageAdapter";
import { deleteResumeFile, getResumeFile, putResumeFile } from "./resumeFiles";
import { getCloudState, saveCloudState } from "./state";
import { DOCUMENT_GRACE_MS, documentObjectKey, reconcileDocuments } from "./documentLifecycle";

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
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { resolve, promise };
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

describe("reference-safe deletion and reconciliation", () => {
  it.each(["resume", "cover", "shared", "placeholder"])("protects a committed %s reference", async (kind) => {
    await upload();
    const current = data();
    if (kind === "placeholder") current.resumes[0].fileSize = 0;
    if (kind === "cover" || kind === "shared") current.coverLetters = [{ ...current.resumes[0], id: "cover" }];
    if (kind === "cover") current.resumes = [];
    await save(current);
    const remove = vi.spyOn(r2, "delete");
    await expect(deleteResumeFile(env(), user, "file")).rejects.toMatchObject({ status: 409 });
    await reconcileDocuments(env(), user, Date.now() + 2 * DOCUMENT_GRACE_MS);
    expect(remove).not.toHaveBeenCalled();
    expect(row()?.lifecycle).toBe("ready");
  });

  it("waits for the grace boundary and retires uncommitted uploads without losing retry state", async () => {
    await upload();
    const due = Number(row()?.cleanup_after);
    expect(await reconcileDocuments(env(), user, due - 1)).toMatchObject({ removed: 0, pending: 1 });
    expect(await reconcileDocuments(env(), user, due)).toEqual({ removed: 1, failed: 0, pending: 0 });
    expect(row()?.lifecycle).toBe("deleted");
    expect(row()?.cleanup_after).toBe(due + DOCUMENT_GRACE_MS);
    await expect(upload()).rejects.toMatchObject({ status: 409 });
    await expect(save(data())).rejects.toMatchObject({ status: 409 });
  });

  it("starts a fresh grace period when a replacement snapshot removes an old live file", async () => {
    await upload(); await save(data());
    await save(snapshot({ applications: [] }), 1);
    expect(Number(row()?.cleanup_after)).toBeGreaterThan(Date.now() + DOCUMENT_GRACE_MS - 2000);
    expect(r2.files.has(objectKey())).toBe(true);
    await reconcileDocuments(env(), user, Date.now() + 2 * DOCUMENT_GRACE_MS);
    expect(r2.files.has(objectKey())).toBe(false);
  });

  it.each(["migration", "inventory"])("restarts grace when removing a legacy reference with an expired %s deadline", async (source) => {
    if (source === "migration") {
      db.close();
      db = new SqliteD1((sqlite) => {
        sqlite.prepare("INSERT INTO resume_objects VALUES (?, 'file', 'application/pdf', 13, '2000-01-01')").run(user.id);
        sqlite.prepare("INSERT INTO tracker_state VALUES (?, ?, 1, ?, '2000-01-01', '2000-01-01')")
          .run(user.id, user.email, JSON.stringify(data()));
      });
      // The owner makes no snapshot writes during the initial migration grace.
      db.sqlite.prepare("UPDATE resume_objects SET cleanup_after = ?").run(Date.now() - DOCUMENT_GRACE_MS);
    } else {
      await save(data());
      r2.files.set(objectKey(), { bytes: new TextEncoder().encode("%PDF-original"), mime: "application/pdf", uploaded: new Date(0) });
      await reconcileDocuments(env(), user, Date.now() - 2 * DOCUMENT_GRACE_MS);
    }
    await save(snapshot({ applications: [] }), 1);
    const due = Number(row()?.cleanup_after);
    expect(due).toBeGreaterThan(Date.now() + DOCUMENT_GRACE_MS - 2000);
    const remove = vi.spyOn(r2, "delete");
    await reconcileDocuments(env(), user);
    expect(remove).not.toHaveBeenCalled();
  });

  it("rejects a new reference after the deletion claim but before R2 deletion", async () => {
    await upload(); await save(snapshot({ applications: [] }));
    r2.beforeDelete = async () => {
      await expect(save(data(), 1)).rejects.toMatchObject({ status: 409 });
      expect((await getCloudState(env().DB, user.id))?.snapshot.resumes).toEqual([]);
    };
    await deleteResumeFile(env(), user, "file");
    expect(row()?.lifecycle).toBe("deleted");
    expect((await getCloudState(env().DB, user.id))?.revision).toBe(1);
  });

  it("rechecks references if another commit wins after cleanup selects a candidate", async () => {
    await upload();
    let injected = false;
    db.beforeQuery = (sql) => {
      if (!injected && sql.includes("SET lifecycle = 'deleting'")) {
        injected = true;
        db.sqlite.prepare("INSERT INTO tracker_state VALUES (?, ?, 1, ?, ?, ?)")
          .run(user.id, user.email, JSON.stringify(data()), new Date().toISOString(), new Date().toISOString());
      }
    };
    const remove = vi.spyOn(r2, "delete");
    expect(await reconcileDocuments(env(), user, Date.now() + 2 * DOCUMENT_GRACE_MS)).toMatchObject({ failed: 1 });
    expect(remove).not.toHaveBeenCalled();
    expect(row()?.lifecycle).toBe("ready");
  });

  it.each(["before", "after", "metadata"])("recovers an interrupted delete at %s", async (when) => {
    await upload();
    const fail = async () => { throw new Error("Delete interrupted"); };
    if (when === "before") r2.beforeDelete = fail;
    if (when === "after") r2.afterDelete = fail;
    if (when === "metadata") db.beforeQuery = (sql) => { if (sql.includes("SET lifecycle = 'deleted'")) throw new Error("Delete interrupted"); };
    await expect(deleteResumeFile(env(), user, "file")).rejects.toThrow("Delete interrupted");
    expect(row()?.lifecycle).toBe("deleting");
    await expect(save(data())).rejects.toMatchObject({ status: 409 });
    r2.beforeDelete = undefined; r2.afterDelete = undefined; db.beforeQuery = undefined;
    expect(await reconcileDocuments(env(), user)).toEqual({ removed: 1, failed: 0, pending: 0 });
    await deleteResumeFile(env(), user, "file"); // Idempotent retry.
    expect(row()?.lifecycle).toBe("deleted");
    expect(r2.files.size).toBe(0);
  });

  it.each([false, true])("cleans a PUT that finishes after deletion (worker disappears=%s)", async (disappears) => {
    const entered = deferred(), release = deferred();
    r2.beforePut = async () => { entered.resolve(); await release.promise; };
    if (disappears) r2.afterPut = async () => { throw new Error("Worker disappeared"); };
    const pending = expect(upload()).rejects.toThrow();
    await entered.promise;
    const future = Date.now() + 2 * DOCUMENT_GRACE_MS;
    await reconcileDocuments(env(), user, future);
    expect(row()?.lifecycle).toBe("deleted");
    release.resolve(); await pending;
    expect(r2.files.has(objectKey())).toBe(true);
    await expect(save(data())).rejects.toMatchObject({ status: 409 });
    await reconcileDocuments(env(), user, future + DOCUMENT_GRACE_MS);
    expect(r2.files.size).toBe(0);
  });

  it("preserves a restore committed before its acknowledgement was lost", async () => {
    await upload(); await save(data()); // A real persisted snapshot is authoritative.
    await reconcileDocuments(env(), user, Date.now() + 3 * DOCUMENT_GRACE_MS);
    expect(r2.files.has(objectKey())).toBe(true);
    expect((await getCloudState(env().DB, user.id))?.snapshot.resumes[0].storageKey).toBe("file");
  });
});

describe("legacy inventory and owner boundaries", () => {
  it("bounds cleanup and reports the remaining backlog for subsequent retries", async () => {
    for (let i = 0; i < 30; i++) await upload(`file-${i}`);
    const future = Date.now() + 2 * DOCUMENT_GRACE_MS;
    expect(await reconcileDocuments(env(), user, future)).toEqual({ removed: 25, failed: 0, pending: 5 });
    expect(r2.files.size).toBe(5);
    expect(await reconcileDocuments(env(), user, future)).toEqual({ removed: 5, failed: 0, pending: 0 });
    expect(r2.files.size).toBe(0);
  });

  it("retries durable deletions even when inventory or its operation budget is unavailable", async () => {
    await upload();
    r2.list = async () => { throw new Error("Inventory budget exhausted"); };
    expect(await reconcileDocuments(env(), user, Date.now() + 2 * DOCUMENT_GRACE_MS)).toEqual({ removed: 1, failed: 1, pending: 0 });
    expect(r2.files.size).toBe(0);
    expect(row()?.lifecycle).toBe("deleted");
  });

  it("discovers missing metadata, protects legacy references and waits before deleting other objects", async () => {
    await save(data());
    for (const key of ["file", "orphan"]) r2.files.set(objectKey(key), { bytes: new TextEncoder().encode("%PDF-original"), mime: "application/pdf", uploaded: new Date(0) });
    expect(await reconcileDocuments(env(), user)).toEqual({ removed: 0, failed: 0, pending: 1 });
    expect(row()?.lifecycle).toBe("ready");
    expect(await (await getResumeFile(env(), user, "file")).text()).toBe("%PDF-original");
    await reconcileDocuments(env(), user, Date.now() + 2 * DOCUMENT_GRACE_MS);
    expect(r2.files.has(objectKey())).toBe(true);
    expect(r2.files.has(objectKey("orphan"))).toBe(false);
    await expect(upload()).resolves.toMatchObject({ storageKey: "file" }); // Legacy hash verification.
  });

  it("persists bounded inventory progress and never inventories another owner", async () => {
    for (let i = 0; i < 30; i++) r2.files.set(objectKey(`file-${i}`), { bytes: new Uint8Array([1]), mime: "application/pdf", uploaded: new Date() });
    r2.files.set("other/private", { bytes: new Uint8Array([2]), mime: "application/pdf", uploaded: new Date(0) });
    const list = vi.spyOn(r2, "list");
    expect(await reconcileDocuments(env(), user)).toMatchObject({ pending: 25 });
    expect(db.sqlite.prepare("SELECT cursor FROM document_cleanup_scan").get()?.cursor).toBe("25");
    expect(await reconcileDocuments(env(), user)).toMatchObject({ pending: 30 });
    expect(list.mock.calls.every(([options]) => options.prefix === `${encodeURIComponent(user.id)}/`)).toBe(true);
    expect(db.sqlite.prepare("SELECT COUNT(*) AS n FROM resume_objects").get()?.n).toBe(30);
    expect(r2.files.has("other/private")).toBe(true);
    await deleteResumeFile(env(), { id: "other", email: "other@example.edu" }, "file-0");
    expect(r2.files.has(objectKey("file-0"))).toBe(true);
  });

  it.each([["malformed"], [{}], [{ storageKey: 12 }]])("fails closed on malformed authoritative document metadata (%j)", async (...documents) => {
    await upload();
    db.sqlite.exec("DROP TRIGGER document_references_insert; DROP TRIGGER document_cleanup_insert;");
    db.sqlite.prepare("INSERT INTO tracker_state VALUES (?, ?, 1, ?, ?, ?)")
      .run(user.id, user.email, JSON.stringify({ ...data(), resumes: documents }), "now", "now");
    const remove = vi.spyOn(r2, "delete");
    await expect(reconcileDocuments(env(), user, Date.now() + 2 * DOCUMENT_GRACE_MS)).rejects.toThrow();
    expect(remove).not.toHaveBeenCalled();
  });
});
