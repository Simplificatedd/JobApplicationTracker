import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { IDBKeyRange } from "fake-indexeddb";
import { application, snapshot, timestamp } from "../test/assessmentFixtures";
import { createTestStorageAdapter } from "../test/indexedDb";
import { RevisionApi } from "../test/revisionApi";
import { createCloudStorageAdapter } from "./cloudStorageAdapter";


beforeAll(() => vi.stubGlobal("IDBKeyRange", IDBKeyRange));
afterAll(() => vi.unstubAllGlobals());
const recreatedAt = "2026-10-23T00:00:00.000Z";
function client(api: RevisionApi) {
  return createCloudStorageAdapter({ api, cache: createTestStorageAdapter() });
}
async function sessions(data = snapshot()) {
  const api = new RevisionApi(data);
  const a = client(api), b = client(api), c = client(api);
  const initial = await a.initialize();
  await b.initialize(); await c.initialize();
  return { api, a, b, c, original: initial.applications[0] };
}

describe("adversarial mutation ordering", () => {
  it.each([
    [0, 1, 2], [0, 2, 1], [1, 0, 2],
    [1, 2, 0], [2, 0, 1], [2, 1, 0],
  ])("retains three independent edits in order %i/%i/%i", async (...order) => {
    const { api, a, b, c, original } = await sessions();
    const adapters = [a, b, c];
    const changes = [{ company: "New company" }, { notes: "New notes" }, { location: "New location" }];
    for (const index of order) await adapters[index].updateApplication({ ...original, ...changes[index] });
    expect(api.state.snapshot.applications[0]).toMatchObject(Object.assign({}, ...changes));
    expect(api.conflicts).toBe(2);
  });

  it("rechecks intent against each progressively newer conflict response", async () => {
    const { api, b, original } = await sessions();
    let attempts = 0;
    api.beforeSave = () => {
      if (++attempts <= 2) {
        api.state = { ...api.state, revision: api.state.revision + 1, snapshot: {
          ...api.state.snapshot, applications: [{ ...api.state.snapshot.applications[0],
            ...(attempts === 1 ? { company: "Remote company" } : { location: "Remote location" }),
          }],
        } };
      }
    };
    await b.updateApplication({ ...original, notes: "Local notes" });
    expect(api.conflicts).toBe(2);
    expect(api.state.snapshot.applications[0]).toMatchObject({ company: "Remote company", location: "Remote location", notes: "Local notes" });
  });

  it("rejects an overlap introduced only during the second conflict retry", async () => {
    const { api, b, original } = await sessions();
    let attempts = 0;
    api.beforeSave = () => {
      if (++attempts <= 2) {
        api.state = { ...api.state, revision: api.state.revision + 1, snapshot: {
          ...api.state.snapshot, applications: [{ ...original,
            ...(attempts === 1 ? { company: "Remote company" } : { notes: "Remote notes" }),
          }],
        } };
      }
    };
    await expect(b.updateApplication({ ...original, notes: "Local notes" })).rejects.toThrow(/notes changed/);
    expect(api.conflicts).toBe(2);
    expect(api.state.snapshot.applications[0].notes).toBe("Remote notes");
  });

  it("rejects an old edit when its ID belongs to a recreated application", async () => {
    const { api, a, b, original } = await sessions();
    await a.deleteApplication(original.id);
    await a.createApplication({ ...original, createdAt: recreatedAt, company: "Recreated" });
    const saved = structuredClone(api.state);
    await expect(b.updateApplication({ ...original, notes: "Old draft" })).rejects.toThrow(/replaced|recreated/);
    expect(api.state).toEqual(saved);
  });

  it("does not attach a stale new child to a recreated parent with the same ID", async () => {
    const { api, a, b, original } = await sessions();
    await a.deleteApplication(original.id);
    await a.createApplication({ ...original, createdAt: recreatedAt });
    await expect(b.createContact({ id: "stale-child", applicationId: original.id, name: "Recruiter", createdAt: timestamp, updatedAt: timestamp })).rejects.toThrow(/replaced|recreated/);
    expect(api.state.snapshot.contacts).toEqual([]);
  });

  it("does not use explicit create to recreate an ID already known by the caller", async () => {
    const { api, a, b, original } = await sessions();
    await a.deleteApplication(original.id);
    await expect(b.createApplication(original)).rejects.toThrow(/removed|exists|creation/);
    expect(api.state.snapshot.applications).toEqual([]);
  });

  it("does not edit a replacement document with the old metadata baseline", async () => {
    const document = { id: "doc", displayName: "Resume", originalFileName: "r.pdf", downloadFileName: "r.pdf", fileExtension: "pdf" as const, mimeType: "application/pdf", fileSize: 5, storageKey: "old-file", contentHash: "old-hash", uploadedAt: timestamp, updatedAt: timestamp };
    const { api, a, b } = await sessions(snapshot({ resumes: [document] }));
    await a.deleteResumeMetadata(document.id);
    await a.createResumeMetadata({ ...document, storageKey: "replacement-file", uploadedAt: recreatedAt });
    const saved = structuredClone(api.state);
    await expect(b.updateResumeMetadata({ ...document, notes: "Old draft" })).rejects.toThrow(/replaced|recreated/);
    expect(api.state).toEqual(saved);
  });

  it("does not edit a same-ID contact now belonging to a different application", async () => {
    const contact = { id: "contact", applicationId: application.id, name: "Recruiter", createdAt: timestamp, updatedAt: timestamp };
    const other = { ...application, id: "other" };
    const { api, a, b } = await sessions(snapshot({ applications: [application, other], contacts: [contact] }));
    await a.deleteContact(contact.id);
    await a.createContact({ ...contact, applicationId: other.id });
    const saved = structuredClone(api.state);
    await expect(b.updateContact({ ...contact, notes: "Old draft" })).rejects.toThrow(/replaced|recreated/);
    expect(api.state).toEqual(saved);
  });
});
