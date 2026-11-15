import { describe, expect, it } from "vitest";
import {
  APPLICATION_STATUSES,
  createDateStamp,
  DEFAULT_APPLICATION_STATUS,
  DEFAULT_USER_SETTINGS,
  JOB_TYPE_LABELS,
  normalizeApplicationStatus,
  normalizeUserSettings,
  PRIORITY_LABELS,
  REQUIRED_APPLICATION_COLUMNS,
  WORK_MODE_LABELS,
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

  it("cuts off long job titles until full titles are switched on", () => {
    expect(DEFAULT_USER_SETTINGS.showFullJobTitles).toBe(false);
    expect(normalizeUserSettings({}).showFullJobTitles).toBe(false);
    expect(normalizeUserSettings({ showFullJobTitles: true }).showFullJobTitles).toBe(true);
  });

  it("shows the Singapore quick location button by default", () => {
    expect(DEFAULT_USER_SETTINGS).toMatchObject({
      enableQuickLocation: true,
      quickLocation: "Singapore",
    });
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

  it("removes the retired standalone follow-up requirement column", () => {
    expect(
      normalizeUserSettings({
        visibleApplicationColumns: ["company", "followUpNeeded"],
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

  it("fills quick location defaults for settings saved before the option existed", () => {
    const savedSettings: Partial<typeof DEFAULT_USER_SETTINGS> = {
      ...DEFAULT_USER_SETTINGS,
    };
    delete savedSettings.enableQuickLocation;
    delete savedSettings.quickLocation;

    expect(normalizeUserSettings(savedSettings)).toMatchObject({
      enableQuickLocation: true,
      quickLocation: "Singapore",
    });
  });
});

describe("application value labels", () => {
  it("uses the same wording as the form options", () => {
    expect(WORK_MODE_LABELS).toEqual({
      unknown: "Unknown",
      remote: "Remote",
      hybrid: "Hybrid",
      onsite: "Onsite",
    });
    expect(JOB_TYPE_LABELS).toEqual({
      internship: "Internship",
      "part-time": "Part-time",
      "full-time": "Full-time",
      contract: "Contract",
      other: "Other",
    });
    expect(PRIORITY_LABELS).toEqual({ low: "Low", medium: "Medium", high: "High" });
  });
});
