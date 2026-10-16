import { describe, expect, it } from "vitest";
import type { Activity, Application } from "../../types/application";
import {
  countTopValues,
  deriveAppliedByWeekday,
  deriveResponseRateBySource,
  deriveStatusTransitions,
  deriveTimeToFirstResponse,
  deriveWorkModeMix,
  toCumulative,
} from "./extraMetrics";

const baseApplication: Application = {
  id: "app-1",
  company: "Example Company",
  jobTitle: "Software Engineer",
  jobDescription: "",
  status: "Awaiting Response",
  workMode: "remote",
  jobType: "internship",
  followUpNeeded: false,
  interviewProctored: false,
  priority: "medium",
  contactsCount: 0,
  dateApplied: "2026-09-01",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

function application(overrides: Partial<Application>): Application {
  return { ...baseApplication, ...overrides };
}

describe("countTopValues", () => {
  it("labels blank values and folds the long tail into Other", () => {
    const values = ["A", "A", "B", "C", "D", "", undefined];

    expect(countTopValues(values, 3)).toEqual([
      { label: "A", value: 2 },
      { label: "Not set", value: 2 },
      { label: "Other", value: 3 },
    ]);
  });
});

describe("composition metrics", () => {
  it("formats work modes and treats unknown as not set", () => {
    expect(
      deriveWorkModeMix([
        application({ workMode: "remote" }),
        application({ workMode: "unknown" }),
      ]),
    ).toEqual([
      { label: "Not set", value: 1 },
      { label: "Remote", value: 1 },
    ]);
  });

  it("counts applications by weekday applied", () => {
    const days = deriveAppliedByWeekday([
      application({ dateApplied: "2026-09-07T12:00:00" }),
    ]);

    expect(days).toHaveLength(7);
    expect(days.find((day) => day.label === "Monday")?.value).toBe(1);
  });
});

describe("response metrics", () => {
  it("computes response rate per source excluding withdrawn applications", () => {
    expect(
      deriveResponseRateBySource([
        application({ id: "1", source: "LinkedIn", status: "Rejected" }),
        application({ id: "2", source: "LinkedIn" }),
        application({ id: "3", source: "LinkedIn", status: "Withdrawn" }),
        application({ id: "4", source: "Referral", status: "Interviewing" }),
      ]),
    ).toEqual([
      { label: "Referral (1)", value: 100 },
      { label: "LinkedIn (2)", value: 50 },
    ]);
  });

  it("buckets days until the first change away from awaiting response", () => {
    const activities: Activity[] = [
      {
        id: "a1",
        applicationId: "app-1",
        type: "status_changed",
        message: "Status changed to Rejected.",
        statusFrom: "Awaiting Response",
        statusTo: "Rejected",
        createdAt: "2026-09-05T00:00:00.000Z",
      },
      {
        id: "a2",
        applicationId: "app-2",
        type: "status_changed",
        message: "Status changed to Interviewing.",
        statusFrom: "Awaiting Response",
        statusTo: "Interviewing",
        createdAt: "2026-10-20T00:00:00.000Z",
      },
    ];

    const buckets = deriveTimeToFirstResponse(
      [
        application({ id: "app-1" }),
        application({ id: "app-2" }),
        application({ id: "app-3" }),
      ],
      activities,
    );

    expect(buckets.find((bucket) => bucket.label === "Within 1 week")?.value).toBe(1);
    expect(buckets.find((bucket) => bucket.label === "1–2 months")?.value).toBe(1);
    expect(buckets.reduce((sum, bucket) => sum + bucket.value, 0)).toBe(2);
  });
});

describe("toCumulative", () => {
  it("returns a running total", () => {
    expect(
      toCumulative([
        { label: "a", value: 2 },
        { label: "b", value: 0 },
        { label: "c", value: 3 },
      ]).map((item) => item.value),
    ).toEqual([2, 2, 5]);
  });
});

describe("deriveStatusTransitions", () => {
  it("counts from-to pairs and ignores other activity", () => {
    const change = (id: string, from: Activity["statusFrom"], to: Activity["statusTo"]): Activity => ({
      id,
      applicationId: id,
      type: "status_changed",
      message: "",
      statusFrom: from,
      statusTo: to,
      createdAt: "2026-09-05T00:00:00.000Z",
    });

    expect(
      deriveStatusTransitions([
        change("1", "Awaiting Response", "Rejected"),
        change("2", "Awaiting Response", "Rejected"),
        change("3", "Awaiting Response", "Interviewing"),
        { ...change("4", "Awaiting Response", "Rejected"), type: "updated" },
      ]),
    ).toEqual([
      { from: "Awaiting Response", to: "Rejected", value: 2 },
      { from: "Awaiting Response", to: "Interviewing", value: 1 },
    ]);
  });
});
