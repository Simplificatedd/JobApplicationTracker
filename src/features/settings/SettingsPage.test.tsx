import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_SETTINGS } from "../../lib/domain";
import { getBottomCatchUp, isSectionReached, parseDayField, SettingsPage } from "./SettingsPage";

function renderPage() {
  return renderToStaticMarkup(
    <SettingsPage
      cloudAccountEmail="user@example.com"
      onExportApplicationsCsv={vi.fn()}
      onExportFullBackup={vi.fn()}
      onExportRecoveryBackup={vi.fn()}
      onImportFullBackup={vi.fn()}
      onPreviewBackupImport={vi.fn()}
      onResetSettings={vi.fn()}
      onUpdateSettings={vi.fn()}
      settings={DEFAULT_USER_SETTINGS}
    />,
  );
}

function countMatches(text: string, part: string) {
  return text.split(part).length - 1;
}

// The opening tag of the first element whose attributes include `marker`.
function openingTag(markup: string, marker: string) {
  const index = markup.indexOf(marker);
  expect(index).toBeGreaterThan(-1);
  return markup.slice(markup.lastIndexOf("<", index), markup.indexOf(">", index) + 1);
}

describe("isSectionReached", () => {
  it("keeps the original 140px threshold where sections land 112px down (lg)", () => {
    expect(isSectionReached(140, 112)).toBe(true);
    expect(isSectionReached(141, 112)).toBe(false);
  });

  it("counts a section reached where a jump lands it below the header and strip", () => {
    // 640-1023px: 85px header + 52px strip + 12px gap. A fixed 140px
    // threshold left the previous section highlighted here.
    expect(isSectionReached(149, 149)).toBe(true);
    // Phones: 61px header + 60px strip + 12px gap.
    expect(isSectionReached(161, 133)).toBe(true);
    expect(isSectionReached(162, 133)).toBe(false);
  });

  it("does not count a section that is still well below its landing point", () => {
    expect(isSectionReached(400, 149)).toBe(false);
  });
});

describe("getBottomCatchUp (#260)", () => {
  // Tablet, 900px tall: sections land 149px down, and at the bottom of the
  // page Notifications sits 316px down and Reset 741px down.
  it("leaves the line alone until the final stretch of the page", () => {
    expect(getBottomCatchUp(1741, 149, 1000)).toBe(0);
    expect(getBottomCatchUp(1305, 149, 564)).toBe(0);
  });

  it("highlights Notifications before Reset instead of skipping it", () => {
    const catchUp = getBottomCatchUp(941, 149, 200);

    expect(isSectionReached(516, 149, catchUp)).toBe(true);
    expect(isSectionReached(941, 149, catchUp)).toBe(false);
    // Earlier, the previous section still holds.
    expect(isSectionReached(616, 149, getBottomCatchUp(1041, 149, 300))).toBe(false);
  });

  it("reaches the last section exactly at the bottom", () => {
    expect(isSectionReached(741, 149, getBottomCatchUp(741, 149, 0))).toBe(true);
  });
});

describe("phone settings", () => {
  it("hides the applications table section and its strip entry below md", () => {
    const markup = renderPage();

    expect(openingTag(markup, 'id="settings-table"')).toContain("max-md:hidden");
    expect(openingTag(markup, 'href="#settings-table"')).toContain("max-md:hidden");
    expect(openingTag(markup, 'id="settings-general"')).not.toContain("max-md:hidden");
    expect(openingTag(markup, 'href="#settings-general"')).not.toContain("max-md:hidden");
  });
});

describe("phone navigation setting", () => {
  it("hides the navigation layout choice below md and keeps contacts", () => {
    const markup = renderPage();
    const navigationRow = markup.slice(
      markup.lastIndexOf("<div", markup.indexOf("Show navigation as")),
    );

    expect(openingTag(navigationRow, "class=")).toContain("max-md:hidden");
    // Stops the next row's divider doubling the section header's border.
    expect(openingTag(navigationRow, "class=")).toContain("max-md:[&amp;+*]:!border-t-0");
    expect(markup).toContain('aria-label="Show navigation as"');
    expect(openingTag(markup, 'aria-label="Open contacts as"')).not.toContain("max-md:hidden");
  });
});

describe("phone section strip", () => {
  it("gives strip links 44px on phones and keeps sections clear of the taller strip", () => {
    const markup = renderPage();

    expect(openingTag(markup, 'href="#settings-account"')).toContain("max-md:h-11");
    expect(openingTag(markup, 'id="settings-account"')).toContain(
      "max-md:scroll-mt-[calc(var(--app-header-height,0px)+4.5rem)]",
    );
  });
});

describe("phone settings actions", () => {
  it("gives account, backup and reset actions 44px on phones", () => {
    const markup = renderPage();

    expect(openingTag(markup, 'href="/cdn-cgi/access/logout"')).toContain("max-md:h-11");
    for (const label of ["Export recovery archive", "Reset preferences"]) {
      const button = markup.slice(markup.lastIndexOf("<button", markup.lastIndexOf(label)));
      expect(openingTag(button, "class=")).toContain("max-md:h-11");
    }
  });
});

describe("phone confirmation buttons", () => {
  it("stacks the replace and reset confirmations full width on narrow phones", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    // Both pairs only render after a click, so check the source.
    expect(countMatches(source, '"mt-3 flex flex-wrap gap-2 max-md:grid"')).toBe(1);
    // The reset row turns horizontal at sm, so its pair only stacks below sm.
    expect(countMatches(source, '"flex flex-wrap gap-2 max-sm:grid"')).toBe(1);
    expect(countMatches(source, "inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-red-600")).toBe(2);
  });
});

