import { describe, expect, it, vi } from "vitest";
import { onRequest } from "./[[path]]";

function context(
  storageKey: string,
  metadata: { file_size: number; mime_type: string } | null = null,
  getObject: () => Promise<unknown> = async () => null,
) {
  const first = vi.fn(async () => metadata);
  const budget = vi.fn(async () => ({ operation_count: 1 }));
  const database = {
    prepare: (query: string) => ({
      bind: () => ({ first: query.includes("FROM resume_objects") ? first : budget }),
    }),
  };
  const request = new Request(
    `http://127.0.0.1:8788/api/resume-files/${storageKey}`,
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
