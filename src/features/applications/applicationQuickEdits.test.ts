import { describe, expect, it } from "vitest";
import type { Application } from "../../types/application";
import {
  createInterviewQuickEdit,
  createStatusQuickEdit,
} from "./applicationQuickEdits";

const application: Application = {
  id: "app-1",
  company: "Example Company",
  jobTitle: "Product Intern",
  jobDescription: "",
  status: "Awaiting Response",
  workMode: "unknown",
  jobType: "internship",
  followUpNeeded: false,
  interviewProctored: false,
  deadlineEntryMode: "exact",
  priority: "medium",
  contactsCount: 0,
  createdAt: "2026-09-24T00:00:00.000Z",
  updatedAt: "2026-09-24T00:00:00.000Z",
};

describe("application quick-edit updates", () => {
  it("creates explicit status updates", () => {
    expect(createStatusQuickEdit("Offered")).toEqual({ status: "Offered" });
    expect(createStatusQuickEdit("Accepted")).toEqual({ status: "Accepted" });
  });

  it("moves an application into Interviewing when scheduling an interview", () => {
    expect(createInterviewQuickEdit(application, "2026-10-01T14:30")).toEqual({
      interviewDateTime: "2026-10-01T14:30",
      status: "Interviewing",
    });
  });

  it("does not change status when clearing an interview time", () => {
    expect(createInterviewQuickEdit(application, "")).toEqual({
      interviewDateTime: undefined,
    });
  });

  it.each(["Offered", "Accepted", "Rejected", "Withdrawn"] as const)(
    "does not overwrite the %s status when scheduling interview history",
    (status) => {
      expect(
        createInterviewQuickEdit(
          { ...application, status },
          "2026-10-01T14:30",
        ),
      ).toEqual({ interviewDateTime: "2026-10-01T14:30" });
    },
  );
});
