// D1 limits a string/BLOB AND a complete row to 2,000,000 bytes:
// https://developers.cloudflare.com/d1/platform/limits/ (verified 2026-10-25).
// Leave 100,000 bytes (5%) for identity columns, timestamps and row encoding.
export const D1_MAX_ROW_BYTES = 2_000_000;
export const MAX_CLOUD_SNAPSHOT_BYTES = D1_MAX_ROW_BYTES - 100_000;

export const CLOUD_SNAPSHOT_SIZE_MESSAGE =
  "Tracker data exceeds the 1,900,000-byte cloud limit. Export a recovery archive, then remove unneeded records or shorten long notes and job descriptions before saving again. Your existing cloud data was not changed.";

const encoder = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

export class CloudSnapshotSizeError extends Error {
  constructor(public readonly actualBytes: number) {
    super(CLOUD_SNAPSHOT_SIZE_MESSAGE);
  }
}

// Return the exact measured JSON so persistence and transport can reuse it.
// Binary document files/base64 backup envelopes are not part of this value.
export function serializeCloudSnapshot(snapshot: object) {
  const json = JSON.stringify(snapshot);
  const bytes = utf8ByteLength(json);
  if (bytes > MAX_CLOUD_SNAPSHOT_BYTES) throw new CloudSnapshotSizeError(bytes);
  return { json, bytes };
}
