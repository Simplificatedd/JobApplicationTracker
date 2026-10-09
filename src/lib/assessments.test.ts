import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import type { Assessment } from "../types/application";
import type { StorageSnapshot } from "../storage/StorageAdapter";
import {
  assessmentFromInterview,
  createAssessment,
  migrateStageSnapshot,
  submittedAssessmentUpdate,
  updateAssessment,
  validateAssessment,
} from "./assessments";
import { createBackupFile, parseBackupFile } from "./backups";
import { createTestStorageAdapter } from "../test/indexedDb";

import {
  application,
  interview,
  snapshot,
  timestamp,
  now,
} from "../test/assessmentFixtures";
beforeAll(() => vi.stubGlobal("IDBKeyRange", IDBKeyRange));
afterAll(() => vi.unstubAllGlobals());
const migrate = (data: StorageSnapshot) => migrateStageSnapshot(data, now);

describe("assessment stage migration", () => {
  it("splits Round 1 / assessment Round 2 / Round 3 without renumbering interviews", () => {
    const data = snapshot({
      applications: [
        {
          ...application,
          interviewRound: 2,
          interviewType: "online-assessment",
          interviewDeadline: "2026-09-23T10:00:00.000Z",
        },
      ],
      interviews: [
        interview(1),
        {
          ...interview(2, "online-assessment"),
          deadline: "2026-09-23T10:00:00.000Z",
        },
        interview(3),
      ],
    });
    const migrated = migrate(data);
    expect(migrated.interviews.map((item) => item.round)).toEqual([1, 3]);
    expect(migrated.assessments).toMatchObject([
      {
        id: "round-2",
        number: 1,
        originalInterviewRound: 2,
        progress: "unknown",
        result: "unknown",
        proctored: "unknown",
      },
    ]);
    expect(migrated.applications[0].status).toBe("Interviewing");
    expect(migrate(migrated)).toEqual(migrated);
    expect(data.interviews).toHaveLength(3);
    expect(data.applications[0].stageMigrationVersion).toBeUndefined();
  });

  it("preserves all legacy metadata and exact timestamps", () => {
    const old = {
      ...interview(2, "online-assessment"),
      platform: "HackerRank",
      meetingUrl: "https://example.com/test",
      location: "Legacy address",
      dateTime: "2026-09-22T10:00:00.000Z",
      deadlineReceivedAt: timestamp,
      deadlineEntryMode: "72_hours" as const,
      notes: "Prepare graphs",
      proctored: true,
      extraHistoricalField: "retain me",
    };
    const result = migrate(snapshot({ interviews: [old] })).assessments![0];
    expect(result).toMatchObject({
      id: old.id,
      scheduledStart: old.dateTime,
      receivedAt: timestamp,
      deadline: "2026-09-23T00:00:00.000Z",
      platform: old.platform,
      link: old.meetingUrl,
      notes: old.notes,
      createdAt: timestamp,
      updatedAt: timestamp,
      proctored: "yes",
    });
    expect(result.legacyInterview).toMatchObject(old);
    expect(result.submittedAt).toBeUndefined();
    expect(result.score).toBeUndefined();
    expect(result.timeLimitMinutes).toBeUndefined();
    expect(result.type).toBe("unknown");
  });

  it.each([
    "technical",
    "technical-interview",
    "other",
    "HireVue",
    "HackerRank",
    "take-home-assignment",
  ] as const)(
    "does not automatically migrate ambiguous %s records even with provider and notes",
    (type) => {
      const old = {
        ...interview(2, type),
        platform: "HackerRank",
        notes: "online assessment",
        deadline: "2026-09-23T10:00:00.000Z",
      };
      const migrated = migrate(snapshot({ interviews: [old] }));
      expect(migrated.assessments).toEqual([]);
      expect(migrated.interviews[0]).toEqual(old);
      expect(migrate(migrated)).toEqual(migrated);
    },
  );

  it.each([
    "Awaiting Response",
    "Online Assessment",
    "Interviewing",
    "Offered",
    "Accepted",
    "Rejected",
    "Withdrawn",
  ] as const)("does not move current %s status backwards", (status) => {
    const migrated = migrate(
      snapshot({
        applications: [{ ...application, status }],
        interviews: [interview(2, "online-assessment")],
      }),
    );
    expect(migrated.applications[0].status).toBe(status);
    expect(migrated.applications[0].updatedAt).toBe(timestamp);
  });

  it("assigns independent numbers in interleaved and multiple-assessment histories", () => {
    const migrated = migrate(
      snapshot({
        interviews: [
          interview(4),
          interview(3, "online-assessment"),
          interview(2),
          interview(1, "online-assessment"),
        ],
      }),
    );
    expect(
      migrated.assessments?.map((item) => [
        item.number,
        item.originalInterviewRound,
      ]),
    ).toEqual([
      [1, 1],
      [2, 3],
    ]);
    expect(migrated.interviews.map((item) => item.round)).toEqual([2, 4]);
  });

  it("recovers projection-only old data deterministically and never resurrects it", () => {
    const legacy = snapshot({
      applications: [
        {
          ...application,
          interviewRound: 2,
          interviewType: "online-assessment",
          interviewPlatform: "SHL",
          interviewDeadline: "2026-09-22T00:00:00.000Z",
        },
      ],
    });
    const first = migrate(legacy);
    expect(migrate(legacy)).toEqual(first);
    expect(first.assessments).toMatchObject([
      { number: 1, originalInterviewRound: 2, platform: "SHL" },
    ]);
    expect(migrate(first)).toEqual(first);
    expect(migrate({ ...first, assessments: [] }).assessments).toEqual([]);
  });

  it("does not suppress a legacy projection merely because a native assessment has no original round", () => {
    const native = createAssessment({ applicationId: application.id, type: "coding", progress: "not-started", result: "pending", proctored: "unknown" }, [], timestamp);
    const data = snapshot({ applications: [{ ...application, interviewType: "online-assessment", interviewDeadline: "2026-09-22T00:00:00.000Z" }], assessments: [native] });
    const migrated = migrate(data);
    expect(migrated.assessments).toHaveLength(2);
    expect(migrate(migrated)).toEqual(migrated);
  });

  it("handles partially migrated snapshots with a duplicated source and stale projection", () => {
    const old = interview(2, "online-assessment");
    const assessment = {
      ...assessmentFromInterview(old, 1),
      result: "passed" as const,
      score: "95%",
    };
    const migrated = migrate(
      snapshot({
        assessments: [assessment],
        interviews: [old, interview(3)],
        applications: [
          {
            ...application,
            interviewRound: 2,
            interviewType: "online-assessment",
          },
        ],
      }),
    );
    expect(migrated.assessments).toEqual([assessment]);
    expect(migrated.interviews.map((item) => item.round)).toEqual([3]);
    expect(migrate(migrated)).toEqual(migrated);
  });

  it("does not copy an old assessment deadline onto a remaining interview on later startups", () => {
    const migrated = migrate(
      snapshot({
        applications: [
          {
            ...application,
            interviewRound: 2,
            interviewType: "online-assessment",
            deadline: "2026-09-23T00:00:00.000Z",
          },
        ],
        interviews: [interview(2, "online-assessment"), interview(3)],
      }),
    );
    expect(migrated.assessments?.[0].deadline).toBe("2026-09-23T00:00:00.000Z");
    expect(migrate(migrated).interviews[0].deadline).toBeUndefined();
  });

  it("manual conversion preserves ambiguous source identity and information", () => {
    const old = {
      ...interview(8, "technical"),
      notes: "Take-home",
      platform: "Codility",
      meetingUrl: "https://example.com",
    };
    const converted = assessmentFromInterview(old, 3);
    expect(converted).toMatchObject({
      id: old.id,
      number: 3,
      originalInterviewRound: 8,
      type: "unknown",
      notes: old.notes,
      platform: old.platform,
      link: old.meetingUrl,
      legacyInterview: old,
    });
  });
});

