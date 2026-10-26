/// <reference types="node" />
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import type { CloudflareEnv } from "../../functions/lib/types";

// Execute production SQL, including migration triggers; do not emulate its
// conditions in a fake. R2 hooks model the cross-service interruption points.
export class SqliteD1 {
  readonly sqlite = new DatabaseSync(":memory:");
  beforeQuery?: (sql: string) => void;
  constructor(beforeLifecycleMigration?: (sqlite: DatabaseSync) => void, applyLifecycle = true) {
    for (const name of ["0001_authenticated_cloud_storage.sql", "0002_free_tier_usage_budgets.sql", "0003_recoverable_documents.sql"]) {
      if (name === "0003_recoverable_documents.sql") {
        if (!applyLifecycle) continue;
        beforeLifecycleMigration?.(this.sqlite);
      }
      this.sqlite.exec(readFileSync(new URL(`../../migrations/${name}`, import.meta.url), "utf8"));
    }
  }
  prepare(sql: string) {
    let values: SQLInputValue[] = [];
    const execute = () => { this.beforeQuery?.(sql); return this.sqlite.prepare(sql); };
    const statement = {
      bind: (...args: SQLInputValue[]) => { values = args; return statement; },
      first: async <T>() => execute().get(...values) as T | undefined ?? null,
      all: async () => ({ results: execute().all(...values) }),
      run: async () => ({ meta: { changes: Number(execute().run(...values).changes) } }),
    };
    return statement;
  }
  close() { this.sqlite.close(); }
}

export class MemoryR2 {
  readonly files = new Map<string, { bytes: Uint8Array; mime: string; uploaded: Date }>();
  beforePut?: () => Promise<void>;
  afterPut?: () => Promise<void>;
  beforeDelete?: () => Promise<void>;
  afterDelete?: () => Promise<void>;
  async put(key: string, value: ArrayBuffer, options: R2PutOptions) {
    await this.beforePut?.();
    if (options.onlyIf && this.files.has(key)) return null;
    this.files.set(key, { bytes: new Uint8Array(value.slice(0)), mime: (options.httpMetadata as R2HTTPMetadata)?.contentType ?? "", uploaded: new Date() });
    await this.afterPut?.();
    return { key };
  }
  async get(key: string) {
    const stored = this.files.get(key);
    if (!stored) return null;
    const blob = new Blob([new Uint8Array(stored.bytes).buffer]);
    return { size: blob.size, body: blob.stream(), arrayBuffer: () => blob.arrayBuffer() };
  }
  async delete(key: string) {
    await this.beforeDelete?.();
    this.files.delete(key);
    await this.afterDelete?.();
  }
  async list(options: R2ListOptions) {
    const objects = [...this.files].filter(([key]) => key.startsWith(options.prefix ?? "")).sort(([a], [b]) => a.localeCompare(b));
    const offset = Number(options.cursor ?? 0), limit = options.limit ?? 25;
    const selected = objects.slice(offset, offset + limit);
    return {
      objects: selected.map(([key, file]) => ({ key, size: file.bytes.byteLength, uploaded: file.uploaded, httpMetadata: { contentType: file.mime } })),
      truncated: offset + limit < objects.length,
      cursor: String(offset + selected.length),
    };
  }
}

export function documentEnvironment(database: SqliteD1, bucket: MemoryR2) {
  return { DB: database, RESUME_FILES: bucket } as unknown as Pick<CloudflareEnv, "DB" | "RESUME_FILES">;
}
