import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequestControl } from "../../src/test/requestControl";
import type { CloudflareEnv } from "./types";
import { onRequest } from "../api/[[path]]";
import { ADMIT_REQUEST_SQL, CONTROL_STATUS_SQL, controlTransition, describeControlStatus } from "./requestControl";

type Control = ReturnType<typeof createRequestControl>;
const status = (db: Control) => describeControlStatus(db.sqlite.prepare(CONTROL_STATUS_SQL).get() as never);
function replaceObject(db: Control, name: string, change: (sql: string) => string) {
  const original = db.sqlite.prepare("SELECT type, sql FROM sqlite_schema WHERE name = ?").get(name)!;
  const attached = db.sqlite.prepare("SELECT sql FROM sqlite_schema WHERE tbl_name = ? AND name != ? AND sql IS NOT NULL").all(name, name);
  const rows = original.type === "table" ? db.sqlite.prepare(`SELECT * FROM ${name}`).all() : [];
  db.sqlite.exec(`DROP ${original.type} ${name}; ${change(String(original.sql))}`);
  for (const row of rows) db.sqlite.prepare(`INSERT INTO ${name} (${Object.keys(row).join(",")}) VALUES (${Object.keys(row).map(() => "?").join(",")})`).run(...Object.values(row));
  for (const row of attached) db.sqlite.exec(String(row.sql));
}
const damage = [
  ["missing history", (db: Control) => db.sqlite.exec("DROP TABLE request_deployments")],
  ["missing receipts", (db: Control) => db.sqlite.exec("DROP TABLE request_receipts")],
  ["missing gate", (db: Control) => db.sqlite.exec("DROP TABLE request_gate")],
  ["missing receipt column", (db: Control) => db.sqlite.exec("ALTER TABLE request_receipts RENAME COLUMN state TO lost_state")],
  ["missing gate column", (db: Control) => db.sqlite.exec("ALTER TABLE request_gate RENAME COLUMN coverage_hash TO lost_coverage")],
  ["missing history column", (db: Control) => db.sqlite.exec("ALTER TABLE request_deployments RENAME COLUMN deployment TO lost_deployment")],
  ["missing receipt index", (db: Control) => db.sqlite.exec("DROP INDEX request_receipts_started_idx")],
  ["altered receipt index", (db: Control) => replaceObject(db, "request_receipts_started_idx", sql => sql.replace("started_at, id", "id, started_at"))],
  ["missing reopen trigger", (db: Control) => db.sqlite.exec("DROP TRIGGER request_gate_open_guard")],
  ["missing retirement trigger", (db: Control) => db.sqlite.exec("DROP TRIGGER request_deployment_selection_guard")],
  ["altered retirement trigger", (db: Control) => replaceObject(db, "request_deployment_selection_guard", sql => sql.replace("NEW.deployment IS NOT NULL", "NEW.deployment IS NULL"))],
  ["weakened history uniqueness", (db: Control) => replaceObject(db, "request_deployments", sql => sql.replace("PRIMARY KEY NOT NULL", "NOT NULL"))],
  ["weakened receipt uniqueness", (db: Control) => replaceObject(db, "request_receipts", sql => sql.replace("id TEXT PRIMARY KEY", "id TEXT"))],
  ["missing receipt foreign key", (db: Control) => replaceObject(db, "request_receipts", sql => sql.replace(" REFERENCES request_gate(id)", ""))],
  ["weakened receipt state check", (db: Control) => replaceObject(db, "request_receipts", sql => sql.replace("CHECK (state IN ('active', 'uncertain'))", ""))],
  ["changed literal containing a line break", (db: Control) => replaceObject(db, "request_receipts", sql => sql.replace("DEFAULT 'active'", "DEFAULT 'a\nctive'"))],
  ["missing receipt default", (db: Control) => replaceObject(db, "request_receipts", sql => sql.replace(" DEFAULT 'active'", ""))],
  ["unexpected receipt-deleting trigger", (db: Control) => db.sqlite.exec("CREATE TRIGGER erase_receipt AFTER INSERT ON request_receipts BEGIN DELETE FROM request_receipts WHERE id = NEW.id; END")],
  ["uppercase receipt-deleting trigger", (db: Control) => db.sqlite.exec("CREATE TRIGGER ERASE_RECEIPT AFTER INSERT ON REQUEST_RECEIPTS BEGIN DELETE FROM request_receipts WHERE id = NEW.id; END")],
  ["unexpected control table", (db: Control) => db.sqlite.exec("CREATE TABLE request_experiment (value TEXT)")],
  ["selected label without history", (db: Control) => db.sqlite.exec("DELETE FROM request_deployments")],
] as const;

