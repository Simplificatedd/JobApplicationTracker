import { describe, expect, it } from "vitest";
import type { Activity, Application, Interview } from "../types/application";
import { assessmentFromInterview } from "./assessments";
import {
  classifyApplicationOutcomePath,
  deriveApplicationStatusPath,
  normalizeStatusActivity,
} from "./statusHistory";

const activity: Activity = {
  id: "activity-status",
  applicationId: "app-1",
  type: "status_changed",
  message: "Status changed to Interviewing.",
  createdAt: "2026-10-01T00:00:00.000Z",
};

const application: Application = {
  id: "app-1",
  company: "Example Company",
  jobTitle: "Engineer",
  jobDescription: "",
  status: "Rejected",
  workMode: "unknown",
  jobType: "full-time",
  followUpNeeded: false,
  interviewProctored: false,
  deadlineEntryMode: "exact",
  priority: "medium",
  contactsCount: 0,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-04T00:00:00.000Z",
};

describe("normalizeStatusActivity", () => {
  it("adds a destination to legacy message-only transitions", () => {
    expect(normalizeStatusActivity(activity)).toMatchObject({
      statusTo: "Interviewing",
    });
  });

  it("treats message-only Offered transitions as legacy Accepted outcomes", () => {
    expect(
      normalizeStatusActivity({
        ...activity,
        message: "Status changed to Offered.",
      }),
    ).toMatchObject({ statusTo: "Accepted" });
  });

  it("preserves structured pending Offered transitions", () => {
    const structured = {
      ...activity,
      statusFrom: "Interviewing" as const,
      statusTo: "Offered" as const,
    };

    expect(normalizeStatusActivity(structured)).toEqual(structured);
  });

  it("migrates structured Offered transitions from legacy snapshots", () => {
    expect(
      normalizeStatusActivity(
        {
          ...activity,
          statusFrom: "Interviewing",
          statusTo: "Offered",
        },
        true,
      ),
    ).toMatchObject({
      statusFrom: "Interviewing",
      statusTo: "Accepted",
    });
  });
});

describe("deriveApplicationStatusPath", () => {
  it("derives an ordered path from structured transitions", () => {
    const activities: Activity[] = [
      {
        ...activity,
        id: "created",
        type: "created",
        message: "Created application.",
        statusTo: "Awaiting Response",
      },
      {
        ...activity,
        id: "offered",
        message: "Status changed to Offered.",
        statusFrom: "Awaiting Response",
        statusTo: "Offered",
        createdAt: "2026-10-02T00:00:00.000Z",
      },
      {
        ...activity,
        id: "rejected",
        message: "Status changed to Rejected.",
        statusFrom: "Offered",
        statusTo: "Rejected",
        createdAt: "2026-10-04T00:00:00.000Z",
      },
    ];

    expect(deriveApplicationStatusPath(application, activities)).toEqual([
      "Awaiting Response",
      "Offered",
      "Rejected",
    ]);
  });

  it("uses interview history to repair a legacy path", () => {
    const interview: Interview = {
      id: "interview-1",
      applicationId: application.id,
      type: "technical",
      mode: "video",
      proctored: false,
      createdAt: "2026-10-02T00:00:00.000Z",
      updatedAt: "2026-10-02T00:00:00.000Z",
    };
    const rejection = {
      ...activity,
      message: "Status changed to Rejected.",
      createdAt: "2026-10-03T00:00:00.000Z",
    };

    expect(
      deriveApplicationStatusPath(application, [rejection], [interview]),
    ).toEqual(["Awaiting Response", "Interviewing", "Rejected"]);
  });

  it("deduplicates repeated adjacent status events", () => {
    const repeated = {
      ...activity,
      statusFrom: "Awaiting Response" as const,
      statusTo: "Rejected" as const,
      createdAt: application.updatedAt,
    };

    expect(
      deriveApplicationStatusPath(application, [repeated, repeated]),
    ).toEqual(["Awaiting Response", "Rejected"]);
  });
});

