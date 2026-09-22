import type { StorageSnapshot } from "../../src/storage/StorageAdapter";
import { HttpError } from "./http";
import type {
  AuthenticatedUser,
  CloudStateEnvelope,
  SaveStateRequest,
} from "./types";

const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024;

interface StateRow {
  revision: number;
  snapshot_json: string;
  updated_at: string;
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

  if (!isRecord(value) || !isStorageSnapshot(value.snapshot)) {
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

  return {
    revision: row.revision,
    snapshot: JSON.parse(row.snapshot_json) as StorageSnapshot,
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
