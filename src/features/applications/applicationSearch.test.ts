import { describe, expect, it } from "vitest";
import type { Application } from "../../types/application";
import { fuzzyScore, searchApplications } from "./applicationSearch";

const baseApplication: Application = {
  id: "app-base",
  company: "Example Company",
  jobTitle: "Software Engineer",
  jobDescription: "Build reliable web applications.",
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

describe("searchApplications", () => {
  it("ranks title matches ahead of description-only matches", () => {
    const descriptionMatch = {
      ...baseApplication,
      id: "description-match",
      jobTitle: "Platform Intern",
      jobDescription: "Support the software engineering team.",
    };
    const titleMatch = {
      ...baseApplication,
      id: "title-match",
      jobTitle: "Software Engineering Intern",
    };

    expect(
      searchApplications([descriptionMatch, titleMatch], "software"),
    ).toEqual([titleMatch, descriptionMatch]);
  });

  it("returns the original list for a blank query", () => {
    const applications = [baseApplication];

    expect(searchApplications(applications, "   ")).toBe(applications);
  });
});

describe("fuzzyScore", () => {
  it("matches ordered characters and rejects out-of-order queries", () => {
    expect(fuzzyScore("Software Engineer", "swe")).toBeGreaterThan(0);
    expect(fuzzyScore("Software Engineer", "ezs")).toBe(0);
  });
});
