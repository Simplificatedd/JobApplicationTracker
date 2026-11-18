import { describe, expect, it } from "vitest";
import { countApplicationSummary } from "./applicationSummary";

const now = new Date("2026-11-18T12:00:00");
const active = [{ id: "active" }];
const archived = [{ id: "archived" }];
const interviews = [
  { applicationId: "active", dateTime: "2026-11-20T09:00" },
  { applicationId: "archived", dateTime: "2026-11-19T09:00" },
  { applicationId: "archived", dateTime: "2026-12-01T09:00" },
];
const assessments = [
  { applicationId: "active", progress: "not-started" as const },
  { applicationId: "archived", progress: "in-progress" as const },
  { applicationId: "archived", progress: "unknown" as const },
];

describe("application summary scope", () => {
  it("counts active records and their upcoming and open child records", () => {
    expect(countApplicationSummary(active, interviews, assessments, now)).toEqual({
      applications: 1,
      interviews: 1,
      assessments: 1,
    });
  });

  it("counts archived records in the archive view", () => {
    expect(countApplicationSummary(archived, interviews, assessments, now)).toEqual({
      applications: 1,
      interviews: 2,
      assessments: 2,
    });
  });

  it("includes active and archived child records in Total", () => {
    expect(
      countApplicationSummary([...active, ...archived], interviews, assessments, now),
    ).toEqual({ applications: 2, interviews: 3, assessments: 3 });
  });

  it("excludes child records outside the selected application scope", () => {
    expect(
      countApplicationSummary(
        active,
        [...interviews, { applicationId: "missing", dateTime: "2026-12-01T09:00" }],
        [{ applicationId: "missing", progress: "not-started" }],
        now,
      ),
    ).toEqual({ applications: 1, interviews: 1, assessments: 0 });
  });

  it("returns empty counts and never changes the input records", () => {
    expect(countApplicationSummary([], interviews, assessments, now)).toEqual({
      applications: 0,
      interviews: 0,
      assessments: 0,
    });
    const all = [...active, ...archived];
    const before = structuredClone({ all, interviews, assessments });
    countApplicationSummary(all, interviews, assessments, now);
    expect({ all, interviews, assessments }).toEqual(before);
  });
});

describe("upcoming interviews (#256)", () => {
  it("counts interviews from now on and skips past and undated ones", () => {
    expect(
      countApplicationSummary(
        active,
        [
          { applicationId: "active", dateTime: "2026-11-18T12:00:00" },
          { applicationId: "active", dateTime: "2026-11-18T11:59" },
          { applicationId: "active", dateTime: "2026-11-01T09:00" },
          { applicationId: "active" },
          { applicationId: "active", dateTime: "not a date" },
        ],
        [],
        now,
      ).interviews,
    ).toBe(1);
  });
});

describe("open assessments (#256)", () => {
  it("skips submitted, expired and cancelled assessments", () => {
    expect(
      countApplicationSummary(
        active,
        [],
        (["unknown", "not-started", "in-progress", "submitted", "expired", "cancelled"] as const).map(
          (progress) => ({ applicationId: "active", progress }),
        ),
        now,
      ).assessments,
    ).toBe(3);
  });
});
