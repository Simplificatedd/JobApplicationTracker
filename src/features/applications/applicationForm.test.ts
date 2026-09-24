import { describe, expect, it } from "vitest";
import { suggestFollowUpDate } from "./applicationForm";

describe("suggestFollowUpDate", () => {
  it("suggests a date from the selected applied date", () => {
    expect(suggestFollowUpDate("2026-09-24", 7)).toBe("2026-10-01");
  });

  it("uses the local current date when the applied date is blank", () => {
    expect(
      suggestFollowUpDate("", 3, new Date(2026, 11, 30, 23, 45)),
    ).toBe("2027-01-02");
  });

  it("falls back safely when an applied date is invalid", () => {
    expect(
      suggestFollowUpDate("2026-02-31", 1, new Date(2026, 8, 24)),
    ).toBe("2026-09-25");
  });
});
