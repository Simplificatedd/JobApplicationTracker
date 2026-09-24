import { describe, expect, it } from "vitest";
import {
  DEFAULT_USER_SETTINGS,
  normalizeUserSettings,
  REQUIRED_APPLICATION_COLUMNS,
} from "./domain";

describe("default user settings", () => {
  it("keeps application column resizing disabled until explicitly enabled", () => {
    expect(DEFAULT_USER_SETTINGS.enableDraggableColumnWidths).toBe(false);
  });
});

describe("normalizeUserSettings", () => {
  it("restores required application columns in saved preferences", () => {
    const settings = normalizeUserSettings({
      visibleApplicationColumns: ["company"],
    });

    expect(settings.visibleApplicationColumns).toEqual([
      "company",
      ...REQUIRED_APPLICATION_COLUMNS,
    ]);
  });

  it("preserves an explicitly enabled resizing preference", () => {
    expect(
      normalizeUserSettings({ enableDraggableColumnWidths: true })
        .enableDraggableColumnWidths,
    ).toBe(true);
  });
});
