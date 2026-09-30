import { describe, expect, it } from "vitest";
import type { Application, Interview } from "../types/application";
import {
  buildInterviewRecord,
  createInterviewRecord,
  getNextInterviewRound,
  isValidInterviewRound,
  reconcileCanonicalInterviews,
  selectCurrentInterview,
  updateInterviewRecord,
  upsertInterviewHistory,
} from "./interviews";

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

  it("updates the projected record by ID when round numbers are duplicated", () => {
    const duplicateRound = {
      ...firstRound,
      id: "interview-duplicate",
      updatedAt: "2026-09-21T00:00:00.000Z",
    };

    expect(
      buildInterviewRecord(
        { ...application, interviewDateTime: "2026-09-22T10:00" },
        [firstRound, duplicateRound],
        "2026-09-22T00:00:00.000Z",
        firstRound.id,
      ),
    ).toMatchObject({
      dateTime: "2026-09-22T10:00",
      id: firstRound.id,
    });
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

describe("reconcileCanonicalInterviews", () => {
  it("does not create an empty record from interviewing status alone", () => {
    const statusOnlyApplication: Application = {
      ...application,
      interviewRound: undefined,
      interviewType: undefined,
      interviewMode: undefined,
      interviewProctored: false,
    };

    const result = reconcileCanonicalInterviews([statusOnlyApplication], []);

    expect(result.interviewWrites).toEqual([]);
    expect(result.interviews).toEqual([]);
  });

  it("migrates legacy application-only interview details into history", () => {
    const legacyApplication = {
      ...application,
      status: "Offered" as const,
      interviewDateTime: "2026-09-22T10:00",
      interviewLocation: "Career centre",
    };
    const result = reconcileCanonicalInterviews([legacyApplication], []);

    expect(result.interviewWrites).toHaveLength(1);
    expect(result.interviews[0]).toMatchObject({
      applicationId: application.id,
      dateTime: "2026-09-22T10:00",
      location: "Career centre",
      round: 1,
    });
  });

  it("projects the latest canonical round when no current round is stored", () => {
    const secondRound: Interview = {
      ...firstRound,
      id: "interview-2",
      round: 2,
      type: "face-to-face",
      mode: "onsite",
      location: "Main office",
      updatedAt: "2026-09-21T00:00:00.000Z",
    };
    const staleApplication = {
      ...application,
      status: "Offered" as const,
      interviewRound: undefined,
      interviewType: undefined,
      interviewMode: undefined,
    };
    const result = reconcileCanonicalInterviews(
      [staleApplication],
      [firstRound, secondRound],
    );

    expect(result.applications[0]).toMatchObject({
      interviewLocation: "Main office",
      interviewMode: "onsite",
      interviewRound: 2,
      interviewType: "face-to-face",
      updatedAt: staleApplication.updatedAt,
    });
    expect(result.applicationWrites).toEqual([result.applications[0]]);
    expect(result.interviews).toHaveLength(2);
  });

  it("projects the nearest upcoming interview instead of a stale round", () => {
    const secondRound: Interview = {
      ...firstRound,
      id: "interview-2",
      dateTime: "2026-09-24T10:00",
      round: 2,
      type: "face-to-face",
      mode: "onsite",
      updatedAt: "2026-09-21T00:00:00.000Z",
    };
    const earlierRound = {
      ...firstRound,
      dateTime: "2026-09-22T10:00",
    };
    const result = reconcileCanonicalInterviews(
      [application],
      [earlierRound, secondRound],
      new Date("2026-09-23T00:00:00.000Z"),
    );

    expect(result.applications[0]).toMatchObject({
      interviewMode: secondRound.mode,
      interviewRound: 2,
      interviewType: secondRound.type,
    });
    expect(result.applicationWrites).toEqual([result.applications[0]]);
  });

  it("preserves a newer application-only round when older history exists", () => {
    const secondRoundApplication = {
      ...application,
      interviewDateTime: "2026-09-24T14:00",
      interviewLocation: "Main office",
      interviewRound: 2,
      updatedAt: "2026-09-22T00:00:00.000Z",
    };
    const result = reconcileCanonicalInterviews(
      [secondRoundApplication],
      [firstRound],
    );

    expect(result.interviews).toHaveLength(2);
    expect(result.interviewWrites).toEqual([
      expect.objectContaining({
        dateTime: "2026-09-24T14:00",
        location: "Main office",
        round: 2,
      }),
    ]);
    expect(result.applications[0]).toMatchObject({
      interviewDateTime: "2026-09-24T14:00",
      interviewRound: 2,
    });
  });

  it("keeps a canonical interview authoritative after an unrelated application update", () => {
    const newerApplication = {
      ...application,
      interviewDateTime: "2026-09-24T14:00",
      interviewPlatform: "Teams",
      updatedAt: "2026-09-22T00:00:00.000Z",
    };
    const result = reconcileCanonicalInterviews(
      [newerApplication],
      [firstRound],
    );

    expect(result.interviewWrites).toEqual([]);
    expect(result.interviews).toEqual([firstRound]);
    expect(result.applications[0]).toMatchObject({
      interviewDateTime: firstRound.dateTime,
      interviewPlatform: firstRound.platform,
      interviewRound: firstRound.round,
      updatedAt: newerApplication.updatedAt,
    });
    expect(result.applicationWrites).toEqual([result.applications[0]]);
  });
});

describe("selectCurrentInterview", () => {
  it("prefers the nearest upcoming interview", () => {
    const laterRound = {
      ...firstRound,
      id: "interview-2",
      dateTime: "2026-10-05T10:00",
      round: 2,
    };
    const nextRound = {
      ...firstRound,
      dateTime: "2026-10-02T10:00",
    };

    expect(
      selectCurrentInterview(
        [laterRound, nextRound],
        new Date("2026-10-01T00:00:00.000Z"),
      ),
    ).toBe(nextRound);
  });

  it("falls back to the most recent past interview", () => {
    const olderRound = {
      ...firstRound,
      id: "interview-2",
      dateTime: "2026-09-20T10:00",
      round: 2,
    };
    const recentRound = {
      ...firstRound,
      dateTime: "2026-09-25T10:00",
    };

    expect(
      selectCurrentInterview(
        [olderRound, recentRound],
        new Date("2026-10-01T00:00:00.000Z"),
      ),
    ).toBe(recentRound);
  });

  it("uses the nearest upcoming deadline for an assessment", () => {
    const assessment = {
      ...firstRound,
      deadline: "2026-10-02T12:00",
      id: "assessment-1",
      round: 2,
    };

    expect(
      selectCurrentInterview(
        [firstRound, assessment],
        new Date("2026-10-01T00:00:00.000Z"),
      ),
    ).toBe(assessment);
  });
});

describe("interview record mutations", () => {
  it("creates distinct IDs even when round numbers are blank or duplicated", () => {
    const input = {
      applicationId: application.id,
      type: "technical" as const,
      mode: "video" as const,
      proctored: false,
    };
    const first = createInterviewRecord(input, application.createdAt);
    const second = createInterviewRecord(input, application.updatedAt);

    expect(first.id).not.toBe(second.id);
    expect(upsertInterviewHistory([first], second)).toHaveLength(2);
  });

  it("updates by record identity without changing ownership or creation time", () => {
    expect(
      updateInterviewRecord(
        firstRound,
        { round: 3, type: "recruiter" },
        "2026-09-22T00:00:00.000Z",
      ),
    ).toMatchObject({
      applicationId: firstRound.applicationId,
      createdAt: firstRound.createdAt,
      id: firstRound.id,
      round: 3,
      type: "recruiter",
      updatedAt: "2026-09-22T00:00:00.000Z",
    });
  });

  it("suggests the round after the highest numbered interview", () => {
    expect(getNextInterviewRound([firstRound, { ...firstRound, round: 4 }])).toBe(5);
    expect(getNextInterviewRound([])).toBe(1);
  });

  it("only accepts blank or positive whole-number rounds", () => {
    expect(isValidInterviewRound(undefined)).toBe(true);
    expect(isValidInterviewRound(1)).toBe(true);
    expect(isValidInterviewRound(0)).toBe(false);
    expect(isValidInterviewRound(-1)).toBe(false);
    expect(isValidInterviewRound(1.5)).toBe(false);
  });
});
