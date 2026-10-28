import { requestControlEnv } from "../../src/test/requestControl";
import { describe, expect, it } from "vitest";
import { onRequest } from "./[[path]]";

const env = () => ({ ...requestControlEnv(), LOCAL_DEV_AUTH_EMAIL: "student@example.edu" });

async function call(path: string, accountId?: string) {
  const request = new Request(`http://127.0.0.1:8788/api/${path}`, {
    headers: accountId ? { "X-Tracker-Account-Id": accountId } : undefined,
  });
  return onRequest({ request, env: env() } as never);
}

describe("cloud account binding", () => {
  it("returns the verified stable identity in the session response", async () => {
    const response = await call("session");
    expect(await response.json()).toEqual({
      id: "local:student@example.edu",
      email: "student@example.edu",
    });
  });

  it.each(["state", "resume-files/file-1"])(
    "rejects %s requests from a stale account before touching storage",
    async (path) => {
      const response = await call(path, "different-account");
      expect(response.status).toBe(412);
      expect(await response.json()).toEqual({
        error: "Signed-in account changed. Reload the tracker.",
      });
    },
  );
});