describe("assessment persistence and backups", () => {
  it("upgrades a real v6 IndexedDB without changing modern Offered status or losing rounds", async () => {
    const factory = new IDBFactory();
    const databaseName = "assessment-upgrade-v6";
    await new Promise<void>((resolve, reject) => {
      const request = factory.open(databaseName, 6);
      request.onupgradeneeded = () => {
        const db = request.result;
        const applications = db.createObjectStore("applications", {
          keyPath: "id",
        });
        const interviews = db.createObjectStore("interviews", {
          keyPath: "id",
        });
        interviews.createIndex("applicationId", "applicationId");
        db.createObjectStore("settings", { keyPath: "key" });
        applications.put({
          ...application,
          status: "Offered",
          interviewRound: 2,
          interviewType: "online-assessment",
        });
        interviews.put(interview(2, "online-assessment"));
        interviews.put(interview(3));
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
    const adapter = createTestStorageAdapter({
      indexedDb: factory,
      databaseName,
    });
    const upgraded = await adapter.initialize();
    expect(upgraded.applications[0].status).toBe("Offered");
    expect(upgraded.interviews.map((item) => item.round)).toEqual([3]);
    expect(upgraded.assessments).toMatchObject([
      { id: "round-2", number: 1, originalInterviewRound: 2 },
    ]);
    expect(await adapter.initialize()).toEqual(upgraded);
  });
  const input = {
    applicationId: application.id,
    type: "coding" as const,
    progress: "not-started" as const,
    result: "pending" as const,
    proctored: "unknown" as const,
    platform: "Codility",
    link: "https://example.com/test",
    deadline: "2026-09-23T00:00:00.000Z",
  };

  it("persists create, independent numbering, edits, submission, results, and deletion", async () => {
    const adapter = createTestStorageAdapter();
    await adapter.initialize();
    await adapter.importSnapshot(
      snapshot({
        applications: [{ ...application, status: "Online Assessment" }],
      }),
    );
    const first = createAssessment(input, [], timestamp);
    const second = createAssessment(input, [first], timestamp);
    expect([first.number, second.number]).toEqual([1, 2]);
    await adapter.commitMutation({ assessments: [first, second] });
    const updated = updateAssessment(
      first,
      {
        ...submittedAssessmentUpdate(timestamp),
        result: "passed",
        score: "85/100",
        name: "Coding test",
      },
      timestamp,
    );
    await adapter.commitMutation({ assessments: [updated] });
    expect(
      (await adapter.listAssessments()).sort((a, b) => a.number - b.number),
    ).toEqual([updated, second]);
    expect((await adapter.getApplication(application.id))?.status).toBe(
      "Online Assessment",
    );
    await adapter.commitMutation({ deleteAssessmentIds: [first.id] });
    expect(await adapter.listAssessments()).toEqual([second]);
    await adapter.deleteApplication(application.id);
    expect(await adapter.listAssessments()).toEqual([]);
  });

  it("atomically moves a manual conversion and aborts without data loss if any write fails", async () => {
    const old = interview(2, "technical");
    let failWrites = false;
    const adapter = createTestStorageAdapter({
      beforeMutationWrite: (write) => {
        if (
          failWrites &&
          write.storeName === "interviews" &&
          write.action === "delete"
        )
          throw new Error("simulated failed conversion");
      },
    });
    await adapter.initialize();
    await adapter.importSnapshot(snapshot({ interviews: [old, interview(3)] }));
    const converted = assessmentFromInterview(old, 1);
    failWrites = true;
    await expect(
      adapter.commitMutation({
        assessments: [converted],
        deleteInterviewIds: [old.id],
      }),
    ).rejects.toThrow("simulated failed conversion");
    expect(await adapter.listInterviews()).toHaveLength(2);
    expect(await adapter.listAssessments()).toEqual([]);
    failWrites = false;
    await adapter.commitMutation({
      assessments: [converted],
      deleteInterviewIds: [old.id],
      applications: [{ ...application, stageMigrationVersion: 1 }],
    });
    expect(
      (await adapter.initialize()).interviews.map((item) => item.round),
    ).toEqual([3]);
    expect(await adapter.listAssessments()).toEqual([converted]);
  });

  it("migrates persisted legacy stages only once across repeated startups", async () => {
    const adapter = createTestStorageAdapter();
    await adapter.initialize();
    await adapter.importSnapshot(
      snapshot({
        applications: [
          {
            ...application,
            interviewRound: 2,
            interviewType: "online-assessment",
          },
        ],
        interviews: [
          interview(1),
          interview(2, "online-assessment"),
          interview(3),
        ],
      }),
    );
    const first = await adapter.initialize();
    expect(await adapter.initialize()).toEqual(first);
    expect((await adapter.exportSnapshot()).assessments).toMatchObject([
      { id: "round-2", originalInterviewRound: 2 },
    ]);
  });

  it.each([1, 2])(
    "imports v%s backups, migrates, exports, and imports v3 repeatedly without loss",
    async (schemaVersion) => {
      const data = snapshot({
        interviews: [
          interview(1),
          interview(2, "online-assessment"),
          interview(3),
        ],
      });
      const file = new File(
        [
          JSON.stringify({
            exportedAt: timestamp,
            schemaVersion,
            snapshot: data,
            resumeFiles: [],
          }),
        ],
        "old.json",
      );
      const imported = await parseBackupFile(file);
      expect(imported.snapshot.assessments).toHaveLength(1);
      expect(imported.snapshot.interviews.map((item) => item.round)).toEqual([
        1, 3,
      ]);
      expect((await parseBackupFile(file)).snapshot).toEqual(imported.snapshot);
      const blob = await createBackupFile({
        snapshot: imported.snapshot,
        resumeFiles: [],
      });
      const exported = new File([blob], "new.json");
      const restored = await parseBackupFile(exported);
      expect(restored.schemaVersion).toBe(3);
      expect(restored.snapshot).toEqual(imported.snapshot);
      expect((await parseBackupFile(exported)).snapshot).toEqual(
        restored.snapshot,
      );
    },
  );

  it("preserves modern Offered semantics in v2 backups", async () => {
    const file = new File(
      [
        JSON.stringify({
          schemaVersion: 2,
          exportedAt: timestamp,
          resumeFiles: [],
          snapshot: snapshot({
            applications: [{ ...application, status: "Offered" }],
          }),
        }),
      ],
      "offered.json",
    );
    expect((await parseBackupFile(file)).snapshot.applications[0].status).toBe(
      "Offered",
    );
  });

  it("round-trips every new assessment field without losing converted metadata", async () => {
    const assessment: Assessment = {
      ...assessmentFromInterview(interview(2, "online-assessment"), 1),
      ...input,
      name: "Aptitude",
      type: "numerical-reasoning",
      receivedAt: timestamp,
      timeLimitMinutes: 45,
      scheduledStart: "2026-09-22T12:00:00.000Z",
      proctored: "no",
      progress: "submitted",
      submittedAt: timestamp,
      result: "passed",
      score: "95%",
      notes: "Instructions",
    };
    const blob = await createBackupFile({
      snapshot: migrate(snapshot({ assessments: [assessment] })),
      resumeFiles: [],
    });
    const imported = await parseBackupFile(new File([blob], "new.json"));
    expect(imported.snapshot.assessments).toEqual([assessment]);
  });

  it.each([
    { number: 0 },
    { timeLimitMinutes: -10 },
    { progress: "invalid" },
    { result: "invalid" },
    { legacyInterview: { ...interview(2), id: "wrong" } },
  ])("rejects invalid assessment data %j", async (override) => {
    const assessment = {
      ...assessmentFromInterview(interview(2), 1),
      ...override,
    };
    const blob = await createBackupFile({
      snapshot: snapshot({ assessments: [assessment as Assessment] }),
      resumeFiles: [],
    });
    await expect(
      parseBackupFile(new File([blob], "invalid.json")),
    ).rejects.toThrow(/assessment/);
  });

  it("validates optional duration and date inputs without requiring optional fields", () => {
    expect(validateAssessment(input)).toBeUndefined();
    expect(validateAssessment({ timeLimitMinutes: -1 })).toMatch(/positive/);
    expect(validateAssessment({ deadline: "bad" })).toMatch(/valid date/);
  });
});
