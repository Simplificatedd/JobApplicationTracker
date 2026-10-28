/// <reference types="node" />
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import { afterEach } from "vitest";

const databases = new Set<DatabaseSync>();
afterEach(() => { for (const db of databases) db.close(); databases.clear(); });

// Execute the real control SQL, independently of the document lifecycle schema.
export function createRequestControl(open = true) {
  const sqlite = new DatabaseSync(":memory:");
  databases.add(sqlite);
  sqlite.exec(readFileSync(new URL("../../control-migrations/0001_request_control.sql", import.meta.url), "utf8"));
  if (open) sqlite.prepare("UPDATE request_gate SET coverage_hash = ?, deployment = 'version-a', mode = 'open'").run("a".repeat(64));
  let before: ((sql: string) => void) | undefined;
  const database = { prepare(sql: string) {
    let values: SQLInputValue[] = [];
    const statement = {
      bind(...args: SQLInputValue[]) { values = args; return statement; },
      async first() { before?.(sql); return sqlite.prepare(sql).get(...values) ?? null; },
      async all() { before?.(sql); return { results: sqlite.prepare(sql).all(...values) }; },
      async run() { before?.(sql); return { meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }; },
    };
    return statement;
  } } as unknown as D1Database;
  return { sqlite, database, setBeforeQuery(hook?: (sql: string) => void) { before = hook; } };
}
export function requestControlEnv() {
  return { REQUEST_CONTROL_DB: createRequestControl().database, REQUEST_CONTROL_DEPLOYMENT: "version-a" };
}
