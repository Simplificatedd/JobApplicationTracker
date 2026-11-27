import { describe, expect, it } from "vitest";
import { errorResponse, HttpError, requireBindings, requireSameOriginMutation } from "./http";

describe("requireSameOriginMutation", () => {
  it("allows reads and same-origin writes", () => {
    expect(() =>
      requireSameOriginMutation(
        new Request("https://tracker.example/api/state"),
      ),
    ).not.toThrow();
    expect(() =>
      requireSameOriginMutation(
        new Request("https://tracker.example/api/state", {
          headers: { Origin: "https://tracker.example" },
          method: "PUT",
        }),
      ),
    ).not.toThrow();
  });

  it("rejects missing or cross-origin write origins", () => {
    for (const origin of [undefined, "https://malicious.example"]) {
      expect(() =>
        requireSameOriginMutation(
          new Request("https://tracker.example/api/state", {
            headers: origin ? { Origin: origin } : undefined,
            method: "PUT",
          }),
        ),
      ).toThrowError(
        expect.objectContaining({ status: 403 }) as unknown as HttpError,
      );
    }
  });
});

describe("setup errors (#354)", () => {
  it("names the migration step when a D1 table is missing", async () => {
    const response = errorResponse(new Error("D1_ERROR: no such table: tracker_state: SQLITE_ERROR"));
    expect(response.status).toBe(500);
    expect(((await response.json()) as { error: string }).error).toContain("Apply the D1 migrations");
  });

  it("keeps the generic message for other server errors", async () => {
    const response = errorResponse(new Error("Something else"));
    expect(((await response.json()) as { error: string }).error).toBe("The cloud storage service could not complete the request.");
  });

  it("names a missing binding", () => {
    expect(() => requireBindings({ RESUME_FILES: {} }, ["DB"])).toThrow("The DB binding is missing");
    expect(() => requireBindings({ DB: {} }, ["DB", "RESUME_FILES"])).toThrow("The RESUME_FILES binding is missing");
    expect(() => requireBindings({ DB: {} }, ["DB"])).not.toThrow();
  });
});
