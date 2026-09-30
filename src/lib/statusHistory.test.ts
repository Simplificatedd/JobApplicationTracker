import { describe, expect, it } from "vitest";
import type { Activity, Application, Interview } from "../types/application";
import {
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
