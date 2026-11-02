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
    // Phones: 53px header + 52px strip + 12px gap.
    expect(isSectionReached(117, 117)).toBe(true);
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
