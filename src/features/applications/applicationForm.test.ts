import { describe, expect, it } from "vitest";
import type { Application } from "../../types/application";
import {
  deadlineValueForEntryMode,
  findDuplicateApplication,
  suggestFollowUpDate,
  validateInterviewRound,
} from "./applicationForm";

describe("validateInterviewRound", () => {
  it("allows a blank round", () => {
    expect(validateInterviewRound("")).toEqual({
      round: undefined,
      warnings: [],
    });
  });

  it.each(["0", "-1", "1.5", "not-a-number"])(
    "rejects invalid round %s",
    (value) => {
      expect(validateInterviewRound(value).error).toContain(
        "positive whole number",
      );
    },
  );

  it("warns without rejecting unusually high rounds", () => {
    expect(validateInterviewRound("100")).toEqual({
      round: 100,
      warnings: [
        "Round 100 is unusually high; the recommended maximum is 99.",
      ],
    });
  });

  it("warns without rejecting duplicate rounds", () => {
    expect(validateInterviewRound("2", [1, 2])).toEqual({
      round: 2,
      warnings: ["Round 2 already exists for this application."],
    });
  });
});

describe("deadlineValueForEntryMode", () => {
  it("preserves exact date/time values", () => {
    expect(
      deadlineValueForEntryMode("2026-10-01T17:30:45", "exact"),
    ).toBe("2026-10-01T17:30");
  });

  it("makes existing date-only deadlines editable in exact mode", () => {
    expect(deadlineValueForEntryMode("2026-10-01", "exact")).toBe(
      "2026-10-01T23:59",
    );
  });

  it("keeps only the calendar date in relative modes", () => {
    expect(
      deadlineValueForEntryMode("2026-10-01T17:30", "72_hours"),
    ).toBe("2026-10-01");
  });

  it("keeps blank deadlines blank", () => {
    expect(deadlineValueForEntryMode("", "exact")).toBe("");
  });
});

const existingApplication: Application = {
  id: "existing",
  company: "Acme Labs",
  jobTitle: "Product Intern",
  jobDescription: "",
  status: "Awaiting Response",
  workMode: "unknown",
  jobType: "internship",
  applicationUrl: "https://example.com/jobs/123/",
  followUpNeeded: false,
  interviewProctored: false,
  deadlineEntryMode: "exact",
  priority: "medium",
  contactsCount: 0,
  archivedAt: "2026-09-20T00:00:00.000Z",
  createdAt: "2026-09-20T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
};

describe("findDuplicateApplication", () => {
  it("prioritizes normalized application URL matches", () => {
    expect(
      findDuplicateApplication([existingApplication], {
        company: "Different Company",
        jobTitle: "Different Role",
        applicationUrl: "HTTPS://EXAMPLE.COM/jobs/123#details",
      }),
    ).toEqual({
      application: existingApplication,
      matchedBy: "application URL",
    });
  });

  it("matches normalized company and title, including archived entries", () => {
    expect(
      findDuplicateApplication([existingApplication], {
        company: " acme   labs ",
        jobTitle: "product intern",
      }),
    ).toEqual({
      application: existingApplication,
      matchedBy: "company and job title",
    });
  });

  it("does not treat a title alone as a duplicate", () => {
    expect(
      findDuplicateApplication([existingApplication], {
        company: "",
        jobTitle: "Product Intern",
      }),
    ).toBeNull();
  });
});

describe("suggestFollowUpDate", () => {
  it("suggests a date from the selected applied date", () => {
    expect(suggestFollowUpDate("2026-09-24", 7)).toBe("2026-10-01");
  });

  it("uses the local current date when the applied date is blank", () => {
    expect(
      suggestFollowUpDate("", 3, new Date(2026, 11, 30, 23, 45)),
    ).toBe("2027-01-02");
  });

  it("falls back safely when an applied date is invalid", () => {
    expect(
      suggestFollowUpDate("2026-02-31", 1, new Date(2026, 8, 24)),
    ).toBe("2026-09-25");
  });
});
