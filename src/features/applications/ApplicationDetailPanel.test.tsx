import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
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
      interviews={[]}
      onAddInterview={vi.fn()}
      onClose={vi.fn()}
      onDeleteInterview={vi.fn()}
      onDownloadCoverLetter={vi.fn()}
      onDownloadResume={vi.fn()}
      onPreviewCoverLetter={vi.fn()}
      onPreviewResume={vi.fn()}
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
