import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("activity calendar local dates", () => {
  afterEach(() => vi.useRealTimers());

  it.each([2, 9, 10])("keeps every day of local month %s, including DST boundaries", (month) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, month, 15, 12));
    const days = deriveActivityCalendarDays([], [], []);
    const prefix = `2026-${String(month + 1).padStart(2, "0")}`;
    const length = new Date(2026, month + 1, 0).getDate();
    expect(days.map(day => day.date)).toEqual(Array.from(
      { length }, (_, index) => `${prefix}-${String(index + 1).padStart(2, "0")}`,
    ));
  });

  it("buckets timestamps and date-only applications on the same local day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 12));
    const localMidnight = new Date(2026, 9, 1, 0, 15).toISOString();
    const days = deriveActivityCalendarDays([
      { ...baseApplication, dateApplied: "2026-10-01" },
      { ...baseApplication, id: "timestamp", dateApplied: undefined, createdAt: localMidnight },
    ], [], [{ ...interviews[0], dateTime: localMidnight }]);
    expect(days[0].date).toBe("2026-10-01");
    expect(days[0].summary).toContain("2 jobs applied");
    expect(days[0].summary).toContain("1 interview");
    expect(days[1].tone).toBe("none");
  });

  it("keeps late-night events and assessment dates on their local day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 12));
    const lateNight = new Date(2026, 8, 30, 23, 45).toISOString();
    const days = deriveActivityCalendarDays([], [{
      id: "event", applicationId: "app-1", type: "status_changed",
      message: "Changed", statusTo: "Interviewing", createdAt: lateNight,
    }], [], [{
      id: "assessment", applicationId: "app-1", number: 1,
      type: "coding", platform: "Other", progress: "not-started", result: "unknown",
      proctored: "unknown",
      receivedAt: lateNight, createdAt: lateNight, updatedAt: lateNight,
    }]);
    const day = days.find(day => day.date === "2026-09-30");
    expect(day?.summary).toContain("1 major status change");
    expect(day?.summary).toContain("1 assessment event");
    expect(days.find(day => day.date === "2026-10-01")?.tone).toBe("none");
  });

  it("ignores malformed dates instead of throwing or inventing activity", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 12));
    const days = deriveActivityCalendarDays([
      { ...baseApplication, dateApplied: "2026-02-30" },
    ], [{
      id: "invalid", applicationId: "app-1", type: "status_changed",
      message: "Invalid", createdAt: "not-a-date",
    }], [{ ...interviews[0], dateTime: "invalid" }]);
    expect(days[0].date).toBe("2026-10-01");
    expect(days.every(day => day.tone === "none")).toBe(true);
  });
});

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
