import { describe, expect, it } from "vitest";
import { snapshot } from "../test/assessmentFixtures";
import { snapshotWithBytes } from "../test/snapshotSize";
import {
  CloudSnapshotSizeError,
  D1_MAX_ROW_BYTES,
  MAX_CLOUD_SNAPSHOT_BYTES,
  serializeCloudSnapshot,
} from "./snapshotSize";

describe("cloud snapshot byte policy", () => {
  it("accepts small snapshots and reserves headroom below the decimal D1 row limit", () => {
    expect(serializeCloudSnapshot({}).json).toBe("{}");
    expect(serializeCloudSnapshot(snapshot()).bytes).toBeGreaterThan(2);
    expect(D1_MAX_ROW_BYTES - MAX_CLOUD_SNAPSHOT_BYTES).toBe(100_000);
  });

  it.each([-1, 0, 1])("enforces the exact UTF-8 boundary at limit %+d", (offset) => {
    const data = snapshotWithBytes(MAX_CLOUD_SNAPSHOT_BYTES + offset);
    expect(new TextEncoder().encode(JSON.stringify(data)).byteLength).toBe(MAX_CLOUD_SNAPSHOT_BYTES + offset);
    if (offset <= 0) expect(serializeCloudSnapshot(data).bytes).toBe(MAX_CLOUD_SNAPSHOT_BYTES + offset);
    else expect(() => serializeCloudSnapshot(data)).toThrow(CloudSnapshotSizeError);
  });

  it("counts multibyte text and JSON escaping rather than JavaScript characters", () => {
    const data = snapshotWithBytes(MAX_CLOUD_SNAPSHOT_BYTES);
    const notes = data.applications[0].notes!;
    for (const [replacement, additional] of [["界", 2], ["😀", 3], ["\n", 1], ['"', 1], ["\\", 1], ["\u0000", 5], ["\ud800", 5]] as const) {
      data.applications[0].notes = notes.slice(1) + replacement;
      const error = (() => { try { serializeCloudSnapshot(data); } catch (error) { return error; } })();
      expect(error).toMatchObject({ actualBytes: MAX_CLOUD_SNAPSHOT_BYTES + additional });
    }
  });

  it("includes child records and document metadata while preserving unknown fields", () => {
    const data = { ...snapshotWithBytes(MAX_CLOUD_SNAPSHOT_BYTES), extension: "keep" };
    expect(() => serializeCloudSnapshot(data)).toThrow(CloudSnapshotSizeError);
    data.applications[0].notes = "";
    data.contacts.push({ id: "contact", applicationId: "app-1", name: "界".repeat(650_000), createdAt: "now", updatedAt: "now" });
    expect(() => serializeCloudSnapshot(data)).toThrow(CloudSnapshotSizeError);
    data.contacts = [];
    data.resumes.push({ id: "doc", storageKey: "file", displayName: "Resume", originalFileName: "r.pdf", downloadFileName: "r.pdf", fileExtension: "pdf", mimeType: "application/pdf", contentHash: "hash", fileSize: 100_000_000, uploadedAt: "now", updatedAt: "now", notes: "x".repeat(MAX_CLOUD_SNAPSHOT_BYTES) });
    expect(() => serializeCloudSnapshot(data)).toThrow(CloudSnapshotSizeError);
  });
});
