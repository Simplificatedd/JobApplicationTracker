import { describe, expect, it } from "vitest";
import {
  assessmentFromInterview,
  assertEquivalentInterviewSource,
  migrateStageSnapshot,
} from "./assessments";
import { createBackupFile, parseBackupFile } from "./backups";
import { applyStorageMutation } from "../storage/cloudStorageAdapter";
import { interview, snapshot, now } from "../test/assessmentFixtures";

const source = { ...interview(2, "online-assessment"), dateTime: "2026-10-20T04:00:00.000Z" };

describe("semantic assessment source equivalence", () => {
  it.each(["dateTime", "deadline", "deadlineReceivedAt", "createdAt", "updatedAt"] as const)(
    "compares equivalent zoned %s timestamps without changing either record",
    (key) => {
      const preserved = { ...source, [key]: "2026-10-20T04:00:00.000Z" };
      for (const value of ["2026-10-20T12:00:00+08:00", "2026-10-20T04:00:00Z", "2026-10-20T04:00Z"]) {
        const original = { ...preserved, [key]: value };
        const before = structuredClone([original, preserved]);
        expect(() => assertEquivalentInterviewSource(original, preserved)).not.toThrow();
        expect([original, preserved]).toEqual(before);
      }
      expect(() => assertEquivalentInterviewSource(
        { ...preserved, [key]: "2026-10-20T04:00:01Z" }, preserved,
      )).toThrow(/different details/);
    },
  );

  it.each([
    [{ type: "technical" as const }, { type: "technical-interview" as const }],
    [{ type: "recruiter" as const }, { type: "recruiter-screen" as const }],
    [{ deadlineEntryMode: undefined }, { deadlineEntryMode: "exact" as const }],
    [{ deadlineEntryMode: "72_hours" as const }, { deadlineEntryMode: "3_days" as const }],
  ])("compares established aliases and defaults: %j / %j", (left, right) => {
    expect(() => assertEquivalentInterviewSource({ ...source, ...left }, { ...source, ...right })).not.toThrow();
  });

  it.each([
    { dateTime: "2026-10-20T04:00:01Z" },
    { dateTime: "2026-10-20T04:00" },
    { dateTime: "invalid" },
    { notes: "different notes" },
    { meetingUrl: "https://example.com/changed" },
    { type: "HackerRank" as const },
    { platform: "HireVue" },
    { mode: "onsite" as const },
    { round: 3 },
    { id: "different-id" },
    { applicationId: "another-application" },
    { extra: { dateTime: "2026-10-20T12:00:00+08:00" } },
  ])("still rejects distinct source information: %j", (changes) => {
    const preserved = { ...source, extra: { dateTime: source.dateTime } };
    expect(() => assertEquivalentInterviewSource({ ...preserved, ...changes }, preserved)).toThrow(/different details/);
  });

  it("does not normalize invalid calendar dates into valid dates", () => {
    expect(() => assertEquivalentInterviewSource(
      { ...source, dateTime: "2026-02-30T04:00:00Z" },
      { ...source, dateTime: "2026-03-02T04:00:00Z" },
    )).toThrow(/different details/);
  });

  it("deduplicates equivalent partial backups idempotently and preserves assessment edits", async () => {
    const converted = { ...assessmentFromInterview(source, 1), notes: "new assessment notes", result: "passed" as const };
    const data = snapshot({
      assessments: [converted],
      interviews: [{ ...source, dateTime: "2026-10-20T12:00:00+08:00" }],
    });
    const before = structuredClone(data);
    const migrated = migrateStageSnapshot(data, now);
    expect(migrated.interviews).toEqual([]);
    expect(migrated.assessments).toEqual([converted]);
    expect(migrateStageSnapshot(migrated, now)).toEqual(migrated);
    const blob = await createBackupFile({ snapshot: data, resumeFiles: [] });
    const imported = await parseBackupFile(new File([blob], "equivalent.json"));
    expect(imported.snapshot.interviews).toEqual([]);
    expect(imported.snapshot.assessments).toEqual([converted]);
    expect(data).toEqual(before);
  });

  it("preserves newer edits on a repeated conversion with equivalent source timestamps", () => {
    const converted = { ...assessmentFromInterview(source, 1), notes: "new assessment notes", result: "passed" as const };
    const current = snapshot({ assessments: [converted] });
    const retried = applyStorageMutation(current, {
      assessments: [assessmentFromInterview({ ...source, dateTime: "2026-10-20T12:00:00+08:00" }, 1)],
      deleteInterviewIds: [source.id],
    });
    expect(retried.assessments).toEqual([converted]);
    expect(current.assessments).toEqual([converted]);
  });
});
