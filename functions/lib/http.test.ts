import { describe, expect, it } from "vitest";
import { HttpError, requireSameOriginMutation } from "./http";

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
