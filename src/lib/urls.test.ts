import { describe, expect, it } from "vitest";
import { getSafeHttpUrl, splitTextIntoLinkParts } from "./urls";

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

describe("splitTextIntoLinkParts", () => {
  it("links http and https URLs inside a paragraph", () => {
    expect(
      splitTextIntoLinkParts("Apply at https://example.com/jobs/1 today"),
    ).toEqual([
      { type: "text", text: "Apply at " },
      {
        href: "https://example.com/jobs/1",
        type: "link",
        text: "https://example.com/jobs/1",
      },
      { type: "text", text: " today" },
    ]);
    expect(splitTextIntoLinkParts("http://example.com")).toEqual([
      { href: "http://example.com/", type: "link", text: "http://example.com" },
    ]);
  });

  it("links several URLs and keeps the text between them", () => {
    const parts = splitTextIntoLinkParts(
      "Portal: https://a.example/x\nTeam: HTTPS://b.example/y",
    );

    expect(parts.filter((part) => part.type === "link")).toEqual([
      { href: "https://a.example/x", type: "link", text: "https://a.example/x" },
      { href: "https://b.example/y", type: "link", text: "HTTPS://b.example/y" },
    ]);
    expect(parts.map((part) => part.text).join("")).toBe(
      "Portal: https://a.example/x\nTeam: HTTPS://b.example/y",
    );
  });

  it.each([
    ["See https://example.com/jobs.", "https://example.com/jobs", "."],
    ["Visit https://example.com/a, then", "https://example.com/a", ", then"],
    ["Is it https://example.com/faq?", "https://example.com/faq", "?"],
    ["(see https://example.com/x)", "https://example.com/x", ")"],
    ['"https://example.com/q"', "https://example.com/q", '"'],
  ])("leaves trailing punctuation out of %s", (text, url, after) => {
    const parts = splitTextIntoLinkParts(text);
    const link = parts.find((part) => part.type === "link");

    expect(link?.text).toBe(url);
    expect(parts.at(-1)).toEqual({ type: "text", text: after });
  });

  it("keeps a closing bracket that belongs to the URL", () => {
    expect(
      splitTextIntoLinkParts("https://en.wikipedia.org/wiki/Acme_(company)")[0],
    ).toMatchObject({
      text: "https://en.wikipedia.org/wiki/Acme_(company)",
      type: "link",
    });
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,hello",
    "ftp://example.com/file",
    "mailto:hr@example.com",
    "example.com/jobs",
    "Built with Node.js",
    "https://",
  ])("leaves %s as plain text", (text) => {
    expect(splitTextIntoLinkParts(text)).toEqual([{ type: "text", text }]);
  });

  it("preserves line breaks, spacing, and bullet-like text", () => {
    const text = "Requirements:\n\n- React\n  • TypeScript";

    expect(splitTextIntoLinkParts(text)).toEqual([{ type: "text", text }]);
  });

  it("returns no parts for empty text", () => {
    expect(splitTextIntoLinkParts("")).toEqual([]);
  });
});
