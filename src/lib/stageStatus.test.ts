import { describe, expect, it } from "vitest";
import type { ApplicationStatus } from "../types/application";
import { interview } from "../test/assessmentFixtures";
import {
  statusAfterAssessmentAdded,
  statusAfterInterviewAdded,
  statusAfterInterviewEdited,
  suggestStatusAfterRemoval,
} from "./stageStatus";

const LOCKED: ApplicationStatus[] = ["Offered", "Accepted", "Rejected", "Withdrawn"];
const now = new Date("2026-11-05T12:00:00.000Z");
const undated = interview(1);
const past = { ...undated, dateTime: "2026-11-01T10:00:00.000Z" };
const future = { ...undated, dateTime: "2026-11-10T10:00:00.000Z" };

describe("R1: adding an interview", () => {
  it("moves the early statuses to Interviewing", () => {
    expect(statusAfterInterviewAdded("Awaiting Response")).toBe("Interviewing");
    expect(statusAfterInterviewAdded("Online Assessment")).toBe("Interviewing");
  });

  it.each([...LOCKED, "Interviewing"] as ApplicationStatus[])("leaves %s alone", status => {
    expect(statusAfterInterviewAdded(status)).toBe(status);
  });
});

describe("R2: editing an interview", () => {
  it("moves the early statuses when an interview gains its first future date", () => {
    expect(statusAfterInterviewEdited("Awaiting Response", undated, future, now)).toBe("Interviewing");
    expect(statusAfterInterviewEdited("Online Assessment", past, future, now)).toBe("Interviewing");
  });

  it("counts a future deadline as a future date", () => {
    const withDeadline = { ...undated, deadline: "2026-11-08T17:00:00.000Z" };
    expect(statusAfterInterviewEdited("Online Assessment", undated, withDeadline, now)).toBe("Interviewing");
  });

  it("does not change the status when the date is removed, moved to the past or was already in the future", () => {
    expect(statusAfterInterviewEdited("Online Assessment", future, undated, now)).toBe("Online Assessment");
    expect(statusAfterInterviewEdited("Online Assessment", future, past, now)).toBe("Online Assessment");
    expect(statusAfterInterviewEdited("Online Assessment", undated, past, now)).toBe("Online Assessment");
    const later = { ...future, dateTime: "2026-11-12T10:00:00.000Z" };
    expect(statusAfterInterviewEdited("Online Assessment", future, later, now)).toBe("Online Assessment");
  });

  it.each(LOCKED)("never changes %s", status => {
    expect(statusAfterInterviewEdited(status, undated, future, now)).toBe(status);
  });
});

describe("R3: adding an assessment", () => {
  it("only moves Awaiting Response", () => {
    expect(statusAfterAssessmentAdded("Awaiting Response")).toBe("Online Assessment");
  });

  it.each([...LOCKED, "Online Assessment", "Interviewing"] as ApplicationStatus[])("leaves %s alone", status => {
    expect(statusAfterAssessmentAdded(status)).toBe(status);
  });
});

describe("R6-R9: suggesting a status after the last interview or assessment goes", () => {
  it("suggests the highest status the remaining records support", () => {
    expect(suggestStatusAfterRemoval("Interviewing", "interview", { interviews: 0, assessments: 0 }))
      .toBe("Awaiting Response");
    expect(suggestStatusAfterRemoval("Interviewing", "interview", { interviews: 0, assessments: 1 }))
      .toBe("Online Assessment");
    expect(suggestStatusAfterRemoval("Online Assessment", "assessment", { interviews: 0, assessments: 0 }))
      .toBe("Awaiting Response");
  });

  it("does not prompt while other records of the same kind or an interview remain", () => {
    expect(suggestStatusAfterRemoval("Interviewing", "interview", { interviews: 1, assessments: 0 })).toBeUndefined();
    expect(suggestStatusAfterRemoval("Online Assessment", "assessment", { interviews: 0, assessments: 1 })).toBeUndefined();
    expect(suggestStatusAfterRemoval("Online Assessment", "assessment", { interviews: 1, assessments: 0 })).toBeUndefined();
  });

  it("does not prompt when the removed record does not match the status", () => {
    expect(suggestStatusAfterRemoval("Interviewing", "assessment", { interviews: 0, assessments: 0 })).toBeUndefined();
    expect(suggestStatusAfterRemoval("Online Assessment", "interview", { interviews: 0, assessments: 0 })).toBeUndefined();
    expect(suggestStatusAfterRemoval("Awaiting Response", "interview", { interviews: 0, assessments: 0 })).toBeUndefined();
  });

  it.each(LOCKED)("never prompts for %s", status => {
    expect(suggestStatusAfterRemoval(status, "interview", { interviews: 0, assessments: 0 })).toBeUndefined();
    expect(suggestStatusAfterRemoval(status, "assessment", { interviews: 0, assessments: 0 })).toBeUndefined();
  });

  // The overlap cases from #228 where activity history would suggest the wrong status.
  it("handles overlapping interviews and assessments", () => {
    // AR -> assessment -> interview -> delete interview: an assessment remains.
    expect(suggestStatusAfterRemoval("Interviewing", "interview", { interviews: 0, assessments: 1 }))
      .toBe("Online Assessment");
    // ...then delete the assessment: history would say Interviewing.
    expect(suggestStatusAfterRemoval("Online Assessment", "assessment", { interviews: 0, assessments: 0 }))
      .toBe("Awaiting Response");
  });

  it("suggests Online Assessment after converting the last interview (R9)", () => {
    expect(suggestStatusAfterRemoval("Interviewing", "interview", { interviews: 0, assessments: 1 }))
      .toBe("Online Assessment");
  });
});
