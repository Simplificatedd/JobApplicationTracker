import { HttpError } from "./http";
import type { AuthenticatedUser, CloudflareEnv } from "./types";
import { reserveR2Operation } from "./usageBudgets";
import { DOCUMENT_GRACE_MS, documentObjectKey, removeUnreferencedDocument, rethrowDocumentConflict } from "./documentLifecycle";

const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const ALLOWED_MIME_TYPES = new Set(["application/pdf", DOCX_MIME_TYPE]);
const MAX_RESUME_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_USER_RESUME_BYTES = 100 * 1024 * 1024;
export const MAX_TOTAL_RESUME_BYTES = 5 * 1024 * 1024 * 1024;
const STORAGE_KEY_PATTERN = /^[A-Za-z0-9._-]{1,200}$/;

interface ResumeObjectRow {
  file_size: number;
  mime_type: string;
  lifecycle: string;
  content_hash: string | null;
}

interface ResumeStorageBytesRow {
  used_bytes: number | string | null;
}

export function requireAvailableResumeQuota(
  usedBytes: number,
  incomingBytes: number,
) {
  if (usedBytes + incomingBytes > MAX_USER_RESUME_BYTES) {
    throw new HttpError(413, "Cloud resume storage is limited to 100 MB per user.");
  }
}

export function requireAvailableTotalResumeQuota(
  usedBytes: number,
  incomingBytes: number,
) {
  if (usedBytes + incomingBytes > MAX_TOTAL_RESUME_BYTES) {
    throw new HttpError(
      507,
      "Cloud resume storage has reached its account safety limit.",
    );
  }
}

function validateStorageKey(storageKey: string) {
  if (!STORAGE_KEY_PATTERN.test(storageKey)) {
    throw new HttpError(400, "The resume storage key is invalid.");
  }
}

async function hashDocument(bytes: ArrayBuffer) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function getOwnedResumeObject(
  database: D1Database,
  user: AuthenticatedUser,
  storageKey: string,
) {
  return database
    .prepare(
      `SELECT mime_type, file_size, lifecycle, content_hash FROM resume_objects
       WHERE owner_id = ? AND storage_key = ?`,
    )
    .bind(user.id, storageKey)
    .first<ResumeObjectRow>();
}

