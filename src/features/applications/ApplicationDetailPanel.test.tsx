import type { ComponentProps } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { application } from "../../test/assessmentFixtures";
import { ApplicationDetailPanel } from "./ApplicationDetailPanel";

function renderPanel(
  overrides: Partial<ComponentProps<typeof ApplicationDetailPanel>> = {},
) {
  return renderToStaticMarkup(
    <ApplicationDetailPanel
      activities={[]}
      application={application}
      assessmentActions={{
        addAssessment: vi.fn(),
        convertInterviewToAssessment: vi.fn(),
        deleteAssessment: vi.fn(),
        updateAssessment: vi.fn(),
      }}
      assessments={[]}
      contacts={[]}
      coverLetterActionError=""
      coverLetters={[]}
      enableDeleteActiveApplications={false}
      interviews={[]}
      onAddInterview={vi.fn()}
      onArchive={vi.fn().mockResolvedValue({ ok: true })}
      onClose={vi.fn()}
      onDelete={vi.fn().mockResolvedValue({ ok: true })}
      onDeleteInterview={vi.fn()}
      onDownloadCoverLetter={vi.fn()}
      onDownloadResume={vi.fn()}
      onPreviewCoverLetter={vi.fn()}
      onPreviewResume={vi.fn()}
      onRestore={vi.fn().mockResolvedValue({ ok: true })}
      onUpdate={vi.fn()}
      onUpdateInterview={vi.fn()}
      resumeActionError=""
      resumes={[]}
      workingCoverLetterId={null}
      workingResumeId={null}
      {...overrides}
    />,
  );
}

describe("application detail text", () => {
  it("links URLs in the job description and notes", () => {
    const html = renderPanel({
      application: {
        ...application,
        jobDescription: "Apply via https://jobs.example.com/apply.",
        notes: "Recruiter page: https://example.com/team\nCall Friday",
      },
    });

    expect(html).toContain('href="https://jobs.example.com/apply"');
    expect(html).toContain('href="https://example.com/team"');
    expect(html).toContain("</a>\nCall Friday");
  });

  it("does not link unsafe schemes in notes", () => {
    const html = renderPanel({
      application: { ...application, notes: "javascript:alert(1)" },
    });

    expect(html).toContain("javascript:alert(1)");
    expect(html).not.toContain('href="javascript:');
  });
});

describe("application detail layout", () => {
  afterEach(() => vi.unstubAllGlobals());

  const headings = (html: string) =>
    [...html.matchAll(/<(?:h3|summary)[^>]*>([^<]+)/g)].map((match) => match[1].trim());
  const sectionOrder = (html: string) =>
    headings(html).filter((heading) =>
      ["Key facts", "Follow-up actions", "Job description", "Notes", "Assessments", "Interviews", "Contacts"].includes(heading) ||
      heading.startsWith("Activity"),
    );

  it("keeps the original section order on tablets and desktops", () => {
    expect(sectionOrder(renderPanel())).toEqual([
      "Follow-up actions",
      "Job description",
      "Notes",
      "Assessments",
      "Interviews",
      "Contacts",
      "Activity",
    ]);
  });

  it("reads description first on phones and collapses activity", () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
    const html = renderPanel();

    expect(sectionOrder(html)).toEqual([
      "Job description",
      "Notes",
      "Assessments",
      "Interviews",
      "Key facts",
      "Follow-up actions",
      "Contacts",
      "Activity (0)",
    ]);
    expect(html).toMatch(/<details><summary[^>]*>Activity \(0\)<\/summary>/);
    expect(html).toMatch(/class="rounded-lg border border-border px-3 py-3 max-md:hidden"><p[^>]*>Status/);
  });

  it("shows the status as a phone-only picker in the header", () => {
    const html = renderPanel();
    // The picker sits directly under the header row, outside the scrolling body.
    const header = /<\/header><label[\s\S]*?<\/label>/.exec(html)?.[0] ?? "";

    expect(header).toMatch(/<label class="block border-b border-border px-4 pb-3 sm:px-6 md:hidden"><span class="sr-only">Application status<\/span><select/);
    expect(header).toMatch(new RegExp(`<option value="${application.status}" selected="">`));
    expect(html).toMatch(/<header class="[^"]*max-md:border-b-0"/);
  });
});

describe("phone detail panel scroll lock", () => {
  it("marks the panel so the page behind it can be locked", () => {
    const markup = renderPanel();
    const dialog = markup.slice(markup.indexOf("<dialog"), markup.indexOf(">", markup.indexOf("<dialog")) + 1);

    expect(dialog).toContain("application-detail-panel");
    // The panel body keeps its own scroll and doesn't hand it to the page.
    expect(markup).toContain("flex-1 overflow-y-auto px-4 py-5 max-md:overscroll-contain");
  });

  it("locks page scrolling only below md and only while the panel is open", () => {
    const css = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

    expect(css).toMatch(
      /max-width:\s*767\.98px\)\s*\{\s*html:has\(\.application-detail-panel\[open\]\)\s*\{\s*overflow:\s*hidden/,
    );
  });
});
