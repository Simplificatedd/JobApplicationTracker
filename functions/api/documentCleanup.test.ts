import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequest } from "./[[path]]";
import { SqliteD1, MemoryR2, documentEnvironment } from "../../src/test/documentServer";

let db: SqliteD1, r2: MemoryR2;
beforeEach(() => { db = new SqliteD1(); r2 = new MemoryR2(); });
afterEach(() => { db.close(); });
function context({ account = "local:student@example.edu", protocol = "1", origin = "http://127.0.0.1:8788", method = "POST", signedIn = true } = {}) {
  return { request: new Request("http://127.0.0.1:8788/api/document-cleanup", {
    method, headers: { Origin: origin, "X-Tracker-Account-Id": account, "X-Tracker-Mutation-Protocol": protocol },
  }), env: { ...documentEnvironment(db, r2), ...(signedIn ? { LOCAL_DEV_AUTH_EMAIL: "student@example.edu" } : {
    TEAM_DOMAIN: "https://test.cloudflareaccess.com", POLICY_AUD: "test-audience",
  }) } } as never;
}
describe("document cleanup access boundary", () => {
  it.each([
    [{ account: "other" }, 412], [{ protocol: "0" }, 426], [{ protocol: "" }, 426],
    [{ origin: "https://other.test" }, 403], [{ method: "GET" }, 405], [{ signedIn: false }, 401],
  ] as const)("rejects invalid cleanup requests before storage (%j)", async (options, status) => {
    const prepare = vi.spyOn(db, "prepare"), list = vi.spyOn(r2, "list"), remove = vi.spyOn(r2, "delete");
    const response = await onRequest(context(options));
    expect(response.status).toBe(status);
    expect(prepare).not.toHaveBeenCalled(); expect(list).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
  });
  it("reconciles only the verified owner and returns an explicit cleanup result", async () => {
    const list = vi.spyOn(r2, "list");
    const response = await onRequest(context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ removed: 0, failed: 0, pending: 0 });
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ prefix: "local%3Astudent%40example.edu/", limit: 10 }));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
