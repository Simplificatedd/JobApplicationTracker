import { requestControlEnv } from "../../src/test/requestControl";
import { describe, expect, it, vi } from "vitest";
import { onRequest } from "./[[path]]";
import { snapshotWithBytes } from "../../src/test/snapshotSize";
import { CLOUD_SNAPSHOT_SIZE_MESSAGE, MAX_CLOUD_SNAPSHOT_BYTES } from "../../src/storage/snapshotSize";
import { MUTATION_PROTOCOL_VERSION } from "../../src/storage/mutationProtocol";
import { snapshot } from "../../src/test/assessmentFixtures";
import type { StorageSnapshot } from "../../src/storage/StorageAdapter";

function call(data: StorageSnapshot, database: object) {
  const request = new Request("http://127.0.0.1:8788/api/state", {
    method: "PUT",
    headers: { Origin: "http://127.0.0.1:8788", "X-Tracker-Account-Id": "local:student@example.edu", "X-Tracker-Mutation-Protocol": MUTATION_PROTOCOL_VERSION },
    body: JSON.stringify({ baseRevision: 1, snapshot: data }),
  });
  return onRequest({ request, env: { ...requestControlEnv(), LOCAL_DEV_AUTH_EMAIL: "student@example.edu", DB: database } } as never);
}

describe("snapshot size HTTP boundary", () => {
  it("rejects a protocol-compatible client that bypasses preflight with a structured 413 before D1", async () => {
    const prepare = vi.fn();
    const response = await call(snapshotWithBytes(MAX_CLOUD_SNAPSHOT_BYTES + 1), { prepare });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: CLOUD_SNAPSHOT_SIZE_MESSAGE });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(prepare).not.toHaveBeenCalled();
  });

  it("does not misclassify an unrelated D1 failure as a size error or conflict", async () => {
    const run = vi.fn().mockRejectedValue(new Error("D1 unavailable"));
    const prepare = vi.fn(() => ({ bind: () => ({ first: async () => ({ used_bytes: 0 }), run }) }));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await call(snapshot(), { prepare });
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "The cloud storage service could not complete the request." });
      expect(run).toHaveBeenCalledTimes(1);
    } finally { log.mockRestore(); }
  });
});
