import { describe, expect, it } from "vitest";
import type { Application } from "../../types/application";
import { fuzzyScore, searchApplications } from "./applicationSearch";

const baseApplication: Application = {
  id: "app-base",
  company: "Example Company",
  jobTitle: "Software Engineer",
  jobDescription: "Build reliable web applications.",
  status: "Awaiting Response",
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

  it.each(["engineer", "data", "sales"])(
    "excludes unrelated descriptions when searching for %s",
    (query) => {
      const unrelated = {
        ...baseApplication,
        id: "unrelated",
        jobTitle: "Office Administrator",
        jobDescription:
          "Support our operations team. Work with colleagues to manage internal projects, coordinate meetings, prepare reports, resolve issues, and deliver high quality service. Help improve processes and keep records up to date.",
      };
      const matching = { ...baseApplication, jobTitle: `${query} intern` };

      expect(searchApplications([unrelated, matching], query)).toEqual([
        matching,
      ]);
    },
  );

  it("keeps title matches above stronger description matches", () => {
    const titleMatch = {
      ...baseApplication,
      id: "title-match",
      jobTitle: "Software Engineer",
      jobDescription: "",
    };
    const descriptionMatch = {
      ...baseApplication,
      id: "description-match",
      jobTitle: "Platform Intern",
      jobDescription: "Software",
    };

    expect(
      searchApplications([descriptionMatch, titleMatch], "software"),
    ).toEqual([titleMatch, descriptionMatch]);
  });

  it("searches title and description without matching company or notes", () => {
    const unrelated = {
      ...baseApplication,
      company: "Accounting Company",
      notes: "Accounting role",
    };
    expect(searchApplications([unrelated], "accounting")).toEqual([]);
  });
});

describe("fuzzyScore", () => {
  it("matches ordered characters and rejects out-of-order queries", () => {
    expect(fuzzyScore("Software Engineer", "swe")).toBeGreaterThan(0);
    expect(fuzzyScore("Software Engineer", "ezs")).toBe(0);
  });

  it("matches partial words and missing letters within a word", () => {
    expect(fuzzyScore("Software Engineer", "engin")).toBeGreaterThan(0);
    expect(fuzzyScore("Software Engineer", "softwre")).toBeGreaterThan(0);
    expect(fuzzyScore("Software Engineer", "software")).toBeGreaterThan(
      fuzzyScore("Software Engineer", "softwre"),
    );
  });

  it("rejects sparse matches within long words", () => {
    expect(fuzzyScore("departmentalization", "data")).toBe(0);
  });

  it("requires every keyword and supports casing, spacing, and word order", () => {
    expect(
      fuzzyScore("Software Engineer", "  ENGINEER   software  "),
    ).toBeGreaterThan(0);
    expect(fuzzyScore("Software Engineer", "software accounting")).toBe(0);
    expect(fuzzyScore("Software Engineer", "!!!")).toBe(0);
  });

  it.each([
    ["C# Developer", "C++ developer"],
    ["C Developer", "C# developer"],
    ["Internet Developer", ".NET developer"],
    ["NodeXjs Developer", "Node.js developer"],
  ])("preserves technology punctuation in %s when searching %s", (value, query) => {
    expect(fuzzyScore(value, query)).toBe(0);
  });

  it.each(["C++", "C#", ".NET", "Node.js"])(
    "finds %s keywords in a different order and with extra whitespace",
    (technology) => {
      expect(
        fuzzyScore(`Developer using ${technology}.`, `${technology}   developer`),
      ).toBeGreaterThan(0);
    },
  );
});
