import { describe, expect, it } from "vitest";
import type { Application, Interview } from "../types/application";
import {
  assertEquivalentInterviewSource,
  assessmentFromInterview,
  migrateStageSnapshot,
} from "./assessments";
import { createBackupFile, parseBackupFile } from "./backups";
import { applyStorageMutation } from "../storage/cloudStorageAdapter";
import { createTestStorageAdapter } from "../test/indexedDb";
import { application, interview, snapshot, now } from "../test/assessmentFixtures";

const source = interview(2, "online-assessment");
const legacyApplication = {
  ...application, interviewRound: source.round, interviewType: source.type,
  deadline: "2026-10-20T04:00:00.000Z",
};
const migrate = (data: ReturnType<typeof snapshot>) => migrateStageSnapshot(data, now);

describe("migration-enriched assessment source equivalence", () => {
  it.each([undefined, "3_days" as const])(
    "deduplicates the original and deadline-enriched sources with entry mode %s",
    async (deadlineEntryMode) => {
      const migrated = migrate(snapshot({
        applications: [{ ...legacyApplication, deadlineEntryMode }], interviews: [source],
      }));
      const partial = { ...migrated, interviews: [source] };
      const before = structuredClone(partial);
      expect(migrated.assessments![0].legacyInterview!.deadline).toBe(legacyApplication.deadline);
      expect(migrate(partial)).toEqual(migrated);
      expect(migrate(migrate(partial))).toEqual(migrated);
      const blob = await createBackupFile({ snapshot: partial, resumeFiles: [] });
      const imported = await parseBackupFile(new File([blob], "enriched.json"));
      expect(imported.snapshot.interviews).toEqual([]);
      expect(imported.snapshot.assessments).toEqual(migrated.assessments);
      expect(partial).toEqual(before);
      expect(() => assertEquivalentInterviewSource(source, migrated.assessments![0].legacyInterview)).toThrow(/different details/);
    },
  );

  it("accepts enrichment when a retained legacy projection establishes ownership among stages", () => {
    const converted = migrate(snapshot({ applications: [legacyApplication], interviews: [source] })).assessments!;
    const partial = snapshot({ applications: [legacyApplication], assessments: converted, interviews: [source, interview(3)] });
    expect(migrate(partial).interviews.map((item) => item.id)).toEqual(["round-3"]);
    expect(migrate(partial).assessments).toEqual(converted);
  });

  it.each([
    { deadline: undefined },
    { deadline: "2026-10-21T04:00:00.000Z" },
    { interviewDeadline: "2026-10-20T04:00:00.000Z" },
    { deadlineEntryMode: "1_day" as const },
    { interviewRound: 3 },
  ])("rejects missing or conflicting application context: %j", (changes) => {
    const migrated = migrate(snapshot({
      applications: [{ ...legacyApplication, deadlineEntryMode: "3_days" }], interviews: [source],
    }));
    const changed: Application = { ...migrated.applications[0], ...changes };
    // A sole stage still owns the fallback despite a stale round projection.
    const others = changes.interviewRound ? [interview(3)] : [];
    expect(() => migrate({ ...migrated, applications: [changed], interviews: [source, ...others] })).toThrow(/different details/);
  });

  it.each([
    { notes: "changed notes" },
    { deadline: "2026-10-21T04:00:00.000Z" },
    { deadlineEntryMode: "1_day" as const },
    { deadlineReceivedAt: "2026-09-21T00:00:00.000Z" },
    { meetingUrl: "https://example.com/changed" },
    { type: "HackerRank" as const },
    { round: 3 },
    { extra: { nested: "new metadata" } },
  ])("rejects divergent sources before replacing persisted data: %j", async (changes) => {
    const migrated = migrate(snapshot({
      applications: [{ ...legacyApplication, deadlineEntryMode: "3_days" }], interviews: [source],
    }));
    const partial = { ...migrated, interviews: [{ ...source, ...changes }] };
    const before = structuredClone(partial);
    const adapter = createTestStorageAdapter();
    await adapter.initialize();
    const persisted = await adapter.exportSnapshot();
    expect(() => migrate(partial)).toThrow(/different details/);
    const blob = await createBackupFile({ snapshot: partial, resumeFiles: [] });
    await expect(parseBackupFile(new File([blob], "divergent.json"))).rejects.toThrow(/different details/);
    expect(partial).toEqual(before);
    expect(await adapter.exportSnapshot()).toEqual(persisted);
  });

  it("rejects ambiguous ownership including other preserved assessment sources", () => {
    const migrated = migrate(snapshot({ applications: [legacyApplication], interviews: [source] }));
    expect(() => migrate({ ...migrated, interviews: [source, interview(3)] })).toThrow(/different details/);
    const other = assessmentFromInterview(interview(3, "online-assessment"), 2);
    expect(() => migrate({ ...migrated, assessments: [...migrated.assessments!, other], interviews: [source] })).toThrow(/different details/);
  });

  it("never lets migration enrichment hide a live edit or stale conversion", () => {
    const migrated = migrate(snapshot({ applications: [legacyApplication], interviews: [source] }));
    expect(() => applyStorageMutation(migrated, { interviews: [source] })).toThrow(/different details/);
    expect(() => applyStorageMutation(migrated, {
      assessments: [assessmentFromInterview(source, 1)], deleteInterviewIds: [source.id],
    })).toThrow(/different details/);
  });

  it("never overwrites explicitly entered scheduling fields while replaying the legacy rule", () => {
    const migrated = migrate(snapshot({
      applications: [{ ...legacyApplication, deadlineEntryMode: "3_days", interviewDeadlineReceivedAt: application.createdAt }],
      interviews: [source],
    }));
    const changed: Interview = { ...source, deadlineEntryMode: "1_day", deadlineReceivedAt: "2026-10-01T00:00:00.000Z" };
    expect(() => migrate({ ...migrated, interviews: [changed] })).toThrow(/different details/);
  });
});
