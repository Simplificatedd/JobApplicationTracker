import { describe, expect, it } from "vitest";
import type { Interview } from "../../types/application";
import {
  deriveActivityCalendarDays,
  deriveInterviewsOverTime,
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
