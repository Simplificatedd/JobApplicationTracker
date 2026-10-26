import { describe, expect, it, vi } from "vitest";
import { onRequest } from "./[[path]]";

function context(
  storageKey: string,
  metadata: { file_size: number; mime_type: string } | null = null,
  getObject: () => Promise<unknown> = async () => null,
) {
  const first = vi.fn(async () => metadata && ({ ...metadata, lifecycle: "ready", content_hash: null }));
  const budget = vi.fn(async () => ({ operation_count: 1 }));
  const database = {
    prepare: (query: string) => ({
      bind: () => ({ first: query.includes("FROM resume_objects") ? first : budget }),
    }),
  };
  const request = new Request(
    `http://127.0.0.1:8788/api/resume-files/${storageKey}`,
    { headers: { "X-Tracker-Account-Id": "local:student@example.edu" } },
  );
  return {
    request,
    env: {
      DB: database,
      RESUME_FILES: { get: getObject },
      LOCAL_DEV_AUTH_EMAIL: "student@example.edu",
    },
  } as never;
}

describe("resume GET error responses", () => {
  it("returns JSON for a malformed storage key", async () => {
    const response = await onRequest(context("bad%20key"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "The resume storage key is invalid." });
  });

  it("returns JSON when metadata is missing", async () => {
    const response = await onRequest(context("missing-file"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "The resume file could not be found." });
  });

  it("returns JSON when the R2 object is missing", async () => {
    const response = await onRequest(context(
      "missing-object",
      { file_size: 5, mime_type: "application/pdf" },
    ));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "The resume file could not be found." });
  });

  it("returns controlled JSON after an R2 rejection", async () => {
    const logging = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await onRequest(context(
        "broken-object",
        { file_size: 5, mime_type: "application/pdf" },
        async () => { throw new Error("R2 unavailable"); },
      ));
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: "The cloud storage service could not complete the request.",
      });
    } finally {
      logging.mockRestore();
    }
  });
});

describe("resume GET success and access boundaries", () => {
  function boundary({
    email = "student@example.edu",
    authenticated = true,
    exhausted = false,
    databaseFailure = false,
  } = {}) {
    const owner = "local:student@example.edu";
    const bind = vi.fn();
    const get = vi.fn(async () => ({ body: "%PDF-" }));
    const prepare = vi.fn((query: string) => ({
      bind: (...args: unknown[]) => {
        bind(query, ...args);
        return { first: async () => {
          if (databaseFailure) throw new Error("private D1 failure details");
          if (query.includes("FROM resume_objects")) {
            return args[0] === owner && args[1] === "owned-file"
              ? { file_size: 5, mime_type: "application/pdf", lifecycle: "ready", content_hash: null } : null;
          }
          return exhausted ? null : { operation_count: 1 };
        } };
      },
    }));
    return {
      bind, get, prepare,
      context: {
        request: new Request("http://127.0.0.1:8788/api/resume-files/owned-file", {
          headers: { "X-Tracker-Account-Id": `local:${email}` },
        }),
        env: {
          DB: { prepare }, RESUME_FILES: { get },
          ...(authenticated ? { LOCAL_DEV_AUTH_EMAIL: email } : {
            TEAM_DOMAIN: "https://test.cloudflareaccess.com", POLICY_AUD: "test-audience",
          }),
        },
      } as never,
    };
  }

  it("preserves successful PDF bytes, content headers, and private cache control", async () => {
    const fixture = boundary();
    const response = await onRequest(fixture.context);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("%PDF-");
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Length")).toBe("5");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(fixture.get).toHaveBeenCalledWith("local%3Astudent%40example.edu/owned-file");
  });

  it("rejects unauthenticated requests before accessing D1 or R2", async () => {
    const fixture = boundary({ authenticated: false });
    const response = await onRequest(fixture.context);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Sign in through Cloudflare Access to continue." });
    expect(fixture.prepare).not.toHaveBeenCalled();
    expect(fixture.get).not.toHaveBeenCalled();
  });

  it("cannot read another owner's key and does not access R2", async () => {
    const fixture = boundary({ email: "other@example.edu" });
    const response = await onRequest(fixture.context);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "The resume file could not be found." });
    expect(fixture.bind).toHaveBeenCalledWith(
      expect.stringMatching(/WHERE owner_id = \? AND storage_key = \?/),
      "local:other@example.edu", "owned-file",
    );
    expect(fixture.get).not.toHaveBeenCalled();
  });

  it("returns a controlled 429 when the read budget is exhausted", async () => {
    const fixture = boundary({ exhausted: true });
    const response = await onRequest(fixture.context);
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: "The monthly resume read safety limit has been reached. Try again next month.",
    });
    expect(fixture.get).not.toHaveBeenCalled();
  });

  it("contains unexpected D1 rejections without exposing their details", async () => {
    const fixture = boundary({ databaseFailure: true });
    const logging = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await onRequest(fixture.context);
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: "The cloud storage service could not complete the request.",
      });
      expect(fixture.get).not.toHaveBeenCalled();
    } finally { logging.mockRestore(); }
  });
});
