import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ResumeMetadata } from "../../types/application";
import { ResumesPage } from "./ResumesPage";

const resume: ResumeMetadata = {
  id: "resume-1",
  displayName: "Software Resume",
  originalFileName: "software-resume.pdf",
  downloadFileName: "Software Resume.pdf",
  fileExtension: "pdf",
  mimeType: "application/pdf",
  fileSize: 2048,
  storageKey: "resumes/resume-1",
  contentHash: "hash",
  versionLabel: "Frontend",
  uploadedAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-02T00:00:00.000Z",
};

function renderPage(overrides: Partial<ComponentProps<typeof ResumesPage>> = {}) {
  return renderToStaticMarkup(
    <ResumesPage
      applications={[]}
      getResumeFile={vi.fn()}
      onDeleteResume={vi.fn()}
      onUpdateResume={vi.fn()}
      onUploadResume={vi.fn()}
      resumes={[resume]}
      {...overrides}
    />,
  );
}

function countMatches(markup: string, text: string) {
  return markup.split(text).length - 1;
}

describe("document library layouts", () => {
  it("renders cards below xl and keeps the table from xl", () => {
    const markup = renderPage();

    expect(markup).toContain('class="grid gap-3 p-3 lg:grid-cols-2 xl:hidden"');
    expect(markup).toContain("<article");
    expect(markup).toContain('class="relative hidden overflow-x-auto xl:block"');
    expect(markup).toContain("<table");
  });

  it("gives card actions visible labels and keeps table actions icon-only", () => {
    const markup = renderPage();

    for (const shortLabel of ["Preview", "Download", "Edit", "Delete"]) {
      expect(markup).toContain(`<span>${shortLabel}</span>`);
    }
    // Each action keeps one accessible name per layout: card and table.
    expect(countMatches(markup, 'aria-label="Preview resume"')).toBe(2);
    expect(countMatches(markup, 'aria-label="Delete resume"')).toBe(2);
    expect(countMatches(markup, 'title="Delete resume"')).toBe(1);
  });

  it("labels a DOCX's first action as opening it, since it cannot preview", () => {
    const markup = renderPage({
      resumes: [{ ...resume, fileExtension: "docx" }],
    });

    expect(markup).toContain("<span>Open</span>");
    expect(markup).not.toContain("<span>Preview</span>");
  });

  it("names the document kind on cover letter cards", () => {
    const markup = renderPage({ documentKind: "cover letter" });

    expect(countMatches(markup, 'aria-label="Download cover letter"')).toBe(2);
  });
});
