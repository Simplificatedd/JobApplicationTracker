import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PHONE_LAYOUT_QUERY } from "./usePhoneLayout";

describe("phone layout query", () => {
  it("matches every phone rule in styles.css, so JavaScript and CSS switch together", () => {
    const css = readFileSync("src/styles.css", "utf8");
    const queries = [...css.matchAll(/@media ([^{]*?)\s*\{/g)].map(([, query]) => query);
    const phoneQueries = queries.filter((query) => query.includes("768px"));

    expect(phoneQueries.length).toBeGreaterThan(0);
    expect(new Set(phoneQueries)).toEqual(new Set([PHONE_LAYOUT_QUERY]));
  });
});
