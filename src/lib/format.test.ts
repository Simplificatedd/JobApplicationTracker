import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateRange,
  formatDateTime,
  formatDeadline,
  formatUpdatedAt,
} from "./format";

describe("optional date formatting", () => {
  it("renders a missing date as an empty value", () => {
    expect(formatDate()).toBe("");
  });

  it("joins only the role dates that are present", () => {
    const start = formatDate("2026-09-01");
    const end = formatDate("2026-12-01");

    expect(formatDateRange()).toBe("");
    expect(formatDateRange("2026-09-01")).toBe(start);
    expect(formatDateRange(undefined, "2026-12-01")).toBe(end);
    expect(formatDateRange("2026-09-01", "2026-12-01")).toBe(
      `${start} - ${end}`,
    );
  });

  it("includes time only when a deadline has one", () => {
    expect(formatDeadline()).toBe("");
    expect(formatDeadline("2026-09-24")).toBe(formatDate("2026-09-24"));
    expect(formatDeadline("2026-09-24T17:30")).toBe(
      formatDateTime("2026-09-24T17:30"),
    );
  });
});


it.each(["not a date", "2026-99-99T99:99", "2026-02-31T12:00"])("safely displays invalid stored date %s", value => {
  expect(formatDate(value)).toBe("Invalid date"); expect(formatDeadline(value)).toBe("Invalid date");
  expect(formatDateTime(value)).toBe("Invalid date"); expect(formatUpdatedAt(value)).toBe("Invalid date");
});
