import { describe, expect, it, vi } from "vitest";
import { onRequest } from "./[[path]]";
import { snapshotWithBytes } from "../../src/test/snapshotSize";
import { CLOUD_SNAPSHOT_SIZE_MESSAGE, MAX_CLOUD_SNAPSHOT_BYTES } from "../../src/storage/snapshotSize";
import { MUTATION_PROTOCOL_VERSION } from "../../src/storage/mutationProtocol";

describe("snapshot size HTTP boundary", () => {
  it("rejects a protocol-compatible client that bypasses preflight with a structured 413 before D1", async () => {
    const prepare = vi.fn();
    const request = new Request("http://127.0.0.1:8788/api/state", {
      method: "PUT",
      headers: { Origin: "http://127.0.0.1:8788", "X-Tracker-Account-Id": "local:student@example.edu", "X-Tracker-Mutation-Protocol": MUTATION_PROTOCOL_VERSION },
      body: JSON.stringify({ baseRevision: 1, snapshot: snapshotWithBytes(MAX_CLOUD_SNAPSHOT_BYTES + 1) }),
    });
    const response = await onRequest({ request, env: { LOCAL_DEV_AUTH_EMAIL: "student@example.edu", DB: { prepare } } } as never);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: CLOUD_SNAPSHOT_SIZE_MESSAGE });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(prepare).not.toHaveBeenCalled();
  });
});
