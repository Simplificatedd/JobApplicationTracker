import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { IDBKeyRange } from "fake-indexeddb";
import { createTestStorageAdapter } from "../test/indexedDb";
import { application, interview, snapshot, timestamp } from "../test/assessmentFixtures";
import { createAssessment } from "../lib/assessments";
import { createCloudStorageAdapter } from "./cloudStorageAdapter";
import { RevisionApi } from "../test/revisionApi";

beforeAll(() => vi.stubGlobal("IDBKeyRange", IDBKeyRange));
afterAll(() => vi.unstubAllGlobals());

function client(api: RevisionApi) {
  const cache = createTestStorageAdapter();
  return { adapter: createCloudStorageAdapter({ api, cache }), cache };
}
async function pair(data = snapshot()) {
  const api = new RevisionApi(data);
  const a = client(api), b = client(api);
  const initial = await a.adapter.initialize();
  await b.adapter.initialize();
  return { api, a, b, original: initial.applications[0] };
}

describe("ordinary record edits under cloud revision conflicts", () => {
  it.each([true, false])("preserves independent fields in either order (company first: %s)", async (companyFirst) => {
    const { api, a, b, original } = await pair();
    const changes = companyFirst ? [{ company: "New company" }, { notes: "New notes" }] : [{ notes: "New notes" }, { company: "New company" }];
    await a.adapter.updateApplication({ ...original, ...changes[0] });
    await b.adapter.updateApplication({ ...original, ...changes[1] });
    expect(api.conflicts).toBe(1);
    expect(api.state.snapshot.applications[0]).toMatchObject({ company: "New company", notes: "New notes" });
    expect((await b.cache.exportSnapshot()).applications).toMatchObject(api.state.snapshot.applications);
  });

  it("rejects a genuine same-field conflict without changing the server", async () => {
    const { api, a, b, original } = await pair();
    await a.adapter.updateApplication({ ...original, company: "First edit" });
    const saved = structuredClone(api.state);
    await expect(b.adapter.updateApplication({ ...original, company: "Second edit" })).rejects.toThrow(/changed.*another session|conflict/i);
    expect(api.state).toEqual(saved);
  });

  it("does not recreate an application deleted by another session", async () => {
    const { api, a, b, original } = await pair();
    await a.adapter.deleteApplication(original.id);
    await expect(b.adapter.updateApplication({ ...original, notes: "Stale edit" })).rejects.toThrow(/removed|deleted/i);
    expect(api.state.snapshot.applications).toEqual([]);
    await expect(b.adapter.updateApplication({ ...original, notes: "Retry stale edit" })).rejects.toThrow(/removed|deleted/i);
    expect(api.state.snapshot.applications).toEqual([]);
  });

  it("detects deletion introduced during a retry rather than reviving the record", async () => {
    const { api, a, b, original } = await pair();
    await a.adapter.updateApplication({ ...original, company: "First edit" });
    let attempts = 0;
    api.beforeSave = () => {
      if (++attempts === 2) {
        api.state = { ...api.state, revision: api.state.revision + 1, snapshot: { ...api.state.snapshot, applications: [] } };
      }
    };
    await expect(b.adapter.updateApplication({ ...original, notes: "Stale edit" })).rejects.toThrow(/removed|deleted/i);
    expect(api.conflicts).toBe(2);
    expect(api.state.snapshot.applications).toEqual([]);
  });

  it("keeps changes to other records and supports a later valid operation after rejection", async () => {
    const other = { ...application, id: "other", company: "Other" };
    const { api, a, b, original } = await pair(snapshot({ applications: [application, other] }));
    await a.adapter.updateApplication({ ...original, company: "First edit" });
    await expect(b.adapter.updateApplication({ ...original, company: "Rejected edit" })).rejects.toThrow();
    await b.adapter.updateApplication({ ...other, notes: "Independent record" });
    expect(api.state.snapshot.applications).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: original.id, company: "First edit" }),
      expect.objectContaining({ id: other.id, notes: "Independent record" }),
    ]));
  });
});

const contact = {
  id: "contact", applicationId: application.id, name: "Recruiter", role: "Hiring",
  createdAt: timestamp, updatedAt: timestamp,
};
const resume = {
  id: "resume", displayName: "Resume", originalFileName: "resume.pdf", downloadFileName: "resume.pdf",
  fileExtension: "pdf" as const, mimeType: "application/pdf", fileSize: 5, storageKey: "resume-file",
  contentHash: "hash", uploadedAt: timestamp, updatedAt: timestamp,
};

