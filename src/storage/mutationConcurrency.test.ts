import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { IDBKeyRange } from "fake-indexeddb";
import { createTestStorageAdapter } from "../test/indexedDb";
import { application, snapshot } from "../test/assessmentFixtures";

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
});
