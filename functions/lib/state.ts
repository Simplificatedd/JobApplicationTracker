import type { StorageSnapshot } from "../../src/storage/StorageAdapter";
import { HttpError } from "./http";
import type {
  AuthenticatedUser,
  CloudStateEnvelope,
  SaveStateRequest,
} from "./types";

const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024;
export const MAX_TOTAL_SNAPSHOT_BYTES = 512 * 1024 * 1024;

interface StateRow {
  revision: number;
  snapshot_json: string;
  updated_at: string;
}

interface StateUsageRow {
  used_bytes: number | string | null;
}

export function requireAvailableSnapshotQuota(
  usedBytes: number,
  incomingBytes: number,
) {
  if (usedBytes + incomingBytes > MAX_TOTAL_SNAPSHOT_BYTES) {
    throw new HttpError(
      507,
      "Cloud tracker data has reached its account safety limit.",
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStorageSnapshot(value: unknown): value is StorageSnapshot {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Array.isArray(value.activities) &&
    Array.isArray(value.applications) &&
    Array.isArray(value.contacts) &&
    Array.isArray(value.coverLetters) &&
    Array.isArray(value.interviews) &&
    Array.isArray(value.resumes) &&
    isRecord(value.analyticsSettings) &&
    isRecord(value.notificationState) &&
    isRecord(value.settings) &&
    (value.tablePreferences === null || isRecord(value.tablePreferences))
  );
}

export function parseSaveStateRequest(text: string): SaveStateRequest {
  if (new TextEncoder().encode(text).byteLength > MAX_SNAPSHOT_BYTES) {
    throw new HttpError(413, "The cloud snapshot exceeds the 5 MB limit.");
  }

  let value: unknown;

  try {
    value = JSON.parse(text);
  } catch {
    throw new HttpError(400, "The cloud snapshot is not valid JSON.");
  }

  if (!isRecord(value) || !isRecord(value.snapshot)) {
    throw new HttpError(400, "The cloud snapshot has an invalid shape.");
  }

  value.snapshot.coverLetters ??= [];

  if (!isStorageSnapshot(value.snapshot)) {
    throw new HttpError(400, "The cloud snapshot has an invalid shape.");
  }

  if (
    value.baseRevision !== null &&
    (!Number.isInteger(value.baseRevision) || Number(value.baseRevision) < 1)
  ) {
    throw new HttpError(400, "The base revision is invalid.");
  }

  return {
    baseRevision: value.baseRevision as number | null,
    snapshot: value.snapshot,
  };
}

export async function getCloudState(
  database: D1Database,
  ownerId: string,
): Promise<CloudStateEnvelope | null> {
  const row = await database
    .prepare(
      "SELECT revision, snapshot_json, updated_at FROM tracker_state WHERE owner_id = ?",
    )
    .bind(ownerId)
    .first<StateRow>();

  if (!row) {
    return null;
  }

  const snapshot = JSON.parse(row.snapshot_json) as StorageSnapshot;

  return {
    revision: row.revision,
    snapshot: { ...snapshot, coverLetters: snapshot.coverLetters ?? [] },
    updatedAt: row.updated_at,
  };
}

export async function saveCloudState(
  database: D1Database,
  user: AuthenticatedUser,
  input: SaveStateRequest,
): Promise<CloudStateEnvelope> {
  const timestamp = new Date().toISOString();
  const snapshotJson = JSON.stringify(input.snapshot);
  const usage = await database
    .prepare(
      `SELECT COALESCE(SUM(LENGTH(CAST(snapshot_json AS BLOB))), 0) AS used_bytes
       FROM tracker_state
       WHERE owner_id <> ?`,
    )
    .bind(user.id)
    .first<StateUsageRow>();
  requireAvailableSnapshotQuota(
    Number(usage?.used_bytes ?? 0),
    new TextEncoder().encode(snapshotJson).byteLength,
  );

  if (input.baseRevision === null) {
    const result = await database
      .prepare(
        `INSERT OR IGNORE INTO tracker_state
          (owner_id, owner_email, revision, snapshot_json, created_at, updated_at)
         VALUES (?, ?, 1, ?, ?, ?)`,
      )
      .bind(user.id, user.email, snapshotJson, timestamp, timestamp)
      .run();

    if ((result.meta.changes ?? 0) > 0) {
      return { revision: 1, snapshot: input.snapshot, updatedAt: timestamp };
    }
  } else {
    const result = await database
      .prepare(
        `UPDATE tracker_state
         SET owner_email = ?, revision = revision + 1, snapshot_json = ?, updated_at = ?
         WHERE owner_id = ? AND revision = ?`,
      )
      .bind(
        user.email,
        snapshotJson,
        timestamp,
        user.id,
        input.baseRevision,
      )
      .run();

    if ((result.meta.changes ?? 0) > 0) {
      return {
        revision: input.baseRevision + 1,
        snapshot: input.snapshot,
        updatedAt: timestamp,
      };
    }
  }

  const current = await getCloudState(database, user.id);
  throw new CloudConflictError(current);
}

export class CloudConflictError extends HttpError {
  constructor(public readonly current: CloudStateEnvelope | null) {
    super(409, "Cloud data changed in another session.");
  }
}
