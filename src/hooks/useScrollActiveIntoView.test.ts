import { describe, expect, it } from "vitest";
import { getHorizontalScrollDelta } from "./useScrollActiveIntoView";

const strip = { left: 16, right: 359 };

describe("getHorizontalScrollDelta", () => {
  it("leaves the strip alone when the item is fully visible", () => {
    expect(getHorizontalScrollDelta(strip, { left: 40, right: 160 })).toBe(0);
    expect(getHorizontalScrollDelta(strip, { left: 16, right: 359 })).toBe(0);
  });

  it("scrolls forward past an item clipped on the right, with padding", () => {
    expect(getHorizontalScrollDelta(strip, { left: 300, right: 420 })).toBe(85);
  });

  it("scrolls back to an item clipped on the left, with padding", () => {
    expect(getHorizontalScrollDelta(strip, { left: -50, right: 70 })).toBe(-90);
  });
});
