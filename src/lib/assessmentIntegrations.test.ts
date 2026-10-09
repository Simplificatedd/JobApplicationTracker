import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  application,
  interview,
  snapshot,
  timestamp,
  now,
} from "../test/assessmentFixtures";
import {
  assessmentFromInterview,
  migrateStageSnapshot,
  submittedAssessmentUpdate,
  type AssessmentActions,
} from "./assessments";
import {
  DEFAULT_NOTIFICATION_STATE,
  DEFAULT_USER_SETTINGS,
  normalizeApplicationStatus,
} from "./domain";
import {
  deriveApplicationNotifications,
  deriveNeedsAttentionApplicationIds,
  deriveReminderNotifications,
} from "./reminders";
import {
  isNeedsAttention,
  applyApplicationFilters,
  DEFAULT_APPLICATION_FILTERS,
} from "../features/applications/applicationFilters";
import {
  classifyApplicationOutcomePath,
  deriveApplicationStatusPath,
} from "./statusHistory";
import {
  deriveAssessmentsOverTime,
  deriveInterviewsOverTime,
  derivePipelineByStatus,
  deriveApplicationPaths,
  deriveOutcomes,
  deriveActivityCalendarDays,
} from "../features/analytics/AnalyticsPage";
import {
  AssessmentsSection,
  assessmentDraftToInput,
} from "../features/applications/AssessmentsSection";
import type { Activity } from "../types/application";

const old = {
  ...interview(2, "online-assessment"),
  deadline: "2026-09-23T00:00:00.000Z",
};
const migrated = migrateStageSnapshot(snapshot({ interviews: [old] }), now);
const assessment = migrated.assessments![0];
const app = migrated.applications[0];
const reminders = (
  progress = assessment.progress,
  deadline = assessment.deadline,
) =>
  deriveApplicationNotifications(
    { ...app, status: "Online Assessment" },
    DEFAULT_USER_SETTINGS,
    now,
    [],
    [{ ...assessment, progress, deadline }],
  );

