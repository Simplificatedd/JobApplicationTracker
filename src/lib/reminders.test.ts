import { describe, expect, it } from "vitest";
import type { Application, Interview } from "../types/application";
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
  it.each(["Accepted", "Rejected", "Withdrawn"] as const)(
    "excludes the final %s status",
    (status) => {
      const notifications = deriveApplicationNotifications(
        { ...baseApplication, status },
        DEFAULT_USER_SETTINGS,
        new Date("2026-09-20T12:00:00.000Z"),
      );

      expect(notifications).toEqual([]);
    },
  );

  it("pauses ordinary reminders while an offer is pending", () => {
    const notifications = deriveApplicationNotifications(
      { ...baseApplication, status: "Offered" },
      DEFAULT_USER_SETTINGS,
      new Date("2026-09-20T12:00:00.000Z"),
    );

    expect(notifications).toEqual([]);
  });

  it.each([
    ["2026-09-23T17:00", "due_soon"],
    ["2026-09-20T17:00", "due_today"],
    ["2026-09-19T17:00", "overdue"],
  ] as const)(
    "flags an offer deadline dated %s as %s",
    (offerDeadline, expectedSeverity) => {
      const notifications = deriveApplicationNotifications(
        {
          ...baseApplication,
          offerDeadline,
          status: "Offered",
        },
        { ...DEFAULT_USER_SETTINGS, dueSoonDays: 3 },
        new Date("2026-09-20T12:00:00.000Z"),
      );

      expect(notifications).toEqual([
        expect.objectContaining({
          dueAt: offerDeadline,
          group: "offers",
          severity: expectedSeverity,
          type: "offer_deadline",
        }),
      ]);
    },
  );

  it("does not flag an offer deadline before the due-soon window", () => {
    const notifications = deriveApplicationNotifications(
      {
        ...baseApplication,
        offerDeadline: "2026-09-30T17:00",
        status: "Offered",
      },
      { ...DEFAULT_USER_SETTINGS, dueSoonDays: 3 },
      new Date("2026-09-20T12:00:00.000Z"),
    );

    expect(notifications).toEqual([]);
  });

  it("stops offer deadline reminders after the offer is accepted", () => {
    const notifications = deriveApplicationNotifications(
      {
        ...baseApplication,
        offerDeadline: "2026-09-20T17:00",
        status: "Accepted",
      },
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

  it("creates distinct stable reminders for multiple interview records", () => {
    const interviews: Interview[] = [
      {
        id: "interview-1",
        applicationId: baseApplication.id,
        dateTime: "2026-09-21T10:00",
        round: 1,
        type: "technical",
        mode: "video",
        proctored: false,
        createdAt: baseApplication.createdAt,
        updatedAt: baseApplication.updatedAt,
      },
      {
        id: "interview-2",
        applicationId: baseApplication.id,
        dateTime: "2026-09-22T10:00",
        round: 2,
        type: "recruiter",
        mode: "phone",
        proctored: false,
        createdAt: baseApplication.createdAt,
        updatedAt: baseApplication.updatedAt,
      },
    ];
    const application = { ...baseApplication, status: "Interviewing" as const };
    const now = new Date("2026-09-20T12:00:00.000Z");
    const notifications = deriveApplicationNotifications(
      application,
      { ...DEFAULT_USER_SETTINGS, dueSoonDays: 3 },
      now,
      interviews,
    ).filter((notification) => notification.type === "interview");
    const changedTimeNotifications = deriveApplicationNotifications(
      application,
      { ...DEFAULT_USER_SETTINGS, dueSoonDays: 3 },
      now,
      [{ ...interviews[0], dateTime: "2026-09-23T10:00" }, interviews[1]],
    ).filter((notification) => notification.type === "interview");

    expect(notifications).toHaveLength(2);
    expect(notifications.map((notification) => notification.interviewId)).toEqual([
      "interview-1",
      "interview-2",
    ]);
    expect(changedTimeNotifications[0].id).toBe(notifications[0].id);
  });

  it("keeps past interview records out of active reminders", () => {
    const interview: Interview = {
      id: "interview-past",
      applicationId: baseApplication.id,
      dateTime: "2026-09-19T10:00",
      deadline: "2026-09-19T12:00",
      type: "HackerRank",
      mode: "video",
      proctored: true,
      createdAt: baseApplication.createdAt,
      updatedAt: baseApplication.updatedAt,
    };

    const notifications = deriveApplicationNotifications(
      { ...baseApplication, followUpNeeded: false, status: "Interviewing" },
      DEFAULT_USER_SETTINGS,
      new Date("2026-09-20T12:00:00.000Z"),
      [interview],
    );

    expect(notifications).toEqual([]);
  });

  it("reminds users about non-proctored assessment deadlines", () => {
    const interview: Interview = {
      id: "interview-take-home",
      applicationId: baseApplication.id,
      deadline: "2026-09-21T12:00",
      type: "technical",
      mode: "take-home",
      proctored: false,
      createdAt: baseApplication.createdAt,
      updatedAt: baseApplication.updatedAt,
    };

    const notifications = deriveApplicationNotifications(
      { ...baseApplication, followUpNeeded: false, status: "Interviewing" },
      DEFAULT_USER_SETTINGS,
      new Date("2026-09-20T12:00:00.000Z"),
      [interview],
    );

    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      interviewId: interview.id,
      type: "deadline",
    });
  });

  it("derives a reminder from canonical relative deadline timing", () => {
    const interview: Interview = {
      id: "interview-relative",
      applicationId: baseApplication.id,
      deadlineEntryMode: "2_days",
      deadlineReceivedAt: "2026-09-20T08:00:00.000Z",
      type: "technical",
      mode: "take-home",
      proctored: false,
      createdAt: baseApplication.createdAt,
      updatedAt: baseApplication.updatedAt,
    };

    const notifications = deriveApplicationNotifications(
      { ...baseApplication, followUpNeeded: false, status: "Interviewing" },
      DEFAULT_USER_SETTINGS,
      new Date("2026-09-20T12:00:00.000Z"),
      [interview],
    );

    expect(notifications).toEqual([
      expect.objectContaining({
        dueAt: "2026-09-22T08:00:00.000Z",
        interviewId: interview.id,
        type: "deadline",
      }),
    ]);
  });

  it("uses interview projection timing without a canonical record", () => {
    const notifications = deriveApplicationNotifications(
      {
        ...baseApplication,
        followUpNeeded: false,
        status: "Interviewing",
        interviewRound: 1,
        interviewDeadlineEntryMode: "1_day",
        interviewDeadlineReceivedAt: "2026-09-20T08:00:00.000Z",
      },
      DEFAULT_USER_SETTINGS,
      new Date("2026-09-20T12:00:00.000Z"),
    );

    expect(notifications).toEqual([
      expect.objectContaining({
        dueAt: "2026-09-21T08:00:00.000Z",
        type: "deadline",
      }),
    ]);
  });

  it("ignores a legacy generic deadline after migration", () => {
    const notifications = deriveApplicationNotifications(
      {
        ...baseApplication,
        deadline: "2026-09-21T12:00",
        followUpNeeded: false,
        status: "Interviewing",
        interviewRound: 1,
      },
      DEFAULT_USER_SETTINGS,
      new Date("2026-09-20T12:00:00.000Z"),
    );

    expect(notifications).toEqual([]);
  });
});
