import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_SETTINGS } from "../../lib/domain";
import { isSectionReached, SettingsPage } from "./SettingsPage";

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
