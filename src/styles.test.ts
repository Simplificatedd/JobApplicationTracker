import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("phone form fields", () => {
  it("raises field controls to 44px below md and keeps 40px from md", () => {
    expect(css).toMatch(/\.field-control\s*\{\s*min-height:\s*2\.5rem;/);
    expect(css).toMatch(/max-width:\s*767\.98px\)\s*\{\s*\.field-control\s*\{\s*min-height:\s*2\.75rem;/);
  });
});
