import { describe, expect, it } from "vitest";
import type { Activity } from "../types/application";
import { normalizeStatusActivity } from "./statusHistory";

const activity: Activity = {
  id: "activity-status",
  applicationId: "app-1",
  type: "status_changed",
  message: "Status changed to Interviewing.",
  createdAt: "2026-10-01T00:00:00.000Z",
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
