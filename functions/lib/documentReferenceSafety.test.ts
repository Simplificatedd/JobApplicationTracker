import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { SqliteD1, MemoryR2, documentEnvironment } from "../../src/test/documentServer";
import { snapshot } from "../../src/test/assessmentFixtures";
import { backupDocument } from "../../src/test/backupFixtures";
import { DOCUMENT_GRACE_MS, removeUnreferencedDocument } from "./documentLifecycle";
import { getCloudState, parseSaveStateRequest, saveCloudState } from "./state";
import { deleteResumeFile, putResumeFile } from "./resumeFiles";

let db: SqliteD1;
const user = { id: "owner", email: "owner@example.edu" };
const references = () => snapshot({ resumes: [backupDocument("file").metadata] });
beforeEach(() => { db = new SqliteD1(); });
afterEach(() => { db.close(); });
const database = () => db as unknown as D1Database;

describe("document reference migration and database fences", () => {
  it("rolls back a failed migration transaction and can retry without altering legacy data", () => {
    db.close(); db = new SqliteD1(undefined, false);
    db.sqlite.prepare("INSERT INTO resume_objects VALUES (?, 'file', 'application/pdf', 13, 'now')").run(user.id);
    const migration = readFileSync(new URL("../../migrations/0003_recoverable_documents.sql", import.meta.url), "utf8");
    db.sqlite.exec("BEGIN");
    expect(() => db.sqlite.exec(`${migration}\nSELECT * FROM missing_table;`)).toThrow("missing_table");
    db.sqlite.exec("ROLLBACK");
    expect(db.sqlite.prepare("PRAGMA table_info(resume_objects)").all().some((column) => column.name === "lifecycle")).toBe(false);
    expect(db.sqlite.prepare("SELECT COUNT(*) AS n FROM resume_objects").get()?.n).toBe(1);
    db.sqlite.exec(`BEGIN;\n${migration}\nCOMMIT;`);
    expect(db.sqlite.prepare("SELECT lifecycle FROM resume_objects").get()?.lifecycle).toBe("ready");
    expect(() => db.sqlite.exec(migration)).toThrow("duplicate column"); // Use the tracked migration runner, not raw replay.
    expect(db.sqlite.prepare("SELECT COUNT(*) AS n FROM resume_objects").get()?.n).toBe(1);
  });

  it("fails closed before touching R2 when the lifecycle migration is missing", async () => {
    db.close(); db = new SqliteD1(undefined, false);
    const bucket = new MemoryR2(), env = documentEnvironment(db, bucket);
    const put = vi.spyOn(bucket, "put"), remove = vi.spyOn(bucket, "delete");
    await expect(putResumeFile(new Request("https://example.test", {
      method: "PUT", body: "%PDF-original", headers: { "Content-Type": "application/pdf" },
    }), env, user, "file")).rejects.toThrow("lifecycle");
    await expect(deleteResumeFile(env, user, "file")).rejects.toThrow("lifecycle");
    expect(put).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
  });

  it("migrates legacy rows without changing their contents, identity or snapshot revision", async () => {
    db.close();
    db = new SqliteD1((sqlite) => {
      sqlite.prepare("INSERT INTO resume_objects VALUES (?, 'file', 'application/pdf', 13, '2000-01-01')").run(user.id);
      sqlite.prepare("INSERT INTO tracker_state VALUES (?, ?, 7, ?, '2000-01-01', '2000-01-01')")
        .run(user.id, user.email, JSON.stringify(references()));
    });
    const row = db.sqlite.prepare("SELECT * FROM resume_objects").get();
    expect(row).toMatchObject({ lifecycle: "ready", content_hash: null, file_size: 13, storage_key: "file" });
    expect(Number(row?.cleanup_after)).toBeGreaterThan(Date.now() + DOCUMENT_GRACE_MS - 2000);
    expect((await getCloudState(database(), user.id))?.revision).toBe(7);
  });

  it("rolls back a deletion claim when a committed snapshot already references the file", async () => {
    db.sqlite.prepare("INSERT INTO resume_objects (owner_id,storage_key,mime_type,file_size,updated_at) VALUES (?, 'file','application/pdf',13,'now')").run(user.id);
    await saveCloudState(database(), user, { baseRevision: null, snapshot: references() });
    expect(() => db.sqlite.prepare("UPDATE resume_objects SET lifecycle='deleting'").run()).toThrow("document_lifecycle_conflict");
    expect(db.sqlite.prepare("SELECT lifecycle FROM resume_objects").get()?.lifecycle).toBe("ready");
  });

  it("does not advance a revision or revive a key after deletion has claimed it", async () => {
    db.sqlite.prepare("INSERT INTO resume_objects (owner_id,storage_key,mime_type,file_size,updated_at) VALUES (?, 'file','application/pdf',13,'now')").run(user.id);
    await saveCloudState(database(), user, { baseRevision: null, snapshot: snapshot({ resumes: [] }) });
    await removeUnreferencedDocument({ DB: database(), RESUME_FILES: { delete: async () => {} } as unknown as R2Bucket }, user, "file");
    await expect(saveCloudState(database(), user, { baseRevision: 1, snapshot: references() })).rejects.toMatchObject({ status: 409 });
    expect((await getCloudState(database(), user.id))?.revision).toBe(1);
    expect((await getCloudState(database(), user.id))?.snapshot.resumes).toEqual([]);
  });

  it.each([{}, { storageKey: null }, { storageKey: " " }])("rejects unverifiable new document references before persistence (%j)", (document) => {
    expect(() => parseSaveStateRequest(JSON.stringify({ baseRevision: null, snapshot: { ...snapshot(), resumes: [document] } }))).toThrow("invalid shape");
  });
});
