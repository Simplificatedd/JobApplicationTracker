import { describe, expect, it } from "vitest";
import { isSectionReached } from "./SettingsPage";

describe("isSectionReached", () => {
  it("keeps the original 140px threshold where sections land 112px down (lg)", () => {
    expect(isSectionReached(140, 112)).toBe(true);
    expect(isSectionReached(141, 112)).toBe(false);
  });

  it("counts a section reached where a jump lands it below the header and strip", () => {
    // 640-1023px: 85px header + 52px strip + 12px gap. A fixed 140px
    // threshold left the previous section highlighted here.
    expect(isSectionReached(149, 149)).toBe(true);
    // Phones: 53px header + 52px strip + 12px gap.
    expect(isSectionReached(117, 117)).toBe(true);
  });

  it("does not count a section that is still well below its landing point", () => {
    expect(isSectionReached(400, 149)).toBe(false);
  });
});
