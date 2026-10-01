import { describe, expect, it } from "vitest";
import {
  APPLICATION_STATUSES,
  createDateStamp,
  DEFAULT_APPLICATION_STATUS,
  DEFAULT_USER_SETTINGS,
  normalizeApplicationStatus,
  normalizeUserSettings,
  REQUIRED_APPLICATION_COLUMNS,
} from "./domain";

describe("createDateStamp", () => {
  it("uses the user's local calendar date instead of the UTC date", () => {
    const earlyMorningSingaporeDate = Object.assign(
      new Date("2026-09-25T20:24:00.000Z"),
      {
        getDate: () => 26,
        getFullYear: () => 2026,
        getMonth: () => 8,
      },
    );

    expect(createDateStamp(earlyMorningSingaporeDate)).toBe("2026-09-26");
  });

  it("pads single-digit months and days", () => {
    const localDate = Object.assign(new Date("2026-01-03T20:24:00.000Z"), {
      getDate: () => 4,
      getFullYear: () => 2026,
      getMonth: () => 0,
    });

    expect(createDateStamp(localDate)).toBe("2026-01-04");
  });
});

describe("application statuses", () => {
  it("starts applications at Awaiting Response", () => {
    expect(DEFAULT_APPLICATION_STATUS).toBe("Awaiting Response");
    expect(APPLICATION_STATUSES[0]).toBe("Awaiting Response");
    expect(APPLICATION_STATUSES).toContain("Accepted");
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

  it("removes retired application deadline columns", () => {
    expect(
      normalizeUserSettings({
        visibleApplicationColumns: [
          "company",
          "deadline",
          "deadlineEntryMode",
        ],
      }).visibleApplicationColumns,
    ).toEqual(["company", ...REQUIRED_APPLICATION_COLUMNS]);
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
