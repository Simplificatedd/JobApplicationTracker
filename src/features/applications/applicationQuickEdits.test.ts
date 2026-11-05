import { describe, expect, it } from "vitest";
import type { Application } from "../../types/application";
import {
  canQuickEditInterview,
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
    expect(createInterviewQuickEdit({ ...application, interviewDateTime: "2026-10-01T14:30" }, "")).toEqual({
      interviewDateTime: undefined,
    });
  });

  it.each(["Offered", "Accepted", "Rejected", "Withdrawn"] as const)(
    "does not offer a silently reverting quick edit for %s",
    (status) => {
      expect(
        createInterviewQuickEdit(
          { ...application, status },
          "2026-10-01T14:30",
        ),
      ).toEqual({});
      expect(canQuickEditInterview({ ...application, status })).toBe(false);
    },
  );
});


it("does not write an unchanged schedule", () => {
  expect(createInterviewQuickEdit({ ...application, status: "Interviewing", interviewDateTime: "2026-10-01T14:30" }, "2026-10-01T14:30")).toEqual({});
});

describe("table scheduling follows the #228 interview rules", () => {
  const now = new Date("2026-11-05T12:00:00");
  const scheduled = { ...application, status: "Online Assessment" as const, interviewDateTime: "2026-11-10T10:00" };

  it("moves the status when an interview is scheduled for the first time, whatever the date (R1)", () => {
    expect(createInterviewQuickEdit(application, "2020-01-01T10:00", now)).toMatchObject({ status: "Interviewing" });
  });

  it("moves the status when an existing past interview is moved to a future date (R2)", () => {
    const past = { ...scheduled, interviewDateTime: "2026-11-01T10:00" };
    expect(createInterviewQuickEdit(past, "2026-11-20T10:00", now)).toMatchObject({ status: "Interviewing" });
  });

  it("keeps the status when an already future interview gets another future date (R2)", () => {
    const manual = { ...scheduled, status: "Awaiting Response" as const };
    expect(createInterviewQuickEdit(manual, "2026-11-20T10:00", now)).toEqual({ interviewDateTime: "2026-11-20T10:00" });
  });

  it("keeps the status when an existing interview is moved into the past (R2)", () => {
    expect(createInterviewQuickEdit(scheduled, "2026-11-01T10:00", now)).toEqual({ interviewDateTime: "2026-11-01T10:00" });
  });
});
