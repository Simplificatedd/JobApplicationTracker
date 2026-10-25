import { describe, expect, it, vi } from "vitest";
import { snapshotWithBytes } from "../../src/test/snapshotSize";
import { MAX_CLOUD_SNAPSHOT_BYTES, utf8ByteLength } from "../../src/storage/snapshotSize";
import {
  DEFAULT_ANALYTICS_SETTINGS,
  DEFAULT_NOTIFICATION_STATE,
  DEFAULT_USER_SETTINGS,
} from "../../src/lib/domain";
import type { StorageSnapshot } from "../../src/storage/StorageAdapter";
import {
  getCloudState,
  MAX_TOTAL_SNAPSHOT_BYTES,
  parseSaveStateRequest,
  requireAvailableSnapshotQuota,
  saveCloudState,
} from "./state";

function snapshot(company = "Example Co"): StorageSnapshot {
  return {
    activities: [],
    analyticsSettings: DEFAULT_ANALYTICS_SETTINGS,
    applications: [
      {
        company,
        contactsCount: 0,
        createdAt: "2026-09-22T00:00:00.000Z",
        deadlineEntryMode: "exact",
        followUpNeeded: false,
        id: "app-1",
        interviewProctored: false,
        jobDescription: "",
        jobTitle: "Engineer",
        jobType: "full-time",
        priority: "medium",
        status: "Awaiting Response",
        updatedAt: "2026-09-22T00:00:00.000Z",
        workMode: "hybrid",
      },
    ],
    contacts: [],
    coverLetters: [],
    interviews: [],
    notificationState: DEFAULT_NOTIFICATION_STATE,
    resumes: [],
    settings: DEFAULT_USER_SETTINGS,
    tablePreferences: null,
  };
}

interface StoredRow {
  owner_email: string;
  revision: number;
  snapshot_json: string;
  updated_at: string;
}

class FakeD1Statement {
  private values: unknown[] = [];

  constructor(
    private readonly rows: Map<string, StoredRow>,
    private readonly query: string,
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<T>() {
    const row = this.rows.get(String(this.values[0]));
    return (row
      ? {
          revision: row.revision,
          snapshot_json: row.snapshot_json,
          updated_at: row.updated_at,
        }
      : null) as T | null;
  }

  async run() {
    if (this.query.includes("INSERT OR IGNORE")) {
      const [ownerId, ownerEmail, snapshotJson, , updatedAt] = this.values;

      if (this.rows.has(String(ownerId))) {
        return { meta: { changes: 0 } };
      }

      this.rows.set(String(ownerId), {
        owner_email: String(ownerEmail),
        revision: 1,
        snapshot_json: String(snapshotJson),
        updated_at: String(updatedAt),
      });
      return { meta: { changes: 1 } };
    }

    const [
      ownerEmail,
      snapshotJson,
      updatedAt,
      ownerId,
      baseRevision,
      incomingVersion,
    ] = this.values;
    const current = this.rows.get(String(ownerId));

    if (
      !current ||
      current.revision !== baseRevision ||
      (JSON.parse(current.snapshot_json).dataVersion ?? 1) >
        Number(incomingVersion)
    ) {
      return { meta: { changes: 0 } };
    }

    this.rows.set(String(ownerId), {
      owner_email: String(ownerEmail),
      revision: current.revision + 1,
      snapshot_json: String(snapshotJson),
      updated_at: String(updatedAt),
    });
    return { meta: { changes: 1 } };
  }
}

class FakeD1Database {
  readonly rows = new Map<string, StoredRow>();