describe("assessment reminders and needs attention", () => {
  it("preserves future scheduled-start reminders even without an assessment deadline", () => {
    const source = {
      ...old,
      deadline: undefined,
      dateTime: "2026-09-22T00:00:00.000Z",
    };
    const converted = assessmentFromInterview(source, 1);
    const previous = deriveApplicationNotifications(
      application,
      DEFAULT_USER_SETTINGS,
      now,
      [source],
    );
    const next = deriveApplicationNotifications(
      app,
      DEFAULT_USER_SETTINGS,
      now,
      [],
      [converted],
    );
    expect(next).toMatchObject([
      { id: previous[0].id, type: "assessment_start", dueAt: source.dateTime },
    ]);
    expect(
      deriveApplicationNotifications(
        app,
        DEFAULT_USER_SETTINGS,
        now,
        [],
        [{ ...converted, progress: "submitted" }],
      ),
    ).toEqual([]);
  });
  it("preserves the old deadline reminder identity after migration", () => {
    const oldDeadline = deriveApplicationNotifications(
      application,
      DEFAULT_USER_SETTINGS,
      now,
      [old],
    ).find((item) => item.type === "deadline");
    const updated = reminders();
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({
      id: oldDeadline?.id,
      type: "assessment_deadline",
      group: "assessments",
      assessmentId: old.id,
    });
    expect(
      deriveApplicationNotifications(
        app,
        DEFAULT_USER_SETTINGS,
        now,
        migrated.interviews,
        migrated.assessments,
      ).filter((item) => item.type === "assessment_deadline"),
    ).toHaveLength(1);
  });
  it.each(["submitted", "cancelled"] as const)(
    "stops reminders when %s",
    (progress) => expect(reminders(progress)).toEqual([]),
  );
  it.each(["not-started", "in-progress", "unknown", "expired"] as const)(
    "keeps overdue unfinished %s assessments visible",
    (progress) => {
      const result = reminders(progress, "2026-09-20T23:00:00.000Z");
      expect(result).toMatchObject([{ severity: "overdue" }]);
      expect(assessment.progress).toBe("unknown");
      expect(assessment.submittedAt).toBeUndefined();
    },
  );
  it("treats a deadline earlier today as overdue, not just due today", () => {
    expect(
      deriveApplicationNotifications(
        app,
        DEFAULT_USER_SETTINGS,
        new Date("2026-09-21T12:00:00.000Z"),
        [],
        [{ ...assessment, deadline: "2026-09-21T11:59:00.000Z" }],
      )[0].severity,
    ).toBe("overdue");
  });
  it.each([
    "Awaiting Response",
    "Online Assessment",
    "Interviewing",
    "Offered",
  ] as const)(
    "supports assessment reminders independently of %s status",
    (status) => {
      expect(
        deriveApplicationNotifications(
          { ...app, status },
          DEFAULT_USER_SETTINGS,
          now,
          [],
          [assessment],
        ),
      ).toMatchObject([{ type: "assessment_deadline" }]);
    },
  );
  it.each(["Accepted", "Rejected", "Withdrawn"] as const)(
    "preserves reminder suppression for final %s applications",
    (status) => {
      expect(
        deriveApplicationNotifications(
          { ...app, status },
          DEFAULT_USER_SETTINGS,
          now,
          [],
          [assessment],
        ),
      ).toEqual([]);
    },
  );
  it("supports multiple independent deadlines and needs-attention filters", () => {
    const second = {
      ...assessment,
      id: "assessment-2",
      number: 2,
      deadline: "2026-09-20T00:00:00.000Z",
    };
    const data = {
      applications: [app],
      interviews: [],
      assessments: [assessment, second],
      settings: DEFAULT_USER_SETTINGS,
      now,
    };
    expect(deriveNeedsAttentionApplicationIds(data).has(app.id)).toBe(true);
    expect(
      isNeedsAttention(app, DEFAULT_USER_SETTINGS, now, [], data.assessments),
    ).toBe(true);
    expect(
      deriveReminderNotifications({
        ...data,
        notificationState: DEFAULT_NOTIFICATION_STATE,
      }),
    ).toHaveLength(2);
    expect(
      deriveReminderNotifications({
        ...data,
        assessments: [
          assessment,
          { ...second, ...submittedAssessmentUpdate(timestamp) },
        ],
        notificationState: DEFAULT_NOTIFICATION_STATE,
      }),
    ).toHaveLength(1);
  });
  it("retains dismissal state for converted deadline notifications", () => {
    const dismissed = `deadline:${app.id}:${assessment.id}`;
    expect(
      deriveReminderNotifications({
        applications: [app],
        interviews: [],
        assessments: [assessment],
        settings: DEFAULT_USER_SETTINGS,
        now,
        notificationState: {
          ...DEFAULT_NOTIFICATION_STATE,
          dismissedNotificationIds: [dismissed],
        },
      }),
    ).toEqual([]);
  });
  it("ignores undated assessments and retains due-soon settings", () => {
    expect(
      deriveApplicationNotifications(
        app,
        DEFAULT_USER_SETTINGS,
        now,
        [],
        [{ ...assessment, deadline: undefined }],
      ),
    ).toEqual([]);
    expect(reminders("not-started", "2026-10-20T00:00:00.000Z")).toMatchObject([
      { severity: "upcoming" },
    ]);
    expect(
      deriveApplicationNotifications(
        app,
        {
          ...DEFAULT_USER_SETTINGS,
          includeUpcomingInterviewsInAttention: false,
        },
        now,
        [],
        [assessment],
      ),
    ).toHaveLength(1);
  });
});

describe("assessment analytics and statuses", () => {
  it("normalizes, filters, and counts Online Assessment as its own status", () => {
    const online = { ...app, status: "Online Assessment" as const };
    expect(normalizeApplicationStatus(online.status)).toBe(online.status);
    expect(
      applyApplicationFilters([online, app], {
        ...DEFAULT_APPLICATION_FILTERS,
        status: online.status,
      }),
    ).toEqual([online]);
    expect(derivePipelineByStatus([online])).toContainEqual({
      label: online.status,
      value: 1,
    });
    expect(
      deriveApplicationPaths([online], [], [], [assessment]),
    ).toContainEqual({ label: "Online assessment", value: 1 });
  });
  it("counts migrated assessments separately from interviews over time", () => {
    const data = migrateStageSnapshot(
      snapshot({
        interviews: [
          { ...interview(1), dateTime: timestamp },
          old,
          { ...interview(3), dateTime: timestamp },
        ],
      }),
      now,
    );
    expect(
      deriveInterviewsOverTime(data.interviews, "daily").reduce(
        (sum, item) => sum + item.value,
        0,
      ),
    ).toBe(2);
    expect(
      deriveAssessmentsOverTime(data.assessments!, "daily").reduce(
        (sum, item) => sum + item.value,
        0,
      ),
    ).toBe(1);
  });
  it("keeps historical status events without counting assessment-only rejection as an interviewed rejection", () => {
    const rejected = { ...app, status: "Rejected" as const };
    const events: Activity[] = [
      {
        id: "status-1",
        applicationId: app.id,
        type: "status_changed",
        statusFrom: "Awaiting Response",
        statusTo: "Interviewing",
        message: "Status changed to Interviewing.",
        createdAt: timestamp,
      },
    ];
    expect(
      deriveApplicationStatusPath(rejected, events, [], [assessment]),
    ).toContain("Online Assessment");
    expect(
      classifyApplicationOutcomePath(rejected, events, [], [assessment]),
    ).toBe("assessment_rejected");
    expect(
      classifyApplicationOutcomePath(
        rejected,
        events,
        [interview(3)],
        [assessment],
      ),
    ).toBe("interviewed_rejected");
    expect(deriveOutcomes([rejected], events, [], [assessment])).toContainEqual(
      { label: "Rejected", value: 1 },
    );
    expect(events[0].statusTo).toBe("Interviewing");
  });
  it("represents historical assessment events without fabricating completed interviews or submissions", () => {
    const days = deriveActivityCalendarDays(
      [app],
      [],
      [],
      [{ ...assessment, scheduledStart: "2026-09-22T00:00:00.000Z" }],
    );
    const scheduled = days.find((day) => day.date === "2026-09-22");
    expect(scheduled?.summary).toContain("assessment event");
    expect(scheduled?.summary).not.toContain("interview completed");
    expect(assessment.submittedAt).toBeUndefined();
  });
});

