import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("phone form fields", () => {
  it("raises field controls to 44px below md and keeps 40px from md", () => {
    expect(css).toMatch(/\.field-control\s*\{\s*min-height:\s*2\.5rem;/);
    expect(css).toMatch(/max-width:\s*767\.98px\)\s*\{\s*\.field-control\s*\{\s*min-height:\s*2\.75rem;/);
  });
});

describe("tailwind variants", () => {
  it("keeps max-* variants and lets short: override xl:", async () => {
    const [{ default: postcss }, { default: tailwindcss }, { default: config }] = await Promise.all([
      import("postcss"),
      import("tailwindcss"),
      import("../tailwind.config"),
    ]);
    const { css: generated } = await postcss([
      tailwindcss({ ...config, content: [{ raw: "max-md:hidden xl:py-4 short:py-2", extension: "html" }] }),
    ]).process("@tailwind utilities;", { from: undefined });

    // A raw screen in theme.screens silently drops every max-* class.
    expect(generated).toContain(".max-md\\:hidden");
    expect(generated).toMatch(/max-height: 700px\)\s*\{\s*:root \.short\\:py-2/);
  });
});