describe("phone settings fields", () => {
  it("gives the number and text fields 44px on phones", () => {
    const markup = renderPage();

    const fields = markup.match(/class="field-control[^"]*"/g) ?? [];

    // Two day counts and the quick location.
    expect(fields).toHaveLength(3);
    for (const field of fields) expect(field).toContain("max-md:h-11");
  });
});

describe("phone settings choices", () => {
  it("spreads the choice buttons across the row at 44px on phones", () => {
    const markup = renderPage();

    // Full width only while the row stacks (below sm); from sm the row is
    // horizontal and stretching would make the group as tall as the label.
    expect(openingTag(markup, 'aria-label="Open contacts as"')).toContain(
      "max-md:grid max-md:grid-cols-2 max-sm:self-stretch",
    );
    const radios = markup.match(/<button[^>]*role="radio"[^>]*>/g) ?? [];
    // Navigation and contacts, two options each.
    expect(radios).toHaveLength(4);
    for (const radio of radios) expect(radio).toContain("max-md:h-11");
  });
});

describe("phone settings text", () => {
  it("uses 15px setting names and 13px descriptions on phones", () => {
    const markup = renderPage();
    const settingName = markup.slice(markup.lastIndexOf("<span", markup.indexOf(">Quick location button")));
    const settingDescription = markup.slice(
      markup.lastIndexOf("<span", markup.indexOf("Shows a button beside the Location field")),
    );
    const sectionDescription = markup.slice(
      markup.lastIndexOf("<p", markup.indexOf("Your signed-in cloud workspace.")),
    );

    expect(openingTag(settingName, "class=")).toContain("max-md:text-[15px]");
    expect(openingTag(settingDescription, "class=")).toContain("max-md:text-[13px]");
    expect(openingTag(sectionDescription, "class=")).toContain("max-md:text-[13px]");
  });
});

describe("full job titles setting (#273)", () => {
  it("sits in General, which phones show, because it also changes phone rows", () => {
    const markup = renderPage();
    const general = markup.slice(markup.indexOf('id="settings-general"'), markup.indexOf('id="settings-contacts"'));

    expect(general).toContain("Show full job titles");
    expect(countMatches(markup, "Show full job titles")).toBe(1);
  });
});

describe("unavailable Add Job settings (#260)", () => {
  it("shows no Coming soon rows and keeps the working General settings", () => {
    const markup = renderPage();

    expect(markup).not.toContain("Coming soon");
    expect(markup).not.toContain("Add job form");
    expect(markup).not.toContain("Add job opens as");
    expect(markup).toContain("Quick location button");
    expect(markup).toContain("Show full job titles");
  });
});

describe("settings switches (#260)", () => {
  it("uses the primary colour for every switch and a 3:1 off track", () => {
    const markup = renderPage();
    const tracks = markup.match(/<span aria-hidden="true" class="h-6 w-11[^"]*"/g) ?? [];

    expect(tracks.length).toBeGreaterThan(5);
    tracks.forEach((track) => {
      expect(track).toContain("peer-checked:bg-primary");
      expect(track).toContain("bg-slate-500");
      expect(track).not.toMatch(/peer-checked:bg-(?!primary)/);
    });
  });

  it("draws the focus ring as a box-shadow, not a shadow colour (#280)", async () => {
    const [{ default: postcss }, { default: tailwindcss }, { default: config }] = await Promise.all([
      import("postcss"),
      import("tailwindcss"),
      import("../../../tailwind.config"),
    ]);
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");
    const { css } = await postcss([
      tailwindcss({ ...config, content: [{ raw: source, extension: "tsx" }] }),
    ]).process("@tailwind utilities;", { from: undefined });

    // Without the shadow: type hint Tailwind sets only --tw-shadow-color. Split so Tailwind's scan of this file skips it.
    expect(source).not.toContain(["shadow-", "[var(--focus-ring)]"].join(""));
    expect(css).not.toContain("--tw-shadow-color: var(--focus-ring)");
    for (const variant of ["peer-focus-visible", "focus-within"]) {
      const rule = css.match(new RegExp(`\\.${variant}\\\\:shadow-\\\\\\[shadow\\\\:var[^{]*\\{([^}]*)\\}`))?.[1];
      expect(rule).toContain("--tw-shadow: var(--focus-ring)");
      expect(rule).toContain("box-shadow:");
    }
  });
});

describe("parseDayField (#345)", () => {
  it("saves a retyped value and keeps the previous one for empty or invalid text", () => {
    expect(parseDayField("5", 3, 1, 365)).toBe(5);
    expect(parseDayField("", 3, 1, 365)).toBe(3);
    expect(parseDayField("abc", 3, 1, 365)).toBe(3);
  });

  it("rounds down and clamps to the allowed range", () => {
    expect(parseDayField("1.7", 3, 1, 365)).toBe(1);
    expect(parseDayField("0", 3, 1, 365)).toBe(1);
    expect(parseDayField("-3", 3, 1, 365)).toBe(1);
    expect(parseDayField("99999", 3, 1, 365)).toBe(365);
  });

  it("caps both day inputs at 365", () => {
    expect(countMatches(renderPage(), 'max="365"')).toBe(2);
  });
});

describe("export file names (#358)", () => {
  it("use the local date, not the UTC date", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");
    expect(source).toContain("job-applications-${createDateStamp()}.csv");
    expect(source).toContain('"backup"}-${createDateStamp()}.json');
    expect(source).not.toContain("toISOString().slice(0, 10)");
  });
});