describe("assessment UI", () => {
  const actions: AssessmentActions = {
    addAssessment: vi.fn(),
    updateAssessment: vi.fn(),
    deleteAssessment: vi.fn(),
    convertInterviewToAssessment: vi.fn(),
  };
  it("renders independent assessment cards, original rounds, and quick actions", () => {
    const html = renderToStaticMarkup(
      createElement(AssessmentsSection, {
        application: app,
        assessments: [
          assessment,
          { ...assessment, id: "second", number: 2, originalInterviewRound: 4 },
        ],
        assessmentActions: actions,
      }),
    );
    expect(html).toContain("Assessment 1");
    expect(html).toContain("Assessment 2");
    expect(html).toContain("Originally Round 2");
    expect(html).toContain("Originally Round 4");
    expect(html).toContain("Mark submitted");
    expect(html).toContain("Edit deadline");
  });
  it("safely handles empty assessments and hides mutation actions in the archive", () => {
    const empty = renderToStaticMarkup(
      createElement(AssessmentsSection, {
        application: app,
        assessments: [],
        assessmentActions: actions,
      }),
    );
    expect(empty).toContain("No assessments added yet");
    const archived = renderToStaticMarkup(
      createElement(AssessmentsSection, {
        application: { ...app, archivedAt: timestamp },
        assessments: [assessment],
        assessmentActions: actions,
      }),
    );
    expect(archived).not.toContain("Mark submitted");
    expect(archived).not.toContain("Edit deadline");
    expect(archived).not.toContain("Add assessment");
  });
  it("does not offer submission again for submitted or cancelled assessments", () => {
    for (const progress of ["submitted", "cancelled"] as const) {
      const html = renderToStaticMarkup(
        createElement(AssessmentsSection, {
          application: app,
          assessments: [{ ...assessment, progress }],
          assessmentActions: actions,
        }),
      );
      expect(html).not.toContain("Mark submitted");
    }
  });
  it("renders safe links, and suppresses unsafe links without losing the stored value", () => {
    const safe = {
      ...assessment,
      link: "https://example.com",
      name: "<script>test</script>",
      platform: "SHL",
    };
    const html = renderToStaticMarkup(
      createElement(AssessmentsSection, {
        application: app,
        assessments: [safe],
        assessmentActions: actions,
      }),
    );
    expect(html).toContain("Open assessment");
    expect(html).toContain("SHL");
    expect(html).not.toContain("<script>");
    const unsafe = renderToStaticMarkup(
      createElement(AssessmentsSection, {
        application: app,
        assessments: [{ ...safe, link: "javascript:alert(1)" }],
        assessmentActions: actions,
      }),
    );
    expect(unsafe).not.toContain("Open assessment");
  });
  it("converts date inputs to UTC, clears optional values, and retains unknown state", () => {
    const draft = {
      ...assessmentFromInterview(interview(2), 1),
      name: "   ",
      platform: " SHL ",
      deadline: "2026-09-23T08:30",
      receivedAt: "",
      submittedAt: "",
    };
    const input = assessmentDraftToInput(draft);
    expect(input.deadline).toBe(new Date(draft.deadline).toISOString());
    expect(input.name).toBeUndefined();
    expect(input.platform).toBe("SHL");
    expect(input.receivedAt).toBeUndefined();
    expect(input.submittedAt).toBeUndefined();
    expect(input.progress).toBe("unknown");
  });
});
