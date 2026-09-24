import { describe, expect, it } from "vitest";
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
        status: "Just Applied",
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

    const [ownerEmail, snapshotJson, updatedAt, ownerId, baseRevision] =
      this.values;
    const current = this.rows.get(String(ownerId));

    if (!current || current.revision !== baseRevision) {
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

describe("cloud state", () => {
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
