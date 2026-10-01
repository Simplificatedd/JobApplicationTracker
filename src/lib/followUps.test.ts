import { describe, expect, it } from "vitest";
import {
  createFollowUpScheduleUpdate,
  createHandledFollowUpUpdate,
  normalizeFollowUpDateInput,
  normalizeFollowUpPromptDays,
  scheduleFollowUpAfterDays,
  validateFollowUpAutoReset,
  validateFollowUpSchedule,
} from "./followUps";

describe("normalizeFollowUpDateInput", () => {
  it("uses undefined for a deliberately blank date", () => {
    expect(normalizeFollowUpDateInput("   ")).toBeUndefined();
  });

  it("accepts a real calendar date", () => {
    expect(normalizeFollowUpDateInput(" 2026-10-08 ")).toBe("2026-10-08");
  });

  it.each(["8 October 2026", "2026-02-31"])(
    "rejects the invalid date %s",
    (date) => {
      expect(normalizeFollowUpDateInput(date)).toBeNull();
    },
  );
});

describe("follow-up schedule validation", () => {
  it("allows an optional follow-up to have no date", () => {
    expect(validateFollowUpSchedule("optional", "")).toBeUndefined();
    expect(createFollowUpScheduleUpdate("optional", "")).toEqual({
      followUpDate: undefined,
      followUpNeeded: false,
    });
  });

  it("requires a date for a compulsory follow-up", () => {
    expect(validateFollowUpSchedule("compulsory", "")).toContain("required");
    expect(createFollowUpScheduleUpdate("compulsory", "")).toBeNull();
  });

  it("preserves a date when the requirement changes", () => {
    expect(
      createFollowUpScheduleUpdate("optional", "2026-10-08"),
    ).toEqual({
      followUpDate: "2026-10-08",
      followUpNeeded: false,
    });
    expect(
      createFollowUpScheduleUpdate("compulsory", "2026-10-08"),
    ).toEqual({
      followUpDate: "2026-10-08",
      followUpNeeded: true,
    });
  });
});

describe("scheduleFollowUpAfterDays", () => {
  it("schedules from the local current date across month boundaries", () => {
    expect(
      scheduleFollowUpAfterDays(3, new Date(2026, 9, 30, 23, 45)),
    ).toBe("2026-11-02");
  });

  it.each([-1, 1.5, Number.NaN])("rejects invalid duration %s", (days) => {
    expect(scheduleFollowUpAfterDays(days)).toBeNull();
  });
});

describe("follow-up auto-reset validation", () => {
  it("uses the configured fallback when the field is blank", () => {
    expect(normalizeFollowUpPromptDays("", 3)).toBe(3);
  });

  it.each([-1, 0, 1.5, "tomorrow"])(
    "rejects invalid prompt days %s",
    (days) => {
      expect(normalizeFollowUpPromptDays(days)).toBeNull();
      expect(validateFollowUpAutoReset(true, days)).toContain("positive");
    },
  );

  it("does not block invalid stored timing while auto-reset is disabled", () => {
    expect(validateFollowUpAutoReset(false, -1)).toBeUndefined();
  });
});

describe("createHandledFollowUpUpdate", () => {
  const now = new Date(2026, 9, 1, 14, 30);

  it("clears a handled follow-up when auto-reset is off", () => {
    expect(
      createHandledFollowUpUpdate(
        {
          followUpAutoResetEnabled: false,
          followUpNeeded: true,
          followUpPromptDays: 3,
        },
        now,
      ),
    ).toEqual({ followUpDate: undefined, followUpNeeded: false });
  });

  it("schedules the next compulsory follow-up when auto-reset is on", () => {
    expect(
      createHandledFollowUpUpdate(
        {
          followUpAutoResetEnabled: true,
          followUpNeeded: true,
          followUpPromptDays: 3,
        },
        now,
      ),
    ).toEqual({ followUpDate: "2026-10-04", followUpNeeded: true });
  });

  it("preserves an optional requirement when auto-reset is on", () => {
    expect(
      createHandledFollowUpUpdate(
        {
          followUpAutoResetEnabled: true,
          followUpNeeded: false,
          followUpPromptDays: 7,
        },
        now,
      ),
    ).toEqual({ followUpDate: "2026-10-08", followUpNeeded: false });
  });

  it("uses the safe default for a malformed legacy interval", () => {
    expect(
      createHandledFollowUpUpdate(
        {
          followUpAutoResetEnabled: true,
          followUpNeeded: true,
          followUpPromptDays: -3,
        },
        now,
      ),
    ).toEqual({ followUpDate: "2026-10-08", followUpNeeded: true });
  });
});