  prepare(query: string) {
    return new FakeD1Statement(this.rows, query);
  }
}

describe("cloud snapshot storage budget", () => {
  it.each([-1, 0, 1])("guards the persisted snapshot at limit %+d before any D1 query", async (offset) => {
    const fake = new FakeD1Database();
    const prepare = vi.spyOn(fake, "prepare");
    const input = parseSaveStateRequest(JSON.stringify({ baseRevision: null, snapshot: snapshotWithBytes(MAX_CLOUD_SNAPSHOT_BYTES + offset) }));
    const saving = saveCloudState(fake as unknown as D1Database, { id: "owner", email: "owner@example.edu" }, input);
    if (offset <= 0) {
      await expect(saving).resolves.toMatchObject({ revision: 1 });
      expect(utf8ByteLength(fake.rows.get("owner")!.snapshot_json)).toBe(MAX_CLOUD_SNAPSHOT_BYTES + offset);
    } else {
      await expect(saving).rejects.toMatchObject({ status: 413, message: expect.stringContaining("1,900,000-byte") });
      expect(prepare).not.toHaveBeenCalled();
    }
  });

  it("preserves an existing row and revision when an oversized update is rejected", async () => {
    const fake = new FakeD1Database();
    const database = fake as unknown as D1Database;
    const user = { id: "owner", email: "owner@example.edu" };
    await saveCloudState(database, user, { baseRevision: null, snapshot: snapshot() });
    const before = structuredClone(fake.rows.get(user.id));
    const prepare = vi.spyOn(fake, "prepare");
    await expect(saveCloudState(database, user, { baseRevision: 1, snapshot: snapshotWithBytes(MAX_CLOUD_SNAPSHOT_BYTES + 1) })).rejects.toMatchObject({ status: 413 });
    expect(prepare).not.toHaveBeenCalled();
    expect(fake.rows.get(user.id)).toEqual(before);
  });

  it.each([0, 1])("accounts for UTF-8 identity columns and conservative SQLite row overhead %+d", async (offset) => {
    const fake = new FakeD1Database();
    const prepare = vi.spyOn(fake, "prepare");
    // 64 header bytes + 8 revision bytes + two 24-byte API timestamps.
    const id = "界".repeat(30_000);
    const email = "x".repeat(100_000 - 120 - utf8ByteLength(id) + offset);
    const saving = saveCloudState(fake as unknown as D1Database, { id, email }, { baseRevision: null, snapshot: snapshotWithBytes(MAX_CLOUD_SNAPSHOT_BYTES) });
    if (offset === 0) await expect(saving).resolves.toMatchObject({ revision: 1 });
    else {
      await expect(saving).rejects.toMatchObject({ status: 413, message: expect.stringContaining("account metadata") });
      expect(prepare).not.toHaveBeenCalled();
    }
  });

  it("separates HTTP JSON escaping/whitespace from compact stored snapshot bytes", async () => {
    const fake = new FakeD1Database();
    const data = snapshot("界".repeat(100_000));
    const body = JSON.stringify({ baseRevision: null, snapshot: data }).replace(/界/g, "\\u754c") + " ".repeat(2_000_000);
    expect(utf8ByteLength(body)).toBeGreaterThan(MAX_CLOUD_SNAPSHOT_BYTES);
    const input = parseSaveStateRequest(body);
    await saveCloudState(fake as unknown as D1Database, { id: "owner", email: "owner@example.edu" }, input);
    expect(fake.rows.get("owner")!.snapshot_json).toBe(JSON.stringify(data));
    expect(utf8ByteLength(fake.rows.get("owner")!.snapshot_json)).toBeLessThan(MAX_CLOUD_SNAPSHOT_BYTES);
  });

  it("retains a separate UTF-8 transport ceiling", () => {
    expect(() => parseSaveStateRequest("界".repeat(2_000_000))).toThrow("5 MiB transport limit");
  });
});

describe("cloud state", () => {
  it("rejects downgraded writes so older clients cannot overwrite migrated assessment data", async () => {
    const database = new FakeD1Database() as unknown as D1Database;
    const user = { email: "one@example.edu", id: "user-1" };
    const migrated = {
      ...snapshot(),
      dataVersion: 3,
      assessments: [],
      applications: snapshot().applications.map((app) => ({
        ...app,
        status: "Online Assessment" as const,
      })),
    };
    await saveCloudState(database, user, {
      baseRevision: null,
      snapshot: migrated,
    });
    await expect(
      saveCloudState(database, user, {
        baseRevision: 1,
        snapshot: { ...snapshot(), dataVersion: 2 },
      }),
    ).rejects.toThrow("newer data format");
    expect((await getCloudState(database, user.id))?.snapshot).toEqual(
      migrated,
    );
    await expect(
      saveCloudState(database, user, { baseRevision: 1, snapshot: migrated }),
    ).resolves.toMatchObject({ revision: 2 });
  });
  it("requires an assessments array for the new data version and rejects malformed arrays", () => {
    expect(() =>
      parseSaveStateRequest(
        JSON.stringify({
          baseRevision: null,
          snapshot: { ...snapshot(), dataVersion: 3 },
        }),
      ),
    ).toThrow("invalid shape");
    expect(() =>
      parseSaveStateRequest(
        JSON.stringify({
          baseRevision: null,
          snapshot: { ...snapshot(), assessments: {} },
        }),
      ),
    ).toThrow("invalid shape");
    expect(
      parseSaveStateRequest(
        JSON.stringify({
          baseRevision: null,
          snapshot: { ...snapshot(), dataVersion: 3, assessments: [] },
        }),
      ).snapshot.assessments,
    ).toEqual([]);
  });
  it("rejects writes beyond the account snapshot budget", () => {
    expect(() =>
      requireAvailableSnapshotQuota(MAX_TOTAL_SNAPSHOT_BYTES, 1),
    ).toThrow("account safety limit");
  });

  it("validates incoming state envelopes", () => {
    const input = { baseRevision: null, snapshot: snapshot() };
    expect(parseSaveStateRequest(JSON.stringify(input))).toEqual(input);
    expect(() => parseSaveStateRequest("{}"))
      .toThrow("invalid shape");
    expect(() =>
      parseSaveStateRequest(
        JSON.stringify({ baseRevision: 0, snapshot: snapshot() }),
      ),
    ).toThrow("base revision");
  });

  it("isolates snapshots by the verified Access subject", async () => {
    const fake = new FakeD1Database();
    const database = fake as unknown as D1Database;

    await saveCloudState(
      database,
      { email: "one@example.edu", id: "user-1" },
      { baseRevision: null, snapshot: snapshot("One") },
    );
    await saveCloudState(
      database,
      { email: "two@example.edu", id: "user-2" },
      { baseRevision: null, snapshot: snapshot("Two") },
    );

    await expect(getCloudState(database, "user-1")).resolves.toMatchObject({
      revision: 1,
      snapshot: { applications: [{ company: "One" }] },
    });
    await expect(getCloudState(database, "user-2")).resolves.toMatchObject({
      revision: 1,
      snapshot: { applications: [{ company: "Two" }] },
    });
    await expect(getCloudState(database, "user-3")).resolves.toBeNull();
  });

  it("rejects a stale revision and returns the current owner state", async () => {
    const database = new FakeD1Database() as unknown as D1Database;
    const user = { email: "one@example.edu", id: "user-1" };

    await saveCloudState(database, user, {
      baseRevision: null,
      snapshot: snapshot("One"),
    });
    await saveCloudState(database, user, {
      baseRevision: 1,
      snapshot: snapshot("Updated"),
    });

    await expect(
      saveCloudState(database, user, {
        baseRevision: 1,
        snapshot: snapshot("Stale"),
      }),
    ).rejects.toMatchObject({
      current: {
        revision: 2,
        snapshot: { applications: [{ company: "Updated" }] },
      },
      status: 409,
    });
  });
});
