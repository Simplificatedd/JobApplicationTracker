import { describe, expect, it } from "vitest";
import { getSafeHttpUrl } from "./urls";

describe("getSafeHttpUrl", () => {
  it("accepts and normalizes HTTP URLs", () => {
    expect(getSafeHttpUrl("https://example.com/jobs/123")).toBe(
      "https://example.com/jobs/123",
    );
    expect(getSafeHttpUrl("example.com/jobs/123")).toBe(
      "https://example.com/jobs/123",
    );
  });

  it("rejects executable and non-web URL schemes", () => {
    expect(getSafeHttpUrl("javascript:alert(1)")).toBeUndefined();
    expect(getSafeHttpUrl("data:text/html,hello")).toBeUndefined();
    expect(getSafeHttpUrl("file:///tmp/resume.pdf")).toBeUndefined();
  });

  it("rejects blank and malformed values", () => {
    expect(getSafeHttpUrl(" ")).toBeUndefined();
    expect(getSafeHttpUrl("not a url")).toBeUndefined();
  });
});
