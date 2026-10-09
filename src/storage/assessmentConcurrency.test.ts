import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { IDBKeyRange } from "fake-indexeddb";
import type { Assessment, Interview } from "../types/application";
import type { StorageSnapshot } from "./StorageAdapter";
import { createTestStorageAdapter } from "../test/indexedDb";
import { application, interview, snapshot, timestamp, now } from "../test/assessmentFixtures";
import { createCloudStorageAdapter } from "./cloudStorageAdapter";
import { CloudRevisionConflictError, type CloudApiClient, type CloudStateEnvelope } from "./cloudApi";
import { assessmentFromInterview, createAssessment, migrateStageSnapshot, submittedAssessmentUpdate } from "../lib/assessments";
import { buildInterviewRecord, updateInterviewRecord } from "../lib/interviews";
import { createInterviewQuickEdit } from "../features/applications/applicationQuickEdits";
import { assessmentDraftToUpdate } from "../features/applications/AssessmentsSection";
import { deriveApplicationNotifications } from "../lib/reminders";
import { createBackupFile, parseBackupFile } from "../lib/backups";

beforeAll(() => vi.stubGlobal("IDBKeyRange", IDBKeyRange));
afterAll(() => vi.unstubAllGlobals());

// Separate adapters retain separate revisions; all saves share the same server state.
class RevisionApi implements CloudApiClient {
  state: CloudStateEnvelope;
  conflicts = 0;
  files = new Map<string, Blob>();
  constructor(data: StorageSnapshot) {
    this.state = { revision: 1, snapshot: structuredClone(data), updatedAt: timestamp };
  }
  async getSession() { return { email: "test@example.edu" }; }
  async getState() { return structuredClone(this.state); }
  async saveState(data: StorageSnapshot, revision: number | null) {
    if (revision !== this.state.revision) {
      this.conflicts += 1;
      throw new CloudRevisionConflictError(structuredClone(this.state));
    }
    this.state = { snapshot: structuredClone(data), revision: revision + 1, updatedAt: timestamp };
    return structuredClone(this.state);
  }
  async putResumeFile(key: string, file: Blob) { this.files.set(key, file); }
  async getResumeFile(key: string) {
    const file = this.files.get(key);
    if (!file) throw new Error("Missing file");
    return file;
  }
  async deleteResumeFile(key: string) { this.files.delete(key); }
}

function client(api: RevisionApi) {
  return createCloudStorageAdapter({ api, cache: createTestStorageAdapter() });
}

const pending = () => createAssessment({
  applicationId: application.id,
  type: "coding", proctored: "unknown", progress: "not-started", result: "pending",
  deadline: "2026-10-20T12:00:00.000Z", notes: "original notes",
}, [], timestamp);

describe("legacy classification through scheduling edits", () => {
  it.each([
    ["HackerRank", "HackerRank"], ["HireVue", "HireVue"],
    ["technical", "technical-interview"], ["technical-interview", "technical-interview"],
    ["other", "other"], ["face-to-face", "other"], ["recruiter", "recruiter-screen"],
  ] as const)("keeps %s as an interview after table scheduling, save, repeated normalization and reload", async (type, expected) => {
    const source = { ...interview(2, type), notes: "retain notes", extraHistoricalField: "retain metadata" };
    const api = new RevisionApi(snapshot({ interviews: [source] }));
    const adapter = client(api);
    const loaded = await adapter.initialize();
    const app = loaded.applications[0];
    const changed = { ...app, ...createInterviewQuickEdit(app, "2026-10-21T10:00:00.000Z"), updatedAt: timestamp };
    const updated = buildInterviewRecord(changed, loaded.interviews, timestamp, source.id)!;
    expect(updated.type).toBe(expected);
    await adapter.commitMutation({ applications: [changed], interviews: [updated] });
    // An unrelated mutation exercises normalization again, not just startup twice.
    await adapter.commitMutation({ applications: [{ ...(await adapter.getApplication(app.id))!, notes: "new application notes" }] });
    for (let pass = 0; pass < 2; pass += 1) {
      const restored = await client(api).initialize();
      expect(restored.assessments).toEqual([]);
      expect(restored.interviews).toMatchObject([{
        id: source.id, round: 2, type: expected, dateTime: changed.interviewDateTime,
        notes: source.notes, extraHistoricalField: source.extraHistoricalField,
      }]);
    }
  });

  it("still migrates explicit assessments and manually converts provider interviews", async () => {
    const source = interview(3, "HackerRank");
    const api = new RevisionApi(snapshot({ interviews: [interview(1), interview(2, "online-assessment"), source] }));
    const adapter = client(api);
    const loaded = await adapter.initialize();
    expect(loaded.interviews.map((item) => item.round)).toEqual([1, 3]);
    expect(loaded.assessments).toMatchObject([{ id: "round-2", number: 1, originalInterviewRound: 2 }]);
    const canonical = loaded.interviews.find((item) => item.id === source.id)!;
    await adapter.commitMutation({ assessments: [assessmentFromInterview(canonical, 2)], deleteInterviewIds: [source.id] });
    const restored = await client(api).initialize();
    expect(restored.interviews.map((item) => item.round)).toEqual([1]);
    expect(restored.assessments).toMatchObject([
      { id: "round-2", number: 1 },
      { id: source.id, number: 2, originalInterviewRound: 3, legacyInterview: { type: "HackerRank" } },
    ]);
    expect(restored.applications[0].status).toBe("Interviewing");
  });
});

