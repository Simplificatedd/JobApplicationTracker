import { HttpError } from "./http";
import type { AuthenticatedUser, CloudflareEnv } from "./types";
import { reserveR2Operation } from "./usageBudgets";

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

function objectKey(user: AuthenticatedUser, storageKey: string) {
  return `${encodeURIComponent(user.id)}/${storageKey}`;
}

async function getOwnedResumeObject(
  database: D1Database,
  user: AuthenticatedUser,
  storageKey: string,
) {
  return database
    .prepare(
      `SELECT mime_type, file_size FROM resume_objects
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

  const [userUsage, totalUsage] = await Promise.all([
    env.DB.prepare(
      `SELECT COALESCE(SUM(file_size), 0) AS used_bytes
       FROM resume_objects
       WHERE owner_id = ? AND storage_key <> ?`,
    )
      .bind(user.id, storageKey)
      .first<ResumeStorageBytesRow>(),
    env.DB.prepare(
      `SELECT COALESCE(SUM(file_size), 0) AS used_bytes
       FROM resume_objects
       WHERE NOT (owner_id = ? AND storage_key = ?)`,
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
  await env.RESUME_FILES.put(objectKey(user, storageKey), bytes, {
    httpMetadata: { contentType: mimeType },
  });
  await env.DB.prepare(
    `INSERT INTO resume_objects
      (owner_id, storage_key, mime_type, file_size, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(owner_id, storage_key) DO UPDATE SET
       mime_type = excluded.mime_type,
       file_size = excluded.file_size,
       updated_at = excluded.updated_at`,
  )
    .bind(user.id, storageKey, mimeType, bytes.byteLength, timestamp)
    .run();

  return { fileSize: bytes.byteLength, mimeType, storageKey };
}

export async function getResumeFile(
  env: Pick<CloudflareEnv, "DB" | "RESUME_FILES">,
  user: AuthenticatedUser,
  storageKey: string,
) {
  validateStorageKey(storageKey);
  const metadata = await getOwnedResumeObject(env.DB, user, storageKey);

  if (!metadata) {
    throw new HttpError(404, "The resume file could not be found.");
  }

  await reserveR2Operation(env.DB, "read");
  const object = await env.RESUME_FILES.get(objectKey(user, storageKey));

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
  const metadata = await getOwnedResumeObject(env.DB, user, storageKey);

  if (!metadata) {
    return;
  }

  await env.RESUME_FILES.delete(objectKey(user, storageKey));
  await env.DB.prepare(
    "DELETE FROM resume_objects WHERE owner_id = ? AND storage_key = ?",
  )
    .bind(user.id, storageKey)
    .run();
}
