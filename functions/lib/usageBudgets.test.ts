import { describe, expect, it } from "vitest";
import { HttpError } from "./http";
import {
  MONTHLY_R2_READ_LIMIT,
  MONTHLY_R2_WRITE_LIMIT,
  reserveR2Operation,
} from "./usageBudgets";

class FakeBudgetStatement {
  private values: unknown[] = [];

  constructor(private readonly counts: Map<string, number>) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<T>() {
    const [period, kind, limit] = this.values;
    const key = `${String(period)}:${String(kind)}`;
    const current = this.counts.get(key) ?? 0;

    if (current >= Number(limit)) {
      return null;
    }

    const operationCount = current + 1;
    this.counts.set(key, operationCount);
    return { operation_count: operationCount } as T;
  }
}

class FakeBudgetDatabase {
  readonly counts = new Map<string, number>();

  prepare() {
    return new FakeBudgetStatement(this.counts);
  }
}

describe("R2 operation budgets", () => {
  it("tracks reads and writes separately by calendar month", async () => {
    const fake = new FakeBudgetDatabase();
    const database = fake as unknown as D1Database;

    await reserveR2Operation(database, "read", new Date("2026-09-30T23:59:00Z"));
    await reserveR2Operation(database, "write", new Date("2026-09-30T23:59:00Z"));
    await reserveR2Operation(database, "read", new Date("2026-10-01T00:00:00Z"));

    expect(fake.counts).toEqual(
      new Map([
        ["2026-09:read", 1],
        ["2026-09:write", 1],
        ["2026-10:read", 1],
      ]),
    );
  });

  it.each([
    ["read" as const, MONTHLY_R2_READ_LIMIT],
    ["write" as const, MONTHLY_R2_WRITE_LIMIT],
  ])("fails closed at the monthly %s limit", async (kind, limit) => {
    const fake = new FakeBudgetDatabase();
    fake.counts.set(`2026-09:${kind}`, limit);

    await expect(
      reserveR2Operation(
        fake as unknown as D1Database,
        kind,
        new Date("2026-09-23T00:00:00Z"),
      ),
    ).rejects.toEqual(
      expect.objectContaining({ status: 429 }) as unknown as HttpError,
    );
  });
});
