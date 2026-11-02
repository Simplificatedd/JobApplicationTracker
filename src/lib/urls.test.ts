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

  it.each([
    ["**https://example.com/a**", "https://example.com/a"],
    ["See https://example.com/b\u2026", "https://example.com/b"],
    ["\u8be6\u89c1 https://example.com/c\u3002", "https://example.com/c"],
    ["<https://example.com/d>", "https://example.com/d"],
    ["https://example.com:8443/x?y=1#z.", "https://example.com:8443/x?y=1#z"],
  ])("finds the URL in %s", (text, url) => {
    expect(
      splitTextIntoLinkParts(text).find((part) => part.type === "link")?.text,
    ).toBe(url);
  });

  it("links a safe URL that follows an invalid one", () => {
    const links = splitTextIntoLinkParts(
      "Bad https://example.com:99999 then https://example.com/ok",
    ).filter((part) => part.type === "link");

    expect(links.map((part) => part.text)).toEqual(["https://example.com/ok"]);
  });

  it.each([
    "xhttps://example.com",
    "javascript:https://example.com",
    "https://jobs.example.com@other.example/path",
    "https://user:secret@example.com",
  ])("does not link %s", (text) => {
    expect(
      splitTextIntoLinkParts(text).some((part) => part.type === "link"),
    ).toBe(false);
  });

  it.each([2000, 40000])(
    "handles %i trailing closing brackets quickly",
    (count) => {
      const text = `https://example.com/${")".repeat(count)}`;
      const startedAt = performance.now();
      const parts = splitTextIntoLinkParts(text);

      expect(performance.now() - startedAt).toBeLessThan(500);
      expect(parts.map((part) => part.text).join("")).toBe(text);
    },
  );

  it("preserves line breaks, spacing, and bullet-like text", () => {
    const text = "Requirements:\n\n- React\n  • TypeScript";

    expect(splitTextIntoLinkParts(text)).toEqual([{ type: "text", text }]);
  });

  it("returns no parts for empty text", () => {
    expect(splitTextIntoLinkParts("")).toEqual([]);
  });
});