export async function putResumeFile(
  request: Request,
  env: Pick<CloudflareEnv, "DB" | "RESUME_FILES">,
  user: AuthenticatedUser,
  storageKey: string,
) {
  validateStorageKey(storageKey);

  const mimeType = request.headers.get("content-type")?.split(";", 1)[0] ?? "";
  const declaredSize = Number(request.headers.get("content-length") ?? 0);

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new HttpError(415, "Only PDF and DOCX resume files are supported.");
  }

  if (declaredSize > MAX_RESUME_FILE_BYTES) {
    throw new HttpError(413, "Resume files must be 10 MB or smaller.");
  }

  const bytes = await request.arrayBuffer();

  if (bytes.byteLength === 0 || bytes.byteLength > MAX_RESUME_FILE_BYTES) {
    throw new HttpError(413, "Resume files must be between 1 byte and 10 MB.");
  }

  const signature = new Uint8Array(bytes.slice(0, 5));
  const isPdf =
    mimeType === "application/pdf" &&
    [0x25, 0x50, 0x44, 0x46, 0x2d].every(
      (value, index) => signature[index] === value,
    );
  const isDocx =
    mimeType === DOCX_MIME_TYPE &&
    [0x50, 0x4b, 0x03, 0x04].every(
      (value, index) => signature[index] === value,
    );

  if (!isPdf && !isDocx) {
    throw new HttpError(400, "The uploaded resume contents do not match its type.");
  }

  const hash = await hashDocument(bytes);
  const existing = await getOwnedResumeObject(env.DB, user, storageKey);
  if (existing) {
    if (!["ready", "uploading"].includes(existing.lifecycle) ||
      existing.file_size !== bytes.byteLength || existing.mime_type !== mimeType) {
      throw new HttpError(409, "This document key cannot be replaced. Upload the document under a new key.");
    }
    let existingHash = existing.content_hash;
    if (existingHash === null) {
      // Legacy metadata did not record hashes. Verify bytes rather than trusting
      // a same-size replacement or overwriting a committed legacy object.
      await reserveR2Operation(env.DB, "read");
      const stored = await env.RESUME_FILES.get(documentObjectKey(user, storageKey));
      if (stored && stored.size === bytes.byteLength) existingHash = await hashDocument(await stored.arrayBuffer());
    }
    if (existingHash !== hash) throw new HttpError(409, "This document key already has different or unavailable contents. Upload under a new key.");
    if (existing.lifecycle === "ready") {
      const verified = await env.DB.prepare(`UPDATE resume_objects SET content_hash = ?
        WHERE owner_id = ? AND storage_key = ? AND lifecycle = 'ready' RETURNING storage_key`)
        .bind(hash, user.id, storageKey).first();
      if (!verified) throw new HttpError(409, "Document cleanup has started. Upload under a new key.");
      return { fileSize: bytes.byteLength, mimeType, storageKey };
    }
  }

  const [userUsage, totalUsage] = await Promise.all([
    env.DB.prepare(
      `SELECT COALESCE(SUM(file_size), 0) AS used_bytes
       FROM resume_objects
       WHERE owner_id = ? AND storage_key <> ? AND lifecycle <> 'deleted'`,
    )
      .bind(user.id, storageKey)
      .first<ResumeStorageBytesRow>(),
    env.DB.prepare(
      `SELECT COALESCE(SUM(file_size), 0) AS used_bytes
       FROM resume_objects
       WHERE NOT (owner_id = ? AND storage_key = ?) AND lifecycle <> 'deleted'`,
    )
      .bind(user.id, storageKey)
      .first<ResumeStorageBytesRow>(),
  ]);
  requireAvailableResumeQuota(
    Number(userUsage?.used_bytes ?? 0),
    bytes.byteLength,
  );
  requireAvailableTotalResumeQuota(
    Number(totalUsage?.used_bytes ?? 0),
    bytes.byteLength,
  );
  await reserveR2Operation(env.DB, "write");

  const timestamp = new Date().toISOString();
  // Persist intent before touching R2. A worker can disappear at any subsequent
  // await; this row remains discoverable without a browser's cooperation.
  // Skip existing rows before INSERT triggers run: an identical concurrent retry
  // may now be ready and referenced, even though our earlier read saw uploading.
  await env.DB.prepare(
    `INSERT INTO resume_objects
      (owner_id, storage_key, mime_type, file_size, updated_at, lifecycle, content_hash, cleanup_after)
     SELECT ?, ?, ?, ?, ?, 'uploading', ?, ?
     WHERE NOT EXISTS (SELECT 1 FROM resume_objects WHERE owner_id = ? AND storage_key = ?)
     ON CONFLICT(owner_id, storage_key) DO NOTHING`,
  )
    .bind(user.id, storageKey, mimeType, bytes.byteLength, timestamp, hash, Date.now() + DOCUMENT_GRACE_MS, user.id, storageKey)
    .run().catch(rethrowDocumentConflict);

  const intent = await getOwnedResumeObject(env.DB, user, storageKey);
  if (intent?.lifecycle === "ready" && intent.content_hash === hash && intent.mime_type === mimeType) {
    return { fileSize: bytes.byteLength, mimeType, storageKey };
  }
  if (!intent || intent.lifecycle !== "uploading" || intent.content_hash !== hash || intent.mime_type !== mimeType) {
    throw new HttpError(409, "The upload key is already in use or retired. Upload under a new key.");
  }
  const created = await env.RESUME_FILES.put(documentObjectKey(user, storageKey), bytes, {
    httpMetadata: { contentType: mimeType }, onlyIf: { etagDoesNotMatch: "*" },
  });
  if (!created) {
    // A lost PUT response may hide success; conditional retries may reuse only
    // identical bytes. Unknown legacy objects are never overwritten.
    await reserveR2Operation(env.DB, "read");
    const stored = await env.RESUME_FILES.get(documentObjectKey(user, storageKey));
    const storedHash = stored && stored.size === bytes.byteLength && await hashDocument(await stored.arrayBuffer());
    if (storedHash !== hash) throw new HttpError(409, "Stored contents differ. Keep the original and upload under a new key.");
  }
  const ready = await env.DB.prepare(`UPDATE resume_objects SET lifecycle = 'ready'
    WHERE owner_id = ? AND storage_key = ? AND content_hash = ? AND lifecycle IN ('uploading', 'ready')
    RETURNING storage_key`).bind(user.id, storageKey, hash).first();
  if (!ready) {
    // A PUT can finish after deletion. Retain the retirement fence and make the
    // next reconciliation retry immediately; periodic tombstones also cover a
    // worker disappearing before this update.
    await env.DB.prepare(`UPDATE resume_objects SET cleanup_after = ?
      WHERE owner_id = ? AND storage_key = ? AND lifecycle IN ('deleting', 'deleted')`)
      .bind(Date.now(), user.id, storageKey).run();
    throw new HttpError(409, "The upload expired during cleanup. Upload under a new key.");
  }

  return { fileSize: bytes.byteLength, mimeType, storageKey };
}

export async function getResumeFile(
  env: Pick<CloudflareEnv, "DB" | "RESUME_FILES">,
  user: AuthenticatedUser,
  storageKey: string,
) {
  validateStorageKey(storageKey);
  const metadata = await getOwnedResumeObject(env.DB, user, storageKey);

  if (!metadata || metadata.lifecycle !== "ready") {
    throw new HttpError(404, "The resume file could not be found.");
  }

  await reserveR2Operation(env.DB, "read");
  const object = await env.RESUME_FILES.get(documentObjectKey(user, storageKey));

  if (!object?.body) {
    throw new HttpError(404, "The resume file could not be found.");
  }

  return new Response(object.body, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Length": String(metadata.file_size),
      "Content-Type": metadata.mime_type,
    },
  });
}

export async function deleteResumeFile(
  env: Pick<CloudflareEnv, "DB" | "RESUME_FILES">,
  user: AuthenticatedUser,
  storageKey: string,
) {
  validateStorageKey(storageKey);
  await removeUnreferencedDocument(env, user, storageKey);
}