describe("assessment field updates under real cloud revision conflicts", () => {
  it.each([true, false])("merges submission and deadline edits in either order (submission first: %s)", async (submissionFirst) => {
    const record = pending();
    const api = new RevisionApi(snapshot({ assessments: [record] }));
    const a = client(api), b = client(api);
    await a.initialize(); await b.initialize();
    const submittedAt = "2026-10-09T01:00:00.000Z";
    const deadline = "2026-10-22T12:00:00.000Z";
    const updates = submissionFirst
      ? [submittedAssessmentUpdate(submittedAt), { deadline }]
      : [{ deadline }, submittedAssessmentUpdate(submittedAt)];
    await a.commitMutation({ assessmentUpdates: [{ id: record.id, changes: updates[0], updatedAt: submittedAt }] });
    await b.commitMutation({ assessmentUpdates: [{ id: record.id, changes: updates[1], updatedAt: submittedAt }] });
    expect(api.conflicts).toBe(1);
    const restored = await client(api).initialize();
    expect(restored.assessments).toMatchObject([{ id: record.id, number: 1, progress: "submitted", submittedAt, deadline }]);
    expect(deriveApplicationNotifications(restored.applications[0], restored.settings, now, [], restored.assessments)).toEqual([]);
  });

  it("keeps result, score, notes and application metadata while a stale editor changes only its deadline", async () => {
    const record = pending();
    const api = new RevisionApi(snapshot({ assessments: [record] }));
    const a = client(api), b = client(api);
    const loaded = await a.initialize(); await b.initialize();
    await a.commitMutation({
      assessmentUpdates: [{ id: record.id, changes: { result: "passed", score: "95%", notes: "new notes" }, updatedAt: timestamp }],
      // Simulate a separate application change in the other session.
    });
    await a.commitMutation({ applications: [{ ...loaded.applications[0], status: "Accepted", company: "Updated elsewhere" }] });
    const draft = { ...record, deadline: "2026-10-22T12:00" };
    const changes = assessmentDraftToUpdate(draft, record);
    expect(Object.keys(changes)).toEqual(["deadline"]);
    await b.commitMutation({ assessmentUpdates: [{ id: record.id, changes, updatedAt: timestamp }], applications: [loaded.applications[0]] });
    expect(api.conflicts).toBe(1);
    expect(api.state.snapshot.assessments).toMatchObject([{ result: "passed", score: "95%", notes: "new notes", deadline: new Date(draft.deadline).toISOString() }]);
    expect(api.state.snapshot.applications[0]).toMatchObject({ status: "Accepted", company: "Updated elsewhere" });
  });

  it("preserves an independent deadline edit while clearing notes deliberately", async () => {
    const record = pending();
    const api = new RevisionApi(snapshot({ assessments: [record] }));
    const a = client(api), b = client(api);
    await a.initialize(); await b.initialize();
    await a.commitMutation({ assessmentUpdates: [{ id: record.id, changes: { deadline: "2026-10-23T12:00:00.000Z" }, updatedAt: timestamp }] });
    await b.commitMutation({ assessmentUpdates: [{ id: record.id, changes: { notes: undefined }, updatedAt: timestamp }] });
    expect(api.state.snapshot.assessments![0]).toMatchObject({ deadline: "2026-10-23T12:00:00.000Z" });
    expect(api.state.snapshot.assessments![0].notes).toBeUndefined();
  });

  it("does not turn unchanged imported whitespace into edits of unrelated fields", () => {
    const record = { ...pending(), notes: " original notes\n", platform: " HackerRank " };
    const changes = assessmentDraftToUpdate({ ...record, deadline: "2026-10-22T12:00" }, record);
    expect(changes).toEqual({ deadline: new Date("2026-10-22T12:00").toISOString() });
    expect(assessmentDraftToUpdate({ ...record, notes: "" }, record)).toEqual({ notes: undefined });
  });

  it("rejects an edit after concurrent deletion without resurrecting the assessment", async () => {
    const record = pending();
    const api = new RevisionApi(snapshot({ assessments: [record] }));
    const a = client(api), b = client(api);
    await a.initialize(); await b.initialize();
    await a.commitMutation({ deleteAssessmentIds: [record.id] });
    const revision = api.state.revision;
    await expect(b.commitMutation({ assessmentUpdates: [{ id: record.id, changes: { notes: "stale edit" }, updatedAt: timestamp }] })).rejects.toThrow(/removed/);
    expect(api.state.revision).toBe(revision);
    expect(api.state.snapshot.assessments).toEqual([]);
  });
});

