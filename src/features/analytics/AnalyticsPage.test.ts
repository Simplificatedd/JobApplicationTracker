import { describe, expect, it } from "vitest";
import type {
  Activity,
  Application,
  Interview,
} from "../../types/application";
import {
  deriveActivityCalendarDays,
  deriveApplicationPaths,
  deriveInterviewsOverTime,
  deriveOutcomes,
  derivePipelineByStatus,
} from "./AnalyticsPage";

const interviews: Interview[] = [
  {
    id: "interview-1",
    applicationId: "app-1",
    dateTime: "2026-09-20T10:00",
    round: 1,
    type: "technical",
    mode: "video",
    proctored: false,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
  {
    id: "interview-2",
    applicationId: "app-1",
    dateTime: "2026-09-20T14:00",
    round: 2,
    type: "recruiter",
    mode: "phone",
    proctored: false,
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
  },
];

describe("interview analytics", () => {
  it("counts interview records rather than applications", () => {
    expect(deriveInterviewsOverTime(interviews, "daily")).toEqual([
      { label: "2026-09-20", value: 2 },
    ]);
  });

  it("uses interview records in activity calendar summaries", () => {
    const day = deriveActivityCalendarDays([], [], interviews).find(
      (candidate) => candidate.date === "2026-09-20",
    );

    expect(day?.summary).toContain("2 interviews completed");
  });
});

const baseApplication: Application = {
  id: "app-base",
  company: "Example Company",
  jobTitle: "Engineer",
  jobDescription: "",
  status: "Awaiting Response",
  workMode: "unknown",
  jobType: "full-time",
  followUpNeeded: false,
  interviewProctored: false,
  priority: "medium",
  contactsCount: 0,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};

describe("outcome analytics", () => {
  const applications: Application[] = [
    { ...baseApplication, id: "accepted", status: "Accepted" },
    { ...baseApplication, id: "pending", status: "Offered" },
    { ...baseApplication, id: "offered-rejected", status: "Rejected" },
    { ...baseApplication, id: "interviewed-rejected", status: "Rejected" },
  ];
  const activities: Activity[] = [
    {
      id: "offered",
      applicationId: "offered-rejected",
      type: "status_changed",
      message: "Status changed to Offered.",
      statusFrom: "Awaiting Response",
      statusTo: "Offered",
      createdAt: "2026-09-03T00:00:00.000Z",
    },
  ];
  const outcomeInterviews: Interview[] = [
    {
      ...interviews[0],
      id: "outcome-interview",
      applicationId: "interviewed-rejected",
    },
  ];

  it("counts accepted and later-rejected applications as offers received", () => {
    expect(
      deriveOutcomes(applications, activities, outcomeInterviews),
    ).toEqual([
      { label: "Offers received", value: 3 },
      { label: "Accepted", value: 1 },
      { label: "Rejected", value: 2 },
    ]);
  });

  it("keeps pending offers and accepted applications separate in the pipeline", () => {
    const pipeline = derivePipelineByStatus(applications);

    expect(pipeline).toContainEqual({ label: "Offered", value: 1 });
    expect(pipeline).toContainEqual({ label: "Accepted", value: 1 });
    expect(pipeline).toContainEqual({ label: "Rejected", value: 2 });
  });

  it("reports distinct rejection paths", () => {
    expect(
      deriveApplicationPaths(applications, activities, outcomeInterviews),
    ).toEqual([
      { label: "Accepted", value: 1 },
      { label: "Offer pending", value: 1 },
      { label: "Offered → Rejected", value: 1 },
      { label: "Interviewed → Rejected", value: 1 },
    ]);
  });
});
