import { HttpError } from "./http";
import type { AuthenticatedUser, CloudflareEnv } from "./types";
import { reserveR2Operation } from "./usageBudgets";

export const DOCUMENT_GRACE_MS = 24 * 60 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 25;
// Bound owner parameters keep this set uncorrelated: parse the snapshot once
// per query, rather than once for each candidate object.
const DOCUMENT_REFERENCE_SQL = `storage_key IN (
  SELECT json_extract(doc.value, '$.storageKey') FROM tracker_state AS state,
    json_each(state.snapshot_json, '$.resumes') AS doc WHERE state.owner_id = ?
  UNION ALL
  SELECT json_extract(doc.value, '$.storageKey') FROM tracker_state AS state,
    json_each(state.snapshot_json, '$.coverLetters') AS doc WHERE state.owner_id = ?
)`;

export function hasValidDocumentReferences(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const snapshot = value as Record<string, unknown>;
  return [snapshot.resumes, snapshot.coverLetters ?? []].every((documents) => Array.isArray(documents) &&
    documents.every((document: unknown) => typeof document === "object" && document !== null &&
      "storageKey" in document && typeof document.storageKey === "string" && document.storageKey.trim().length > 0));
}

export function rethrowDocumentConflict(error: unknown): never {
  if (String(error).includes("document_lifecycle_conflict")) {
    throw new HttpError(409, "A document is no longer available or cleanup has started. Refresh the tracker and upload it under a new key before saving.");
  }
  throw error;
}

export function documentObjectKey(user: AuthenticatedUser, storageKey: string) {
  return `${encodeURIComponent(user.id)}/${storageKey}`;
}

// The conditional update and snapshot triggers run on the same D1 writer.
// After this claim, no snapshot can introduce a reference to this key.
export async function removeUnreferencedDocument(
  env: Pick<CloudflareEnv, "DB" | "RESUME_FILES">,
  user: AuthenticatedUser,
  storageKey: string,
  now = Date.now(),
) {
  const claimed = await env.DB.prepare(`UPDATE resume_objects
    SET lifecycle = 'deleting', cleanup_after = ?
    WHERE owner_id = ? AND storage_key = ? AND NOT ${DOCUMENT_REFERENCE_SQL}
    RETURNING storage_key`).bind(now, user.id, storageKey, user.id, user.id).first();
  if (!claimed) {
    const exists = await env.DB.prepare("SELECT storage_key FROM resume_objects WHERE owner_id = ? AND storage_key = ?")
      .bind(user.id, storageKey).first();
    if (exists) throw new HttpError(409, "This document is still referenced by committed cloud data. No file was deleted.");
    return;
  }
  // Both failures and lost acknowledgements leave the claim durable. Repeated
  // deletes are safe; keys are never reused, even after successful removal.
  await env.RESUME_FILES.delete(documentObjectKey(user, storageKey));
  await env.DB.prepare(`UPDATE resume_objects SET lifecycle = 'deleted', cleanup_after = ?
    WHERE owner_id = ? AND storage_key = ? AND lifecycle = 'deleting'`)
    .bind(now + DOCUMENT_GRACE_MS, user.id, storageKey).run();
}

export interface DocumentCleanupResult {
  removed: number;
  failed: number;
  pending: number;
}

async function inventoryDocuments(
  env: Pick<CloudflareEnv, "DB" | "RESUME_FILES">,
  user: AuthenticatedUser,
  now: number,
) {
  // Inventory is owner-scoped and bounded. Register before advancing the durable
  // cursor so interruption cannot lose an old object with missing D1 metadata.
  const scan = await env.DB.prepare("SELECT cursor FROM document_cleanup_scan WHERE owner_id = ?")
    .bind(user.id).first<{ cursor: string | null }>();
  await reserveR2Operation(env.DB, "write"); // R2 LIST is a Class A operation.
  const prefix = `${encodeURIComponent(user.id)}/`;
  const inventory = await env.RESUME_FILES.list({ prefix, cursor: scan?.cursor ?? undefined, limit: CLEANUP_BATCH_SIZE, include: ["httpMetadata"] });
  for (const object of inventory.objects) {
    const key = object.key.slice(prefix.length);
    if (!object.key.startsWith(prefix) || !/^[A-Za-z0-9._-]{1,200}$/.test(key)) continue;
    await env.DB.prepare(`INSERT OR IGNORE INTO resume_objects
      (owner_id, storage_key, mime_type, file_size, updated_at, lifecycle, cleanup_after)
      VALUES (?, ?, ?, ?, ?, 'ready', ?)`)
      .bind(user.id, key, object.httpMetadata?.contentType ?? "application/octet-stream", object.size,
        object.uploaded.toISOString(), Math.max(now, object.uploaded.getTime()) + DOCUMENT_GRACE_MS).run();
  }
  await env.DB.prepare(`INSERT INTO document_cleanup_scan (owner_id, cursor) VALUES (?, ?)
    ON CONFLICT(owner_id) DO UPDATE SET cursor = excluded.cursor`)
    .bind(user.id, inventory.truncated ? inventory.cursor : null).run();
}

export async function reconcileDocuments(
  env: Pick<CloudflareEnv, "DB" | "RESUME_FILES">,
  user: AuthenticatedUser,
  now = Date.now(),
): Promise<DocumentCleanupResult> {
  const state = await env.DB.prepare("SELECT snapshot_json FROM tracker_state WHERE owner_id = ?")
    .bind(user.id).first<{ snapshot_json: string }>();
  if (state && !hasValidDocumentReferences(JSON.parse(state.snapshot_json))) {
    throw new HttpError(409, "Document references could not be verified. No cleanup was performed. Export a recovery archive and repair the document metadata first.");
  }
  const due = await env.DB.prepare(`SELECT storage_key FROM resume_objects
    WHERE owner_id = ? AND cleanup_after <= ? AND NOT ${DOCUMENT_REFERENCE_SQL}
    ORDER BY cleanup_after, storage_key LIMIT ?`).bind(user.id, now, user.id, user.id, CLEANUP_BATCH_SIZE)
    .all<{ storage_key: string }>();
  let removed = 0, failed = 0;
  for (const { storage_key } of due.results) {
    try { await removeUnreferencedDocument(env, user, storage_key, now); removed++; }
    catch { failed++; } // Claim/recheck failures never authorize R2 deletion.
  }
  try { await inventoryDocuments(env, user, now); }
  catch { failed++; } // Inventory failure is visible and never prevents known cleanup.
  const count = await env.DB.prepare(`SELECT COUNT(*) AS pending FROM resume_objects
    WHERE owner_id = ? AND lifecycle <> 'deleted' AND cleanup_after IS NOT NULL
      AND NOT ${DOCUMENT_REFERENCE_SQL}`).bind(user.id, user.id, user.id).first<{ pending: number }>();
  return { removed, failed, pending: count?.pending ?? 0 };
}
