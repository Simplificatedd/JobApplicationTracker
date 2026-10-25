import { describe, expect, it } from "vitest";
import { getScrollEdges, getWheelScrollLeft } from "./useScrollStrip";

const strip = { clientWidth: 300, scrollWidth: 700 };

describe("getScrollEdges", () => {
  it("hints only at the end when scrolled to the start", () => {
    expect(getScrollEdges({ ...strip, scrollLeft: 0 })).toEqual({
      hasMoreAfter: true,
      hasMoreBefore: false,
    });
  });

  it("hints at both edges in the middle", () => {
    expect(getScrollEdges({ ...strip, scrollLeft: 200 })).toEqual({
      hasMoreAfter: true,
      hasMoreBefore: true,
    });
  });

  it("hints only at the start when scrolled to the end, allowing a fractional pixel", () => {
    expect(getScrollEdges({ ...strip, scrollLeft: 399.5 })).toEqual({
      hasMoreAfter: false,
      hasMoreBefore: true,
    });
  });

  it("shows no hint when everything fits", () => {
    expect(getScrollEdges({ clientWidth: 300, scrollLeft: 0, scrollWidth: 300 })).toEqual({
      hasMoreAfter: false,
      hasMoreBefore: false,
    });
  });
});

describe("getWheelScrollLeft", () => {
  it("turns a vertical wheel gesture into horizontal strip scrolling", () => {
    expect(getWheelScrollLeft({ ...strip, scrollLeft: 100 }, 0, 120)).toBe(220);
    expect(getWheelScrollLeft({ ...strip, scrollLeft: 100 }, 0, -60)).toBe(40);
  });

  it("clamps to the strip's ends", () => {
    expect(getWheelScrollLeft({ ...strip, scrollLeft: 350 }, 0, 120)).toBe(400);
    expect(getWheelScrollLeft({ ...strip, scrollLeft: 30 }, 0, -120)).toBe(0);
  });

  it("leaves the page to scroll at an end, for horizontal gestures, or when nothing overflows", () => {
    expect(getWheelScrollLeft({ ...strip, scrollLeft: 400 }, 0, 120)).toBeNull();
    expect(getWheelScrollLeft({ ...strip, scrollLeft: 0 }, 0, -120)).toBeNull();
    expect(getWheelScrollLeft({ ...strip, scrollLeft: 100 }, 80, 20)).toBeNull();
    expect(
      getWheelScrollLeft({ clientWidth: 300, scrollLeft: 0, scrollWidth: 300 }, 0, 120),
    ).toBeNull();
  });
});
