import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { IDBKeyRange } from "fake-indexeddb";
import { snapshot } from "../test/assessmentFixtures";
import { createTestStorageAdapter } from "../test/indexedDb";
import { RevisionApi } from "../test/revisionApi";
import { createCloudStorageAdapter } from "./cloudStorageAdapter";


beforeAll(() => vi.stubGlobal("IDBKeyRange", IDBKeyRange));
afterAll(() => vi.unstubAllGlobals());
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
});
