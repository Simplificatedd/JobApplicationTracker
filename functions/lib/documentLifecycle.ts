import { HttpError } from "./http";
import type { AuthenticatedUser, CloudflareEnv } from "./types";

export const DOCUMENT_GRACE_MS = 24 * 60 * 60 * 1000;
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