describe("conversion source conflicts", () => {
  const source: Interview = { ...interview(2), notes: "original notes" };
  it("rejects a source edit after concurrent conversion and keeps the server snapshot unchanged", async () => {
    const api = new RevisionApi(snapshot({ interviews: [source] }));
    const a = client(api), b = client(api);
    const loaded = await a.initialize(); await b.initialize();
    await a.commitMutation({ assessments: [assessmentFromInterview(source, 1)], deleteInterviewIds: [source.id] });
    const converted = structuredClone(api.state);
    await expect(b.commitMutation({
      interviews: [updateInterviewRecord(source, { notes: "new notes" }, timestamp)],
      applications: [loaded.applications[0]],
      activities: [{ id: "failed-edit", applicationId: application.id, type: "updated", message: "Updated interview.", createdAt: timestamp }],
    })).rejects.toThrow(/different details.*No changes were saved/);
    expect(api.conflicts).toBe(1);
    expect(api.state).toEqual(converted);
    expect(await client(api).initialize()).toEqual(converted.snapshot);
  });

  it("rejects a stale conversion after the source was edited in another session", async () => {
    const api = new RevisionApi(snapshot({ interviews: [source] }));
    const a = client(api), b = client(api);
    await a.initialize(); await b.initialize();
    await a.commitMutation({ interviews: [updateInterviewRecord(source, { notes: "new notes" }, timestamp)] });
    const edited = structuredClone(api.state);
    await expect(b.commitMutation({ assessments: [assessmentFromInterview(source, 1)], deleteInterviewIds: [source.id] })).rejects.toThrow(/different details/);
    expect(api.state).toEqual(edited);
    expect(api.state.snapshot.interviews[0].notes).toBe("new notes");
  });

  it("keeps newer assessment edits when an equivalent conversion is retried", async () => {
    const api = new RevisionApi(snapshot({ interviews: [source] }));
    const a = client(api), b = client(api);
    await a.initialize(); await b.initialize();
    const mutation = { assessments: [assessmentFromInterview(source, 1)], deleteInterviewIds: [source.id] };
    await a.commitMutation(mutation);
    await a.commitMutation({ assessmentUpdates: [{ id: source.id, changes: { ...submittedAssessmentUpdate(timestamp), notes: "assessment notes", result: "passed" }, updatedAt: timestamp }] });
    await b.commitMutation(mutation);
    const restored = await client(api).initialize();
    expect(restored.interviews).toEqual([]);
    expect(restored.assessments).toHaveLength(1);
    expect(restored.assessments![0]).toMatchObject({ number: 1, progress: "submitted", submittedAt: timestamp, notes: "assessment notes", result: "passed" });
    expect(migrateStageSnapshot(restored, now)).toEqual(restored);
  });

  it("rejects conversion after concurrent source deletion", async () => {
    const api = new RevisionApi(snapshot({ interviews: [source] }));
    const a = client(api), b = client(api);
    await a.initialize(); await b.initialize();
    await a.commitMutation({ deleteInterviewIds: [source.id] });
    await expect(b.commitMutation({ assessments: [assessmentFromInterview(source, 1)], deleteInterviewIds: [source.id] })).rejects.toThrow(/removed/);
    expect(api.state.snapshot.interviews).toEqual([]);
    expect(api.state.snapshot.assessments).toEqual([]);
  });

  it("deduplicates equivalent backup sources regardless of JSON key order", async () => {
    const legacy = { ...source, extra: { a: "keep", b: "also keep" }, platform: undefined };
    const reordered = { ...legacy, extra: { b: "also keep", a: "keep" } };
    const converted = { ...assessmentFromInterview(legacy, 1), progress: "submitted" as const, result: "passed" as const };
    const blob = await createBackupFile({ snapshot: snapshot({ assessments: [converted], interviews: [reordered] }), resumeFiles: [] });
    const imported = await parseBackupFile(new File([blob], "equivalent.json"));
    expect(imported.snapshot.interviews).toEqual([]);
    expect(imported.snapshot.assessments).toEqual(JSON.parse(JSON.stringify([converted])));
    expect(migrateStageSnapshot(imported.snapshot, now)).toEqual(imported.snapshot);
  });

  it.each([
    { notes: "new notes" },
    { deadline: "2026-10-23T12:00:00.000Z" },
    { extraHistoricalField: "new information" },
  ])("rejects a divergent partial backup before replacing persisted data: %j", async (difference) => {
    const data = snapshot({ assessments: [assessmentFromInterview(source, 1)], interviews: [{ ...source, ...difference }] });
    const unchanged = structuredClone(data);
    const adapter = createTestStorageAdapter();
    await adapter.initialize();
    const existing = await adapter.exportSnapshot();
    const blob = await createBackupFile({ snapshot: data, resumeFiles: [] });
    await expect(parseBackupFile(new File([blob], "divergent.json"))).rejects.toThrow(/different details/);
    expect(() => migrateStageSnapshot(data, now)).toThrow(/different details/);
    expect(data).toEqual(unchanged);
    expect(await adapter.exportSnapshot()).toEqual(existing);
  });
});

