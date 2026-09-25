import { describe, expect, it } from "vitest";
import {
  APPLICATION_STATUSES,
  DEFAULT_APPLICATION_STATUS,
  DEFAULT_USER_SETTINGS,
  normalizeApplicationStatus,
  normalizeUserSettings,
  REQUIRED_APPLICATION_COLUMNS,
} from "./domain";

describe("application statuses", () => {
  it("starts applications at Awaiting Response", () => {
    expect(DEFAULT_APPLICATION_STATUS).toBe("Awaiting Response");
    expect(APPLICATION_STATUSES[0]).toBe("Awaiting Response");
    expect(APPLICATION_STATUSES).not.toContain("Just Applied");
  });

  it("normalizes blank and legacy statuses to Awaiting Response", () => {
    expect(normalizeApplicationStatus("")).toBe("Awaiting Response");
    expect(normalizeApplicationStatus(undefined)).toBe("Awaiting Response");
    expect(normalizeApplicationStatus("Just Applied")).toBe(
      "Awaiting Response",
    );
  });
});

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

  it("normalizes unavailable Add Job modes to the implemented workflow", () => {
    expect(
      normalizeUserSettings({
        addJobFormLayout: "stepped",
        addJobPresentation: "page",
      }),
    ).toMatchObject({
      addJobFormLayout: "long_form",
      addJobPresentation: "modal",
    });
  });
});
