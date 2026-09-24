import { describe, expect, it } from "vitest";
import { getAnchoredMenuPosition } from "./anchoredMenu";

const anchor = { bottom: 140, left: 260, right: 300, top: 100 };

describe("getAnchoredMenuPosition", () => {
  it("aligns the menu below and to the right of its trigger", () => {
    expect(
      getAnchoredMenuPosition({
        anchor,
        menuHeight: 120,
        menuWidth: 176,
        viewportHeight: 500,
        viewportWidth: 500,
      }),
    ).toEqual({ left: 124, top: 148 });
  });

  it("flips above the trigger when the viewport is short", () => {
    expect(
      getAnchoredMenuPosition({
        anchor,
        menuHeight: 80,
        menuWidth: 176,
        viewportHeight: 200,
        viewportWidth: 500,
      }),
    ).toEqual({ left: 124, top: 12 });
  });

  it("clamps the menu within the horizontal viewport", () => {
    expect(
      getAnchoredMenuPosition({
        anchor: { bottom: 80, left: 0, right: 32, top: 40 },
        menuHeight: 80,
        menuWidth: 176,
        viewportHeight: 500,
        viewportWidth: 200,
      }),
    ).toEqual({ left: 8, top: 88 });
  });
});
