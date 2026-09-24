import { describe, expect, it } from "vitest";
import type { Application } from "../types/application";
import { DEFAULT_USER_SETTINGS } from "./domain";
import {
  calculateFollowUpDueDate,
  classifyReminderSeverity,
  deriveApplicationNotifications,
} from "./reminders";

const baseApplication: Application = {
  id: "app-reminder",
  company: "Example Company",
  jobTitle: "Software Engineer",
  jobDescription: "",
  status: "Awaiting Response",
  workMode: "unknown",
  jobType: "internship",
  dateApplied: "2026-09-01",
  followUpNeeded: true,
  interviewProctored: false,
  deadlineEntryMode: "exact",
  priority: "medium",
  contactsCount: 0,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

describe("calculateFollowUpDueDate", () => {
  it("uses an explicit follow-up date before the configured default", () => {
    expect(
      calculateFollowUpDueDate(
        { ...baseApplication, followUpDate: "2026-09-12" },
        7,
      ),
    ).toBe("2026-09-12");
  });

  it("derives a follow-up date from the application date without timezone drift", () => {
    expect(calculateFollowUpDueDate(baseApplication, 7)).toBe("2026-09-08");
  });

  it("rejects an invalid application date", () => {
    expect(
      calculateFollowUpDueDate(
        { ...baseApplication, dateApplied: "2026-02-31" },
        7,
      ),
    ).toBeUndefined();
  });
});

describe("classifyReminderSeverity", () => {
  const now = new Date("2026-09-20T12:00:00.000Z");

  it("classifies overdue, current, and upcoming dates", () => {
    expect(classifyReminderSeverity("2026-09-19", 3, now)).toBe("overdue");
    expect(classifyReminderSeverity("2026-09-20", 3, now)).toBe("due_today");
    expect(classifyReminderSeverity("2026-09-22", 3, now)).toBe("due_soon");
    expect(classifyReminderSeverity("2026-09-30", 3, now)).toBe("upcoming");
  });

  it("keeps timestamp reminders tied to their exact instant", () => {
    expect(
      classifyReminderSeverity(
        "2026-09-21T00:30:00.000Z",
        3,
        new Date("2026-09-21T00:00:00.000Z"),
      ),
    ).toBe("due_today");
  });

  it("treats invalid date stamps as upcoming instead of rolling them over", () => {
    expect(classifyReminderSeverity("2026-02-31", 3, now)).toBe("upcoming");
  });
});

describe("deriveApplicationNotifications", () => {
  it("excludes final application statuses", () => {
    const notifications = deriveApplicationNotifications(
      { ...baseApplication, status: "Rejected" },
      DEFAULT_USER_SETTINGS,
      new Date("2026-09-20T12:00:00.000Z"),
    );

    expect(notifications).toEqual([]);
  });

  it("does not flag a follow-up before the due-soon window", () => {
    const notifications = deriveApplicationNotifications(
      { ...baseApplication, followUpDate: "2026-09-30" },
      { ...DEFAULT_USER_SETTINGS, dueSoonDays: 3 },
      new Date("2026-09-20T12:00:00.000Z"),
    );

    expect(notifications).toEqual([]);
  });

  it.each([
    ["2026-09-23", "due_soon"],
    ["2026-09-20", "due_today"],
    ["2026-09-19", "overdue"],
  ] as const)(
    "flags a follow-up dated %s as %s",
    (followUpDate, expectedSeverity) => {
      const notifications = deriveApplicationNotifications(
        { ...baseApplication, followUpDate },
        { ...DEFAULT_USER_SETTINGS, dueSoonDays: 3 },
        new Date("2026-09-20T12:00:00.000Z"),
      );

      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toMatchObject({
        severity: expectedSeverity,
        type: "follow_up",
      });
    },
  );
});
