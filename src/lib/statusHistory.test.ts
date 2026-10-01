import { describe, expect, it } from "vitest";
import type { Activity, Application, Interview } from "../types/application";
import {
  classifyApplicationOutcomePath,
  deriveApplicationStatusPath,
  normalizeStatusActivity,
} from "./statusHistory";

const activity: Activity = {
  id: "activity-status",
  applicationId: "app-1",
  type: "status_changed",
  message: "Status changed to Interviewing.",
  createdAt: "2026-10-01T00:00:00.000Z",
};

const application: Application = {
  id: "app-1",
  company: "Example Company",
  jobTitle: "Engineer",
  jobDescription: "",
  status: "Rejected",
  workMode: "unknown",
  jobType: "full-time",
  followUpNeeded: false,
  interviewProctored: false,
  deadlineEntryMode: "exact",
  priority: "medium",
  contactsCount: 0,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-04T00:00:00.000Z",
};

describe("normalizeStatusActivity", () => {
  it("adds a destination to legacy message-only transitions", () => {
    expect(normalizeStatusActivity(activity)).toMatchObject({
      statusTo: "Interviewing",
    });
  });

  it("treats message-only Offered transitions as legacy Accepted outcomes", () => {
    expect(
      normalizeStatusActivity({
        ...activity,
        message: "Status changed to Offered.",
      }),
    ).toMatchObject({ statusTo: "Accepted" });
  });

  it("preserves structured pending Offered transitions", () => {
    const structured = {
      ...activity,
      statusFrom: "Interviewing" as const,
      statusTo: "Offered" as const,
    };

    expect(normalizeStatusActivity(structured)).toEqual(structured);
  });

  it("migrates structured Offered transitions from legacy snapshots", () => {
    expect(
      normalizeStatusActivity(
        {
          ...activity,
          statusFrom: "Interviewing",
          statusTo: "Offered",
        },
        true,
      ),
    ).toMatchObject({
      statusFrom: "Interviewing",
      statusTo: "Accepted",
    });
  });
});

describe("deriveApplicationStatusPath", () => {
  it("derives an ordered path from structured transitions", () => {
    const activities: Activity[] = [
      {
        ...activity,
        id: "created",
        type: "created",
        message: "Created application.",
        statusTo: "Awaiting Response",
      },
      {
        ...activity,
        id: "offered",
        message: "Status changed to Offered.",
        statusFrom: "Awaiting Response",
        statusTo: "Offered",
        createdAt: "2026-10-02T00:00:00.000Z",
      },
      {
        ...activity,
        id: "rejected",
        message: "Status changed to Rejected.",
        statusFrom: "Offered",
        statusTo: "Rejected",
        createdAt: "2026-10-04T00:00:00.000Z",
      },
    ];

    expect(deriveApplicationStatusPath(application, activities)).toEqual([
      "Awaiting Response",
      "Offered",
      "Rejected",
    ]);
  });

  it("uses interview history to repair a legacy path", () => {
    const interview: Interview = {
      id: "interview-1",
      applicationId: application.id,
      type: "technical",
      mode: "video",
      proctored: false,
      createdAt: "2026-10-02T00:00:00.000Z",
      updatedAt: "2026-10-02T00:00:00.000Z",
    };
    const rejection = {
      ...activity,
      message: "Status changed to Rejected.",
      createdAt: "2026-10-03T00:00:00.000Z",
    };

    expect(
      deriveApplicationStatusPath(application, [rejection], [interview]),
    ).toEqual(["Awaiting Response", "Interviewing", "Rejected"]);
  });

  it("deduplicates repeated adjacent status events", () => {
    const repeated = {
      ...activity,
      statusFrom: "Awaiting Response" as const,
      statusTo: "Rejected" as const,
      createdAt: application.updatedAt,
    };

    expect(
      deriveApplicationStatusPath(application, [repeated, repeated]),
    ).toEqual(["Awaiting Response", "Rejected"]);
  });
});

describe("classifyApplicationOutcomePath", () => {
  it("distinguishes offered then rejected from a direct rejection", () => {
    const activities: Activity[] = [
      {
        ...activity,
        id: "offered",
        statusFrom: "Awaiting Response",
        statusTo: "Offered",
        createdAt: "2026-10-02T00:00:00.000Z",
      },
      {
        ...activity,
        id: "rejected",
        statusFrom: "Offered",
        statusTo: "Rejected",
        createdAt: "2026-10-03T00:00:00.000Z",
      },
    ];

    expect(
      classifyApplicationOutcomePath(application, activities),
    ).toBe("offered_rejected");
    expect(
      classifyApplicationOutcomePath(application, [
        {
          ...activities[1],
          statusFrom: "Awaiting Response",
        },
      ]),
    ).toBe("rejected_without_interview");
  });

  it("classifies an interviewed then rejected path", () => {
    const interview: Interview = {
      id: "interview-1",
      applicationId: application.id,
      type: "technical",
      mode: "video",
      proctored: false,
      createdAt: "2026-10-02T00:00:00.000Z",
      updatedAt: "2026-10-02T00:00:00.000Z",
    };

    expect(
      classifyApplicationOutcomePath(application, [], [interview]),
    ).toBe("interviewed_rejected");
  });

  it("uses the furthest reached stage for a rejected application", () => {
    const activities: Activity[] = [
      {
        ...activity,
        id: "interviewing",
        statusFrom: "Awaiting Response",
        statusTo: "Interviewing",
        createdAt: "2026-10-02T00:00:00.000Z",
      },
      {
        ...activity,
        id: "offered",
        statusFrom: "Interviewing",
        statusTo: "Offered",
        createdAt: "2026-10-03T00:00:00.000Z",
      },
    ];

    expect(
      classifyApplicationOutcomePath(application, activities),
    ).toBe("offered_rejected");
  });

  it.each([
    ["Accepted", "accepted"],
    ["Withdrawn", "withdrawn"],
    ["Offered", "offer_pending"],
    ["Interviewing", "interviewing"],
    ["Awaiting Response", "awaiting_response"],
  ] as const)("classifies %s as %s", (status, expected) => {
    expect(
      classifyApplicationOutcomePath(
        { ...application, status },
        [],
      ),
    ).toBe(expected);
  });
});
