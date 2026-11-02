import { describe, expect, it } from "vitest";
import type { Application } from "../../types/application";
import {
  fuzzyScore,
  searchApplications,
  selectSearchBase,
} from "./applicationSearch";

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

  it("searches company, title, and description but not notes", () => {
    const companyMatch = { ...baseApplication, company: "Accounting Co" };
    const notesOnly = {
      ...baseApplication,
      id: "notes-only",
      notes: "Accounting role",
    };

    expect(
      searchApplications([notesOnly, companyMatch], "accounting"),
    ).toEqual([companyMatch]);
  });

  it("ranks company, then title, then description matches", () => {
    const descriptionOnly = {
      ...baseApplication,
      id: "description",
      company: "Acme",
      jobTitle: "Analyst",
      jobDescription: "Partner with Google teams.",
    };
    const titleMatch = {
      ...baseApplication,
      id: "title",
      company: "Acme",
      jobTitle: "Google Cloud Intern",
    };
    const companyStartsWith = {
      ...baseApplication,
      id: "starts-with",
      company: "Google Singapore",
    };
    const companyExact = { ...baseApplication, id: "exact", company: "Google" };

    expect(
      searchApplications(
        [descriptionOnly, titleMatch, companyStartsWith, companyExact],
        "google",
      ).map((application) => application.id),
    ).toEqual(["exact", "starts-with", "title", "description"]);
  });

  it("ranks exact, starts-with, contains, then fuzzy within a field", () => {
    const fuzzy = { ...baseApplication, id: "fuzzy", jobTitle: "Anallyst" };
    const contains = {
      ...baseApplication,
      id: "contains",
      jobTitle: "Senior Data Analyst",
    };
    const startsWith = {
      ...baseApplication,
      id: "starts-with",
      jobTitle: "Analyst Intern",
    };
    const exact = { ...baseApplication, id: "exact", jobTitle: "Analyst" };

    expect(
      searchApplications([fuzzy, contains, startsWith, exact], "analyst").map(
        (application) => application.id,
      ),
    ).toEqual(["exact", "starts-with", "contains", "fuzzy"]);
  });

  it("does not reward repeated keywords or long descriptions", () => {
    const repeated = {
      ...baseApplication,
      id: "repeated",
      jobTitle: "Intern",
      jobDescription: `Use ${"python ".repeat(200)}`,
    };
    const single = {
      ...baseApplication,
      id: "single",
      jobTitle: "Intern",
      jobDescription: "Uses Python daily.",
    };

    expect(searchApplications([single, repeated], "python")).toEqual([
      single,
      repeated,
    ]);
    expect(searchApplications([repeated, single], "python")).toEqual([
      repeated,
      single,
    ]);
  });

  it("keeps the incoming sort order for equally ranked results", () => {
    const first = { ...baseApplication, id: "first", jobTitle: "Data Intern" };
    const second = { ...baseApplication, id: "second", jobTitle: "Ops Intern" };
    const third = { ...baseApplication, id: "third", jobTitle: "QA Intern" };

    expect(searchApplications([third, first, second], "intern")).toEqual([
      third,
      first,
      second,
    ]);
  });

  it("allows company typos but not loose company abbreviations", () => {
    const google = { ...baseApplication, id: "google", company: "Google" };
    const microsoft = {
      ...baseApplication,
      id: "microsoft",
      company: "Microsoft",
      jobTitle: "Intern",
    };
    const titleMatch = {
      ...baseApplication,
      id: "title",
      company: "Acme",
      jobTitle: "MS Office Specialist",
    };

    expect(searchApplications([google], "gogle")).toEqual([google]);
    expect(searchApplications([microsoft, titleMatch], "ms")).toEqual([
      titleMatch,
    ]);
  });

  it.each([
    ["sre", "Sure Inc", "SRE"],
    ["ios", "Ions", "iOS Engineer"],
    ["mta", "Meta", "MTA Analyst"],
  ])(
    "does not let a loose company match for %s outrank title matches",
    (query, company, jobTitle) => {
      const looseCompany = {
        ...baseApplication,
        id: "company",
        company,
        jobTitle: "Intern",
      };
      const titleMatch = {
        ...baseApplication,
        id: "title",
        company: "Acme",
        jobTitle,
      };

      expect(
        searchApplications([looseCompany, titleMatch], query)[0],
      ).toBe(titleMatch);
    },
  );

  it("ignores case and repeated whitespace", () => {
    const match = { ...baseApplication, company: "Google  Singapore" };

    expect(searchApplications([match], "  GOOGLE singapore ")).toEqual([
      match,
    ]);
  });

  it("returns no results when nothing matches", () => {
    expect(searchApplications([baseApplication], "zzzz")).toEqual([]);
  });
});

describe("selectSearchBase", () => {
  const active = { ...baseApplication, id: "active" };
  const archived = {
    ...baseApplication,
    id: "archived",
    archivedAt: "2026-10-01T00:00:00.000Z",
  };
  const applications = [active, archived];

  it("keeps the section split when no search is typed", () => {
    expect(selectSearchBase(applications, "active", " ", "all")).toEqual({
      applications: [active],
      searchesAll: false,
    });
    expect(selectSearchBase(applications, "archive", "", "all")).toEqual({
      applications: [archived],
      searchesAll: false,
    });
  });

  it("searches active and archived applications by default", () => {
    expect(selectSearchBase(applications, "active", "eng", "all")).toEqual({
      applications,
      searchesAll: true,
    });
    expect(selectSearchBase(applications, "archive", "eng", "all")).toEqual({
      applications,
      searchesAll: true,
    });
  });

  it("limits a search to the current section when asked", () => {
    expect(
      selectSearchBase(applications, "active", "eng", "section"),
    ).toEqual({ applications: [active], searchesAll: false });
    expect(
      selectSearchBase(applications, "archive", "eng", "section"),
    ).toEqual({ applications: [archived], searchesAll: false });
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