describe("aggregate mutation intent and derived state", () => {
  it("keeps concurrent status and archive actions without reverting either", async () => {
    const { api, a, b, original } = await pair();
    await a.adapter.updateApplication({ ...original, status: "Accepted" });
    await b.adapter.archiveApplication({ ...original, archivedAt: "2026-10-23T00:00:00.000Z" });
    expect(api.state.snapshot.applications[0]).toMatchObject({ status: "Accepted", archivedAt: "2026-10-23T00:00:00.000Z" });
  });

  it("accepts identical same-field intent as an idempotent result", async () => {
    const { api, a, b, original } = await pair();
    await a.adapter.updateApplication({ ...original, notes: "Same edit" });
    await b.adapter.updateApplication({ ...original, notes: "Same edit" });
    expect(api.state.snapshot.applications[0].notes).toBe("Same edit");
  });

  it("clears an optional field without discarding another session's edit", async () => {
    const { api, a, b, original } = await pair(snapshot({ applications: [{ ...application, notes: "Old notes" }] }));
    await a.adapter.updateApplication({ ...original, company: "New company" });
    await b.adapter.updateApplication({ ...original, notes: undefined });
    expect(api.state.snapshot.applications[0]).toMatchObject({ company: "New company" });
    expect(api.state.snapshot.applications[0].notes).toBeUndefined();
  });

  it("merges concurrent child creation and derives contact counts from the committed records", async () => {
    const { api, a, b } = await pair();
    await a.adapter.createContact(contact);
    await b.adapter.createContact({ ...contact, id: "second", name: "Other recruiter" });
    expect(api.state.snapshot.contacts).toHaveLength(2);
    expect(api.state.snapshot.applications[0].contactsCount).toBe(2);
  });

  it("merges contact fields and rejects editing a deleted contact", async () => {
    const { api, a, b } = await pair(snapshot({ contacts: [contact] }));
    await a.adapter.updateContact({ ...contact, name: "Updated name" });
    await b.adapter.updateContact({ ...contact, role: "Updated role" });
    expect(api.state.snapshot.contacts[0]).toMatchObject({ name: "Updated name", role: "Updated role" });
    const c = client(api); await c.adapter.initialize();
    await b.adapter.deleteContact(contact.id);
    await expect(c.adapter.updateContact({ ...api.state.snapshot.contacts[0], ...contact, notes: "Stale" })).rejects.toThrow(/removed/);
    expect(api.state.snapshot.contacts).toEqual([]);
  });

  it("rejects child creation after the parent was deleted, without orphan records", async () => {
    const { api, a, b, original } = await pair();
    await a.adapter.deleteApplication(original.id);
    await expect(b.adapter.createContact(contact)).rejects.toThrow(/application.*removed/);
    expect(api.state.snapshot.contacts).toEqual([]);
  });

  it("preserves metadata changes while another session marks a document used", async () => {
    const { api, a, b } = await pair(snapshot({ resumes: [resume] }));
    await a.adapter.updateResumeMetadata({ ...resume, notes: "New metadata" });
    await b.adapter.updateResumeMetadata({ ...resume, lastUsedAt: "2026-10-23T00:00:00.000Z" });
    expect(api.state.snapshot.resumes[0]).toMatchObject({ notes: "New metadata", lastUsedAt: "2026-10-23T00:00:00.000Z" });
  });

  it("does not resurrect deleted document metadata or link a removed document", async () => {
    const { api, a, b, original } = await pair(snapshot({ resumes: [resume] }));
    await a.adapter.deleteResumeMetadata(resume.id);
    await expect(b.adapter.updateResumeMetadata({ ...resume, notes: "Stale" })).rejects.toThrow(/removed/);
    await expect(b.adapter.updateApplication({ ...original, resumeId: resume.id })).rejects.toThrow(/resume.*removed/);
    expect(api.state.snapshot.resumes).toEqual([]);
  });

  it("unlinks every current reference on document deletion and preserves a concurrent replacement", async () => {
    const next = { ...resume, id: "replacement", storageKey: "new-file" };
    const other = { ...application, id: "other", resumeId: resume.id };
    const { api, a, b, original } = await pair(snapshot({ applications: [{ ...application, resumeId: resume.id }, other], resumes: [resume, next] }));
    await a.adapter.updateApplication({ ...original, resumeId: next.id });
    await b.adapter.commitMutation({
      applications: [{ ...original, resumeId: undefined }], deleteResumeIds: [resume.id],
    });
    expect(api.state.snapshot.applications.find((item) => item.id === original.id)?.resumeId).toBe(next.id);
    expect(api.state.snapshot.applications.find((item) => item.id === other.id)?.resumeId).toBeUndefined();
  });

  it("requires explicit creation and rejects a duplicate creation ID", async () => {
    const { api, b } = await pair();
    const added = { ...application, id: "new" };
    await expect(b.adapter.commitMutation({ applications: [added] })).rejects.toThrow(/not loaded/);
    await b.adapter.createApplication(added);
    await expect(b.adapter.createApplication({ ...added, company: "Collision" })).rejects.toThrow(/already exists/);
    expect(api.state.snapshot.applications.find((item) => item.id === "new")?.company).toBe(added.company);
  });

  it("uses an editor baseline even if this adapter already received newer data", async () => {
    const { api, b, original } = await pair();
    await b.adapter.updateApplication({ ...original, company: "Newer local value" });
    await expect(b.adapter.commitMutation({
      applications: [{ ...original, company: "Stale draft" }], expected: { applications: [original] },
    })).rejects.toThrow(/changed.*another session/);
    expect(api.state.snapshot.applications[0].company).toBe("Newer local value");
  });

  it("preserves independent updates to different records across multiple sessions", async () => {
    const second = { ...application, id: "second" }, third = { ...application, id: "third" };
    const { api, a, b, original } = await pair(snapshot({ applications: [application, second, third] }));
    const c = client(api); await c.adapter.initialize();
    await Promise.all([
      a.adapter.updateApplication({ ...original, notes: "A" }),
      b.adapter.updateApplication({ ...second, notes: "B" }),
      c.adapter.updateApplication({ ...third, notes: "C" }),
    ]);
    expect(api.state.snapshot.applications.map((item) => item.notes)).toEqual(["A", "B", "C"]);
    expect((await client(api).adapter.initialize()).applications).toMatchObject(api.state.snapshot.applications);
  });

  it("merges independent interview fields, rejects overlaps and recomputes the application projection", async () => {
    const source = interview(1);
    const { api, a, b } = await pair(snapshot({ interviews: [source] }));
    await a.adapter.saveInterview({ ...source, location: "Office A" });
    await b.adapter.saveInterview({ ...source, dateTime: "2026-11-01T10:00:00.000Z" });
    expect(api.state.snapshot.interviews[0]).toMatchObject({ location: "Office A", dateTime: "2026-11-01T10:00:00.000Z" });
    expect(api.state.snapshot.applications[0]).toMatchObject({ interviewLocation: "Office A", interviewDateTime: "2026-11-01T10:00:00.000Z" });
    const c = client(api); await c.adapter.initialize();
    const latest = api.state.snapshot.interviews[0];
    await b.adapter.saveInterview({ ...latest, location: "Office B" });
    await expect(c.adapter.saveInterview({ ...latest, location: "Office C" })).rejects.toThrow(/location changed/);
    await b.adapter.deleteInterview(source.id);
    await expect(c.adapter.saveInterview({ ...latest, notes: "Stale" })).rejects.toThrow(/removed/);
    await expect(c.adapter.saveInterview({ ...latest, notes: "Retry stale" })).rejects.toThrow(/removed/);
    expect(api.state.snapshot.interviews).toEqual([]);
  });

  it("rejects concurrent contact deletion rather than losing another editor's changes", async () => {
    const { api, a, b } = await pair(snapshot({ contacts: [contact] }));
    await a.adapter.updateContact({ ...contact, notes: "New notes" });
    const saved = structuredClone(api.state);
    await expect(b.adapter.deleteContact(contact.id)).rejects.toThrow(/changed.*before deletion/);
    expect(api.state).toEqual(saved);
  });

  it("drops unchanged assessment patch fields and rejects genuine assessment conflicts", async () => {
    const record = createAssessment({ applicationId: application.id, type: "coding", proctored: "unknown", progress: "not-started", result: "pending", notes: "Original" }, [], timestamp);
    const { api, a, b } = await pair(snapshot({ assessments: [record] }));
    const newer = "2026-10-23T00:00:00.000Z";
    await a.adapter.commitMutation({ assessmentUpdates: [{ id: record.id, changes: { notes: "New notes" }, updatedAt: newer }] });
    await b.adapter.commitMutation({ assessmentUpdates: [{ id: record.id, changes: { notes: "Original", score: "95%" }, updatedAt: timestamp }] });
    expect(api.state.snapshot.assessments![0]).toMatchObject({ notes: "New notes", score: "95%", updatedAt: newer });
    const c = client(api); await c.adapter.initialize();
    await b.adapter.commitMutation({ assessmentUpdates: [{ id: record.id, changes: { score: "100%" }, updatedAt: timestamp }] });
    const saved = structuredClone(api.state);
    await expect(c.adapter.commitMutation({ assessmentUpdates: [{ id: record.id, changes: { score: "80%" }, updatedAt: timestamp }] })).rejects.toThrow(/score changed/);
    expect(api.state).toEqual(saved);
  });

  it("does not reinterpret a stale full assessment as a creation after a rejected retry", async () => {
    const record = createAssessment({ applicationId: application.id, type: "coding", proctored: "unknown", progress: "not-started", result: "pending" }, [], timestamp);
    const { api, a, b } = await pair(snapshot({ assessments: [record] }));
    await a.adapter.commitMutation({ deleteAssessmentIds: [record.id] });
    await expect(b.adapter.commitMutation({ assessments: [{ ...record, notes: "Stale" }] })).rejects.toThrow(/removed/);
    await expect(b.adapter.commitMutation({ assessments: [{ ...record, notes: "Retry stale" }] })).rejects.toThrow(/removed|not loaded/);
    expect(api.state.snapshot.assessments).toEqual([]);
  });
});
