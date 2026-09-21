import { describe, expect, it } from "vitest";
import { DEFAULT_USER_SETTINGS } from "../lib/domain";
import { createTestStorageAdapter } from "../test/indexedDb";

describe("indexedDbStorageAdapter", () => {
  it("creates an isolated empty database with default settings", async () => {
    const adapter = createTestStorageAdapter();

    await expect(adapter.initialize()).resolves.toMatchObject({
      activities: [],
      applications: [],
      contacts: [],
      interviews: [],
      resumes: [],
      settings: DEFAULT_USER_SETTINGS,
    });
  });

  it("keeps test adapter databases isolated", async () => {
    const firstAdapter = createTestStorageAdapter();
    const secondAdapter = createTestStorageAdapter();

    await firstAdapter.initialize();
    await secondAdapter.initialize();
    await firstAdapter.saveSettings({
      ...DEFAULT_USER_SETTINGS,
      dueSoonDays: 10,
    });

    await expect(firstAdapter.getSettings()).resolves.toMatchObject({
      dueSoonDays: 10,
    });
    await expect(secondAdapter.getSettings()).resolves.toMatchObject({
      dueSoonDays: DEFAULT_USER_SETTINGS.dueSoonDays,
    });
  });
});
