import { describe, expect, it } from "vitest";
import type { Application } from "../../types/application";
import {
  applyApplicationFilters,
  DEFAULT_APPLICATION_FILTERS,
  getApplicationFilterOptions,
  normalizeApplicationFilters,
} from "./applicationFilters";

const baseApplication: Application = {
  id: "app-base",
  company: "Example Company",
  jobTitle: "Software Engineer",
  jobDescription: "Build reliable software.",
  status: "Just Applied",
  workMode: "unknown",
  jobType: "internship",
  followUpNeeded: false,
  interviewProctored: false,
  deadlineEntryMode: "exact",
  priority: "medium",
  contactsCount: 0,
  createdAt: "2026-09-20T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
};

describe("application company and location filters", () => {
  const applications: Application[] = [
    {
      ...baseApplication,
      id: "london",
      company: "  Acme   Labs ",
      location: "  London   Office ",
    },
    {
      ...baseApplication,
      id: "tokyo",
      company: "Example Company",
      location: "Tokyo",
    },
  ];

  it("filters arbitrary saved values with normalized casing and spacing", () => {
    expect(
      applyApplicationFilters(applications, {
        ...DEFAULT_APPLICATION_FILTERS,
        company: "acme labs",
        location: "london office",
      }),
    ).toEqual([applications[0]]);
  });

  it("composes company and location with other filters", () => {
    expect(
      applyApplicationFilters(applications, {
        ...DEFAULT_APPLICATION_FILTERS,
        company: "Example Company",
        location: "Tokyo",
        status: "Just Applied",
      }),
    ).toEqual([applications[1]]);
  });

  it("builds trimmed, deduplicated, sorted options from saved values", () => {
    const duplicates = [
      ...applications,
      {
        ...baseApplication,
        id: "duplicate",
        company: "acme labs",
        location: "london office",
      },
    ];

    expect(getApplicationFilterOptions(duplicates, "company")).toEqual([
      "Acme Labs",
      "Example Company",
    ]);
    expect(getApplicationFilterOptions(duplicates, "location")).toEqual([
      "London Office",
      "Tokyo",
    ]);
  });

  it("fills newly added filter fields in saved legacy preferences", () => {
    expect(
      normalizeApplicationFilters({ location: "Tokyo" }).company,
    ).toBe("");
  });
});

describe("cover letter filter", () => {
  it("treats stored cover letters and legacy version labels as assigned", () => {
    const stored = {
      ...baseApplication,
      id: "stored-cover-letter",
      coverLetterId: "cover-letter-1",
    };
    const legacy = {
      ...baseApplication,
      id: "legacy-cover-letter",
      coverLetterVersion: "Acme draft",
    };
    const unassigned = { ...baseApplication, id: "no-cover-letter" };

    expect(
      applyApplicationFilters([stored, legacy, unassigned], {
        ...DEFAULT_APPLICATION_FILTERS,
        coverLetterVersion: "filled",
      }),
    ).toEqual([stored, legacy]);
  });
});