describe("classifyApplicationOutcomePath", () => {
  const migratedSource: Interview = {
    id: "legacy-assessment", applicationId: application.id,
    type: "online-assessment", mode: "unknown", proctored: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
  };
  const migrated = assessmentFromInterview(migratedSource, 1);
  const laterInterview: Activity = {
    ...activity, statusFrom: "Online Assessment", statusTo: "Interviewing",
    createdAt: "2026-10-03T00:00:00.000Z",
  };

  it.each(["Online Assessment", "Awaiting Response", "Rejected"] as const)(
    "preserves a later explicit interview transition from %s without a retained interview",
    (statusFrom) => {
      const events: Activity[] = [
        { ...activity, statusTo: "Interviewing", createdAt: migratedSource.createdAt },
        { ...laterInterview, statusFrom },
        { ...activity, id: "rejected", statusFrom: "Interviewing", statusTo: "Rejected", createdAt: application.updatedAt },
      ];
      const canonical = { ...migratedSource, id: "real-interview", type: "technical" as const };
      expect(classifyApplicationOutcomePath(application, events, [canonical], [migrated])).toBe("interviewed_rejected");
      // Deleting the canonical interview retains the status-only classification.
      expect(classifyApplicationOutcomePath(application, events, [], [migrated])).toBe("interviewed_rejected");
    },
  );

  it.each([
    { ...laterInterview, createdAt: migratedSource.createdAt },
    { ...laterInterview, createdAt: migratedSource.updatedAt },
    { ...laterInterview, type: "created" as const },
    { ...laterInterview, statusFrom: "Interviewing" as const },
    { ...laterInterview, statusFrom: undefined },
    { ...laterInterview, statusTo: "Rejected" as const, statusFrom: "Interviewing" as const },
    { ...laterInterview, applicationId: "another-application" },
    { ...laterInterview, createdAt: "invalid" },
  ])("does not fabricate an interview from assessment-only or ambiguous history: %j", (event) => {
    expect(classifyApplicationOutcomePath(application, [event], [], [migrated])).toBe("assessment_rejected");
  });

  it("does not infer an independent interview from message-only or synthesized path events", () => {
    expect(classifyApplicationOutcomePath(application, [], [], [migrated])).toBe("assessment_rejected");
    expect(classifyApplicationOutcomePath(application, [{ ...laterInterview, statusFrom: undefined, statusTo: undefined }], [], [migrated])).toBe("assessment_rejected");
  });

  it("does not let a later assessment hide an independent earlier interview transition", () => {
    const laterSource = { ...migratedSource, id: "later-assessment", createdAt: "2026-10-04T00:00:00.000Z", updatedAt: "2026-10-05T00:00:00.000Z" };
    expect(classifyApplicationOutcomePath(application, [laterInterview], [], [migrated, assessmentFromInterview(laterSource, 2)])).toBe("interviewed_rejected");
    const overlapping = { ...laterSource, createdAt: laterInterview.createdAt };
    expect(classifyApplicationOutcomePath(application, [laterInterview], [], [migrated, assessmentFromInterview(overlapping, 2)])).toBe("assessment_rejected");
  });

  it("keeps canonical interview evidence when source dates are ambiguous", () => {
    const invalid = assessmentFromInterview({ ...migratedSource, updatedAt: "invalid" }, 1);
    expect(classifyApplicationOutcomePath(application, [laterInterview], [], [invalid])).toBe("assessment_rejected");
    expect(classifyApplicationOutcomePath(application, [], [migratedSource], [invalid])).toBe("interviewed_rejected");
  });

  it("distinguishes offered then rejected from a direct rejection", () => {
    const activities: Activity[] = [
      {
        ...activity,
        id: "offered",
        statusFrom: "Awaiting Response",
        statusTo: "Offered",
        createdAt: "2026-10-02T00:00:00.000Z",
      },
      {
        ...activity,
        id: "rejected",
        statusFrom: "Offered",
        statusTo: "Rejected",
        createdAt: "2026-10-03T00:00:00.000Z",
      },
    ];

    expect(
      classifyApplicationOutcomePath(application, activities),
    ).toBe("offered_rejected");
    expect(
      classifyApplicationOutcomePath(application, [
        {
          ...activities[1],
          statusFrom: "Awaiting Response",
        },
      ]),
    ).toBe("rejected_without_interview");
  });

  it("classifies an interviewed then rejected path", () => {
    const interview: Interview = {
      id: "interview-1",
      applicationId: application.id,
      type: "technical",
      mode: "video",
      proctored: false,
      createdAt: "2026-10-02T00:00:00.000Z",
      updatedAt: "2026-10-02T00:00:00.000Z",
    };

    expect(
      classifyApplicationOutcomePath(application, [], [interview]),
    ).toBe("interviewed_rejected");
  });

  it("uses the furthest reached stage for a rejected application", () => {
    const activities: Activity[] = [
      {
        ...activity,
        id: "interviewing",
        statusFrom: "Awaiting Response",
        statusTo: "Interviewing",
        createdAt: "2026-10-02T00:00:00.000Z",
      },
      {
        ...activity,
        id: "offered",
        statusFrom: "Interviewing",
        statusTo: "Offered",
        createdAt: "2026-10-03T00:00:00.000Z",
      },
    ];

    expect(
      classifyApplicationOutcomePath(application, activities),
    ).toBe("offered_rejected");
  });

  it.each([
    ["Accepted", "accepted"],
    ["Withdrawn", "withdrawn"],
    ["Offered", "offer_pending"],
    ["Interviewing", "interviewing"],
    ["Awaiting Response", "awaiting_response"],
  ] as const)("classifies %s as %s", (status, expected) => {
    expect(
      classifyApplicationOutcomePath(
        { ...application, status },
        [],
      ),
    ).toBe(expected);
  });
});
