import { describe, expect, it, vi } from "vitest";
import { onRequest } from "./[[path]]";
import { snapshot } from "../../src/test/assessmentFixtures";

function context(path: string, method: string, protocol?: string, account = "local:student@example.edu") {
  const prepare = vi.fn(() => ({ bind: () => ({
    first: async () => ({ used_bytes: 0 }),
    run: async () => ({ meta: { changes: 1 } }),
  }) }));
  const remove = vi.fn();
  const headers = new Headers({ Origin: "http://127.0.0.1:8788", "X-Tracker-Account-Id": account });
  if (protocol !== undefined) headers.set("X-Tracker-Mutation-Protocol", protocol);
  const request = new Request(`http://127.0.0.1:8788/api/${path}`, {
    method, headers,
    ...(method === "PUT" ? { body: JSON.stringify({ baseRevision: null, snapshot: snapshot() }) } : {}),
  });
  return { prepare, remove, context: { request, env: {
    LOCAL_DEV_AUTH_EMAIL: "student@example.edu", DB: { prepare }, RESUME_FILES: { delete: remove },
  } } as never };
}

describe("safe mutation protocol boundary", () => {
  it.each([
    ["state", "PUT", undefined], ["state", "PUT", "0"], ["state", "PUT", "2"],
    ["resume-files/file", "PUT", undefined], ["resume-files/file", "DELETE", undefined],
  ])("blocks incompatible %s %s writers (%s) before storage", async (path, method, protocol) => {
    const fixture = context(path!, method!, protocol);
    const response = await onRequest(fixture.context);
    expect(response.status).toBe(426);
    expect(await response.json()).toEqual({ error: "This tracker version can no longer save safely. Reload the tracker before making changes." });
    expect(fixture.prepare).not.toHaveBeenCalled();
    expect(fixture.remove).not.toHaveBeenCalled();
  });

  it("accepts the current protocol without changing persisted snapshot format", async () => {
    const fixture = context("state", "PUT", "1");
    const response = await onRequest(fixture.context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ revision: 1, snapshot: snapshot() });
  });

  it("still rejects the wrong account before checking the mutation protocol", async () => {
    const fixture = context("state", "PUT", undefined, "other-account");
    const response = await onRequest(fixture.context);
    expect(response.status).toBe(412);
    expect(fixture.prepare).not.toHaveBeenCalled();
  });
});
