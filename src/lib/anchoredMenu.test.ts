import { describe, expect, it } from "vitest";
import { getAnchoredMenuPosition, offsetForContainingBlock } from "./anchoredMenu";

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

describe("offsetForContainingBlock", () => {
  it.each([
    ["a safe-area border", { left: 17, top: 23, clientLeft: 59, clientTop: 11 }, { left: 100, top: 134 }],
    ["a zero-offset dialog", { left: 0, top: 0, clientLeft: 0, clientTop: 0 }, { left: 176, top: 168 }],
    ["a null container", null, { left: 176, top: 168 }],
    ["an undefined container", undefined, { left: 176, top: 168 }],
  ])("returns a new position for %s without mutating the input", (_, offset, expected) => {
    const position = Object.freeze({ left: 176, top: 168 });
    const container = offset == null ? offset : {
      getBoundingClientRect: () => ({ left: offset.left, top: offset.top }),
      clientLeft: offset.clientLeft,
      clientTop: offset.clientTop,
    };

    const result = offsetForContainingBlock(position, container);

    expect(result).toEqual(expected);
    expect(result).not.toBe(position);
    expect(position).toEqual({ left: 176, top: 168 });
  });
});
