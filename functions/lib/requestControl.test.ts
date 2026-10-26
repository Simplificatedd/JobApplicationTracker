import { describe, expect, it } from "vitest";
import { createRequestControl } from "../../src/test/requestControl";
import { readFileSync } from "node:fs";
import { ADMIT_REQUEST_SQL, CONTROL_STATUS_SQL, controlTransition, describeControlStatus } from "./requestControl";

const evidence = "a".repeat(64);
const status = (db: ReturnType<typeof createRequestControl>) => describeControlStatus(db.sqlite.prepare(CONTROL_STATUS_SQL).get() as never);
const change = (db: ReturnType<typeof createRequestControl>, action: "close" | "reopen" | "attest-coverage", revision: number) =>
  db.sqlite.prepare(controlTransition(action, revision, evidence)).get();

describe("durable request control and operator transitions", () => {
  it("starts closed/unverified and never equates an empty fresh database with drain", () => {
    const db = createRequestControl(false);
    expect(status(db)).toMatchObject({ mode: "closed", drained: false, outstanding: 0, coverage_hash: null });
    expect(change(db, "reopen", 0)).toBeUndefined();
    expect(db.sqlite.prepare(ADMIT_REQUEST_SQL).get("request", "version-a", 0, "version-a")).toBeUndefined();
  });
  it("requires external coverage attestation, then explicit revision-controlled reopening", () => {
    const db = createRequestControl(false);
    expect(change(db, "attest-coverage", 0)).toEqual({ revision: 1 });
    expect(status(db).drained).toBe(true);
    expect(change(db, "attest-coverage", 1)).toBeUndefined();
    expect(change(db, "reopen", 1)).toBeUndefined();
    expect(db.sqlite.prepare(controlTransition("select-deployment", 1, "version-a")).get()).toEqual({ revision: 2 });
    expect(change(db, "reopen", 2)).toEqual({ revision: 3 });
    expect(status(db)).toMatchObject({ mode: "open", drained: false });
  });
  it("serializes admission with closure and counts requests admitted immediately before it", () => {
    const db = createRequestControl();
    db.sqlite.prepare(ADMIT_REQUEST_SQL).get("before-close", "version-a", 1, "version-a");
    expect(change(db, "close", 0)).toEqual({ revision: 1 });
    expect(status(db)).toMatchObject({ mode: "closed", outstanding: 1, drained: false });
    expect(db.sqlite.prepare(ADMIT_REQUEST_SQL).get("after-close", "version-b", 2, "version-b")).toBeUndefined();
    expect(change(db, "reopen", 1)).toBeUndefined();
    expect(() => db.sqlite.exec("UPDATE request_gate SET mode='open'")).toThrow("not_drained");
  });
  it("permanently fences retired deployment labels across later maintenance cycles", () => {
    const db = createRequestControl();
    change(db, "close", 0);
    expect(db.sqlite.prepare(controlTransition("select-deployment", 1, "version-b")).get()).toEqual({ revision: 2 });
    change(db, "reopen", 2); change(db, "close", 3);
    // A fresh revision and explicit confirmation must not resurrect an old build.
    expect(db.sqlite.prepare(controlTransition("select-deployment", 4, "version-a")).get()).toBeUndefined();
    expect(status(db)).toMatchObject({ revision: 4, deployment: "version-b", drained: true });
    expect(() => db.sqlite.exec("UPDATE request_gate SET deployment = 'version-a'")).toThrow("retired");
    change(db, "reopen", 4);
    expect(db.sqlite.prepare(ADMIT_REQUEST_SQL).get("delayed-old", "version-a", 0, "version-a")).toBeUndefined();
    expect(db.sqlite.prepare(ADMIT_REQUEST_SQL).get("current", "version-b", 0, "version-b")).toEqual({ id: "current" });
  });
  it("fences stale concurrent operators and preserves state over repeated cycles", () => {
    const db = createRequestControl();
    expect(change(db, "close", 0)).toEqual({ revision: 1 });
    expect(change(db, "close", 0)).toBeUndefined();
    expect(change(db, "reopen", 0)).toBeUndefined();
    expect(change(db, "reopen", 1)).toEqual({ revision: 2 });
    expect(change(db, "close", 2)).toEqual({ revision: 3 });
    expect(status(db)).toMatchObject({ revision: 3, drained: true, coverage_hash: evidence });
  });
  it("retains terminated and uncertain work regardless of timestamps or deployment version", () => {
    const db = createRequestControl();
    db.sqlite.prepare(ADMIT_REQUEST_SQL).get("crashed", "version-a", -1, "version-a");
    db.sqlite.prepare(ADMIT_REQUEST_SQL).get("ambiguous", "version-a", -1, "version-a");
    db.sqlite.exec("UPDATE request_receipts SET state='uncertain' WHERE id='ambiguous'");
    change(db, "close", 0);
    expect(status(db)).toMatchObject({ outstanding: 2, uncertain: 1, drained: false });
    expect(change(db, "reopen", 1)).toBeUndefined();
  });
  it("counts unresolved work beyond the bounded diagnostic sample", () => {
    const db = createRequestControl();
    for (let i = 0; i < 101; i++) db.sqlite.prepare(ADMIT_REQUEST_SQL).get(`request-${i}`, "version-a", i, "version-a");
    db.sqlite.exec("UPDATE request_receipts SET state='uncertain' WHERE id='request-100'");
    change(db, "close", 0);
    const value = status(db);
    expect(value).toMatchObject({ outstanding: 101, uncertain: 1, sampleOnly: true, drained: false });
    expect(value.receipts).toHaveLength(100);
    expect(value.receipts.every((row) => row.state === "active")).toBe(true);
    expect(change(db, "reopen", 1)).toBeUndefined();
  });
  it("refuses raw schema replay without resetting a closed gate or outstanding work", () => {
    const db = createRequestControl();
    db.sqlite.prepare(ADMIT_REQUEST_SQL).get("survivor", "version-a", 0, "version-a");
    change(db, "close", 0);
    const schema = readFileSync(new URL("../../control-migrations/0001_request_control.sql", import.meta.url), "utf8");
    expect(() => db.sqlite.exec(schema)).toThrow("already exists");
    expect(status(db)).toMatchObject({ revision: 1, outstanding: 1, mode: "closed", drained: false });
  });
  it("can revoke invalidated coverage and close admission without clearing any receipts", () => {
    const db = createRequestControl();
    db.sqlite.prepare(ADMIT_REQUEST_SQL).get("still-active", "version-a", 0, "version-a");
    expect(db.sqlite.prepare(controlTransition("revoke-coverage", 0)).get()).toEqual({ revision: 1 });
    expect(status(db)).toMatchObject({ mode: "closed", outstanding: 1, coverage_hash: null, drained: false });
    expect(change(db, "reopen", 1)).toBeUndefined();
  });
  it.each([null, {}, { schema_version: 2 }, { schema_version: 1, revision: -1 }])("never reports drain from unverifiable status (%j)", (row) => {
    expect(() => describeControlStatus(row as never)).toThrow("UNKNOWN");
  });
  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid revisions (%s)", (revision) => {
    expect(() => controlTransition("reopen", revision)).toThrow("revision");
  });
  it("rejects unvalidated coverage evidence rather than interpolating operator input", () => {
    expect(() => controlTransition("attest-coverage", 0, "'; DELETE FROM request_receipts;--")).toThrow("SHA-256");
  });
});
