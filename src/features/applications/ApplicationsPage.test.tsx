import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_SETTINGS } from "../../lib/domain";
import type { Application } from "../../types/application";
import { ApplicationsPage } from "./ApplicationsPage";
import {
  DEFAULT_APPLICATION_FILTERS,
  DEFAULT_SORT_STATE,
} from "./applicationFilters";

const titleMatch: Application = {
  id: "title",
  company: "Example Company",
  jobTitle: "Software Engineer",
  jobDescription: "Build web applications.",
  status: "Awaiting Response",
  workMode: "unknown",
  jobType: "internship",
  followUpNeeded: false,
  interviewProctored: false,
  priority: "medium",
  contactsCount: 0,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};
const descriptionMatch: Application = {
  ...titleMatch,
  id: "description",
  jobTitle: "Platform Intern",
  jobDescription: "Support the software team.",
  updatedAt: "2026-09-02T00:00:00.000Z",
};

function renderPage(
  query: string,
  overrides: Partial<ComponentProps<typeof ApplicationsPage>> = {},
) {
  return renderToStaticMarkup(
    <ApplicationsPage
      activities={[]}
      assessments={[]}
      assessmentActions={{
        addAssessment: vi.fn(),
        updateAssessment: vi.fn(),
        deleteAssessment: vi.fn(),
        convertInterviewToAssessment: vi.fn(),
      }}
      addContact={vi.fn()}
      addInterview={vi.fn()}
      applications={[descriptionMatch, titleMatch]}
      archiveApplication={vi.fn()}
      contacts={[]}
      coverLetters={[]}
      deleteApplication={vi.fn()}
      deleteContact={vi.fn()}
      deleteInterview={vi.fn()}
      enableDeleteActiveApplications={false}
      getResumeFile={vi.fn()}
      getCoverLetterFile={vi.fn()}
      interviews={[]}
      restoreApplication={vi.fn()}
      resumes={[]}
      settings={DEFAULT_USER_SETTINGS}
      tablePreferences={{
        columnWidths: {},
        filters: DEFAULT_APPLICATION_FILTERS,
        needsAttentionOnly: false,
        searchQuery: query,
        sort: DEFAULT_SORT_STATE,
        visibleApplicationColumns:
          DEFAULT_USER_SETTINGS.visibleApplicationColumns,
      }}
      resetTablePreferences={vi.fn()}
      updateContact={vi.fn()}
      updateInterview={vi.fn()}
      updateApplication={vi.fn()}
      updateSettings={vi.fn()}
      updateTablePreferences={vi.fn()}
      {...overrides}
    />,
  );
}

describe("application search results in the table", () => {
  it("displays title matches before newer description-only matches", () => {
    const html = renderPage("software");
    expect(html.indexOf(titleMatch.jobTitle)).toBeGreaterThan(-1);
    expect(html.indexOf(descriptionMatch.jobTitle)).toBeGreaterThan(-1);
    expect(html.indexOf(titleMatch.jobTitle)).toBeLessThan(
      html.indexOf(descriptionMatch.jobTitle),
    );
  });

  it("keeps the selected sort for equally relevant matches", () => {
    const newer = {
      ...titleMatch,
      id: "newer",
      company: "Newer Company",
      updatedAt: descriptionMatch.updatedAt,
    };
    const html = renderPage("software", { applications: [titleMatch, newer] });
    expect(html.indexOf(newer.company)).toBeLessThan(
      html.indexOf(titleMatch.company),
    );
  });

  it("uses the selected sort for blank searches", () => {
    const html = renderPage("   ");
    expect(html.indexOf(descriptionMatch.jobTitle)).toBeLessThan(
      html.indexOf(titleMatch.jobTitle),
    );
  });

  it("narrows visible rows and displays the no-results state", () => {
    const html = renderPage("engineer");
    expect(html).toContain(titleMatch.jobTitle);
    expect(html).not.toContain(descriptionMatch.jobTitle);
    expect(renderPage("accounting")).toContain("No matching applications");
  });
});
