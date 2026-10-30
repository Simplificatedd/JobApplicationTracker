import { afterEach, describe, expect, it, vi } from "vitest";
import { dateTimeEditValue, isValidDateTime, toDateTimeLocal } from "./dateTime";

afterEach(() => vi.unstubAllEnvs());
describe("datetime edit boundaries", () => {
  it.each(["2026-99-99T99:99", "2026-02-29T12:00", "2026-04-31T12:00", "2026-10-30T24:00", "2026-10-30T12:60", "2026-10-30T12:00junk"])("rejects %s", value => {
    expect(isValidDateTime(value)).toBe(false);
  });
  it.each(["2028-02-29T12:00", "2026-10-30T12:00:30.123Z", "2026-10-30T12:00+08:00"])("accepts %s", value => {
    expect(isValidDateTime(value)).toBe(true);
  });
  it.each(["UTC", "Asia/Singapore", "America/New_York"])("preserves no-op instants and precision in %s", zone => {
    vi.stubEnv("TZ", zone);
    for (const value of ["2026-10-30T04:00:30.123Z", "2026-10-30T12:00:30+08:00"]) {
      expect(dateTimeEditValue(toDateTimeLocal(value), value)).toBe(value);
    }
  });
  it("converts a changed absolute time, retains legacy local times and allows clearing", () => {
    vi.stubEnv("TZ", "Asia/Singapore");
    expect(toDateTimeLocal("2026-10-30T04:00:00Z")).toBe("2026-10-30T12:00");
    expect(dateTimeEditValue("2026-10-30T13:00", "2026-10-30T04:00:00Z")).toBe("2026-10-30T05:00:00.000Z");
    expect(dateTimeEditValue("2026-10-30T13:00", "2026-10-30T12:00")).toBe("2026-10-30T13:00");
    expect(dateTimeEditValue("", "2026-10-30T04:00:00Z")).toBeUndefined();
    expect(dateTimeEditValue("", "invalid")).toBeUndefined();
    expect(toDateTimeLocal("invalid")).toBe("");
  });
});
