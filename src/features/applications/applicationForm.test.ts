import { describe, expect, it } from "vitest";
import type { Application } from "../../types/application";
import {
  findDuplicateApplication,
  suggestFollowUpDate,
} from "./applicationForm";

const existingApplication: Application = {
  id: "existing",
  company: "Acme Labs",
  jobTitle: "Product Intern",
  jobDescription: "",
  status: "Just Applied",
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