describe("IndexedDB assessment patches", () => {
  it("applies independent patches atomically and rolls back the aggregate if a target is missing", async () => {
    const record: Assessment = pending();
    const adapter = createTestStorageAdapter();
    await adapter.initialize();
    await adapter.importSnapshot(snapshot({ assessments: [record] }));
    await adapter.commitMutation({ assessmentUpdates: [
      { id: record.id, changes: submittedAssessmentUpdate(timestamp), updatedAt: timestamp },
      { id: record.id, changes: { notes: undefined, deadline: "2026-10-24T12:00:00.000Z" }, updatedAt: timestamp },
    ] });
    expect(await adapter.listAssessments()).toMatchObject([{ id: record.id, number: 1, progress: "submitted", submittedAt: timestamp, deadline: "2026-10-24T12:00:00.000Z" }]);
    expect((await adapter.listAssessments())[0].notes).toBeUndefined();
    const saved = await adapter.exportSnapshot();
    await expect(adapter.commitMutation({ applications: [{ ...application, company: "should not save" }], assessmentUpdates: [
      { id: record.id, changes: { notes: "should not save" }, updatedAt: timestamp },
      { id: "missing", changes: { progress: "cancelled" }, updatedAt: timestamp },
    ] })).rejects.toThrow(/removed/);
    expect(await adapter.exportSnapshot()).toEqual(saved);
  });
});