afterEach(() => vi.restoreAllMocks());
describe("required control schema fails closed", () => {
  it.each(damage)("refuses actual uploads before application D1/R2 dispatch: %s", async (_name, alter) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const control = createRequestControl(); alter(control);
    const prepare = vi.fn(() => { throw new Error("Application D1 must not be reached"); });
    const put = vi.fn();
    const env = { REQUEST_CONTROL_DB: control.database, REQUEST_CONTROL_DEPLOYMENT: "version-a",
      DB: { prepare }, RESUME_FILES: { put }, LOCAL_DEV_AUTH_EMAIL: "student@example.edu" } as unknown as CloudflareEnv;
    const request = new Request("http://localhost/api/resume-files/synthetic", { method: "PUT",
      headers: { Origin: "http://localhost", "Content-Type": "application/pdf", "X-Tracker-Account-Id": "local:student@example.edu", "X-Tracker-Mutation-Protocol": "1" }, body: "%PDF-local" });
    const response = await onRequest({ request, env, waitUntil: vi.fn(), params: {}, data: {}, functionPath: "/api" } as never);
    expect(response.status).toBe(503);
    expect(prepare).not.toHaveBeenCalled(); expect(put).not.toHaveBeenCalled();
  });
  it.each(damage)("never attests drain from incomplete schema: %s", (_name, alter) => {
    const control = createRequestControl();
    control.sqlite.exec("UPDATE request_gate SET mode = 'closed'"); alter(control);
    // A SQL error and a rejected/null status are both UNKNOWN, never drained.
    expect(() => status(control)).toThrow();
  });
  it.each(["request_gate", "request_receipts", "request_deployments"])("rejects missing required %s on a fresh unselected ledger too", name => {
    const control = createRequestControl(false); control.sqlite.exec(`DROP TABLE ${name}`);
    expect(() => status(control)).toThrow();
  });
  it("accepts the exact migration with platform metadata but never treats fresh empty receipts as bootstrap proof", () => {
    const control = createRequestControl(false);
    control.sqlite.exec("CREATE TABLE _cf_METADATA (key TEXT); CREATE TABLE d1_migrations(id INTEGER, name TEXT)");
    expect(status(control)).toMatchObject({ mode: "closed", deployment: null, coverage_hash: null, drained: false });
    expect(control.sqlite.prepare(ADMIT_REQUEST_SQL).get("fresh", "version-a", 0, "version-a")).toBeUndefined();
  });
  it("accepts line breaks replaced by spaces without normalizing changed SQL literals", () => {
    const control = createRequestControl(false);
    const names = control.sqlite.prepare("SELECT name FROM sqlite_schema WHERE name GLOB 'request_*' AND sql IS NOT NULL").all();
    for (const { name } of names) replaceObject(control, String(name), sql => sql.split("\n").join(" "));
    expect(status(control).drained).toBe(false);
    control.sqlite.prepare(controlTransition("attest-coverage", 0, "a".repeat(64))).get();
    control.sqlite.prepare(controlTransition("select-deployment", 1, "version-a")).get();
    control.sqlite.prepare(controlTransition("reopen", 2)).get();
    expect(control.sqlite.prepare(ADMIT_REQUEST_SQL).get("one-line-schema", "version-a", 0, "version-a")).toEqual({ id: "one-line-schema" });
  });
  it("fails closed for a gate whose required constraints were weakened", () => {
    const control = createRequestControl(false);
    replaceObject(control, "request_gate", sql => sql.replace("CHECK (schema_version = 1)", "CHECK (schema_version >= 1)"));
    control.sqlite.exec(`UPDATE request_gate SET coverage_hash = '${"a".repeat(64)}', deployment = 'version-a', mode = 'open'`);
    expect(control.sqlite.prepare(ADMIT_REQUEST_SQL).get("request", "version-a", 0, "version-a")).toBeUndefined();
    control.sqlite.exec("UPDATE request_gate SET mode = 'closed'");
    expect(() => status(control)).toThrow("UNKNOWN");
  });
  it("refuses permission-increasing transitions with an incomplete schema but still permits close/revoke", () => {
    const control = createRequestControl();
    control.sqlite.exec("DROP TRIGGER request_deployment_selection_guard");
    expect(control.sqlite.prepare(controlTransition("close", 0)).get()).toEqual({ revision: 1 });
    expect(control.sqlite.prepare(controlTransition("reopen", 1)).get()).toBeUndefined();
    expect(control.sqlite.prepare(controlTransition("select-deployment", 1, "version-b")).get()).toBeUndefined();
    expect(control.sqlite.prepare(controlTransition("revoke-coverage", 1)).get()).toEqual({ revision: 2 });
    expect(control.sqlite.prepare(controlTransition("attest-coverage", 2, "a".repeat(64))).get()).toBeUndefined();
  });
  it("does not silently ignore status query failures", async () => {
    const control = createRequestControl();
    control.setBeforeQuery(() => { throw new Error("D1 unavailable"); });
    await expect(control.database.prepare(CONTROL_STATUS_SQL).first()).rejects.toThrow("D1 unavailable");
  });
  it("recovers after synthetic schema repair while preserving in-flight receipts and retired labels", () => {
    const control = createRequestControl();
    control.sqlite.prepare(ADMIT_REQUEST_SQL).get("in-flight", "version-a", 0, "version-a");
    const trigger = String(control.sqlite.prepare("SELECT sql FROM sqlite_schema WHERE name = 'request_deployment_selection_guard'").get()!.sql);
    control.sqlite.exec("DROP TRIGGER request_deployment_selection_guard");
    control.sqlite.prepare(controlTransition("close", 0)).get();
    expect(() => status(control)).toThrow("UNKNOWN");
    control.sqlite.exec(trigger);
    expect(status(control)).toMatchObject({ outstanding: 1, drained: false });
    expect(control.sqlite.prepare(controlTransition("reopen", 1)).get()).toBeUndefined();
    control.sqlite.exec("DELETE FROM request_receipts WHERE id = 'in-flight'"); // Synthetic acknowledged completion only.
    expect(control.sqlite.prepare(controlTransition("select-deployment", 1, "version-b")).get()).toEqual({ revision: 2 });
    expect(control.sqlite.prepare(controlTransition("select-deployment", 2, "version-a")).get()).toBeUndefined();
  });
});
