import { afterEach, describe, expect, it, vi } from "vitest";
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

// Formatters capture the time zone when the module loads, so reload per zone.
async function loadFormatIn(zone: string) {
  vi.stubEnv("TZ", zone);
  vi.resetModules();
  return import("./format");
}

afterEach(() => vi.unstubAllEnvs());

describe.each(["UTC", "Asia/Singapore", "America/Los_Angeles"])("date display in %s", zone => {
  it("shows a date-only value on its own calendar day (#196)", async () => {
    const { formatDate, formatDateRange, formatDeadline } = await loadFormatIn(zone);
    expect(formatDate("2026-11-05")).toBe("05 Nov 2026");
    expect(formatDeadline("2026-11-05")).toBe("05 Nov 2026");
    expect(formatDateRange("2026-09-01", "2026-12-31")).toBe("01 Sept 2026 - 31 Dec 2026");
    expect(formatDate("2026-01-01")).toBe("01 Jan 2026");
    // US daylight saving starts on 8 Mar and ends on 1 Nov 2026.
    expect(formatDate("2026-03-08")).toBe("08 Mar 2026");
    expect(formatDate("2026-11-01")).toBe("01 Nov 2026");
    expect(formatDate("2028-02-29")).toBe("29 Feb 2028");
    expect(formatDate("2026-02-29")).toBe("Invalid date");
  });

  it("shows the same day that reminders use for a date-only value", async () => {
    const { formatDate } = await loadFormatIn(zone);
    const { parseDateValue } = await import("./dateTime");
    const due = parseDateValue("2026-11-05")!;
    expect([due.getFullYear(), due.getMonth(), due.getDate()]).toEqual([2026, 10, 5]);
    expect(formatDate("2026-11-05")).toBe(formatDate(`2026-11-05T${String(due.getHours()).padStart(2, "0")}:00`));
  });

  it("keeps formatting timestamps in the viewer's time zone", async () => {
    const { formatDate, formatDateTime, formatDeadline, formatUpdatedAt } = await loadFormatIn(zone);
    const instant = {
      UTC: ["04 Nov 2026", "04 Nov 2026, 06:30 pm", "05 Nov 2026, 06:30 am"],
      "Asia/Singapore": ["05 Nov 2026", "05 Nov 2026, 02:30 am", "05 Nov 2026, 02:30 pm"],
      "America/Los_Angeles": ["04 Nov 2026", "04 Nov 2026, 10:30 am", "04 Nov 2026, 10:30 pm"],
    }[zone]!;
    expect(formatDate("2026-11-04T18:30:00.000Z")).toBe(instant[0]);
    expect(formatUpdatedAt("2026-11-04T18:30:00.000Z")).toBe(instant[1]);
    expect(formatDeadline("2026-11-05T14:30:00+08:00")).toBe(instant[2]);
    // A saved local date and time without an offset stays as entered.
    expect(formatDateTime("2026-11-05T14:30")).toBe("05 Nov 2026, 02:30 pm");
    expect(formatDeadline("2026-11-05T14:30")).toBe("05 Nov 2026, 02:30 pm");
  });
});
