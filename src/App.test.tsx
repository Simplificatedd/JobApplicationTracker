import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StorageLoading } from "./App";

describe("cloud loading screen", () => {
  it("is announced as a status with a decorative spinner that respects reduced motion", () => {
    const html = renderToStaticMarkup(<StorageLoading />);

    expect(html).toMatch(/^<section [^>]*role="status"/);
    expect(html).toContain("Loading your cloud tracker");
    expect(html).toContain("Your signed-in workspace is syncing securely.");
    const spinner = /<svg[^>]*>/.exec(html)?.[0] ?? "";
    expect(spinner).toContain('aria-hidden="true"');
    expect(spinner).toMatch(/class="[^"]*motion-safe:animate-spin/);
    expect(html).not.toMatch(/[\s"]animate-spin/);
  });
});
