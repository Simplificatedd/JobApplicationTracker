import { describe, expect, it } from "vitest";
import type { Application, Interview } from "../types/application";
import { buildInterviewRecord, upsertInterviewHistory } from "./interviews";

const application: Application = {
  id: "app-1",
  company: "Example Company",
  jobTitle: "Software Engineer",
  jobDescription: "",
  status: "Interviewing",
  workMode: "unknown",
  jobType: "internship",
  followUpNeeded: false,
  interviewRound: 1,
  interviewType: "technical",
  interviewMode: "video",
  interviewProctored: false,
  deadlineEntryMode: "exact",
  priority: "medium",
  contactsCount: 0,
  createdAt: "2026-09-20T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
};

const firstRound: Interview = {
  id: "interview-1",
  applicationId: application.id,
  round: 1,
  type: "technical",
  mode: "video",
  proctored: false,
  notes: "Strong first round",
  createdAt: "2026-09-20T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
};

describe("buildInterviewRecord", () => {
  it("updates the matching round without losing interview-only notes", () => {
    expect(
      buildInterviewRecord(
        { ...application, interviewDateTime: "2026-09-22T10:00" },
        [firstRound],
        "2026-09-21T00:00:00.000Z",
      ),
    ).toMatchObject({
      id: firstRound.id,
      dateTime: "2026-09-22T10:00",
      notes: firstRound.notes,
      round: 1,
    });
  });

  it("creates a distinct record for a new interview round", () => {
    const nextRound = buildInterviewRecord(
      { ...application, interviewRound: 2 },
      [firstRound],
      "2026-09-21T00:00:00.000Z",
    );

    expect(nextRound).toMatchObject({ applicationId: application.id, round: 2 });
    expect(nextRound?.id).not.toBe(firstRound.id);
    expect(upsertInterviewHistory([firstRound], nextRound!)).toHaveLength(2);
  });

  it("supports an unscheduled interview record", () => {
    expect(
      buildInterviewRecord(
        { ...application, interviewDateTime: undefined },
        [],
        "2026-09-21T00:00:00.000Z",
      ),
    ).toMatchObject({ applicationId: application.id, dateTime: undefined });
  });

  it("does not rewrite history after the application leaves interviewing", () => {
    expect(
      buildInterviewRecord(
        { ...application, status: "Offered" },
        [firstRound],
        "2026-09-21T00:00:00.000Z",
      ),
    ).toBeUndefined();
  });
});
