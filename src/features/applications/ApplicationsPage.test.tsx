import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_SETTINGS } from "../../lib/domain";
import type { Application } from "../../types/application";
import type { TablePreferences } from "../../types/tablePreferences";
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
const tablePreferences: TablePreferences = {
  columnWidths: {},
  filters: DEFAULT_APPLICATION_FILTERS,
  needsAttentionOnly: false,
  searchQuery: "software",
  sort: DEFAULT_SORT_STATE,
  visibleApplicationColumns: DEFAULT_USER_SETTINGS.visibleApplicationColumns,
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
      tablePreferences={{ ...tablePreferences, searchQuery: query }}
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

  it.each(["active", "archive"] as const)(
    "searches only applications in the %s view",
    (viewMode) => {
      const archived = {
        ...titleMatch,
        jobTitle: "Archived Software Engineer",
        archivedAt: "2026-09-03T00:00:00.000Z",
      };
      const html = renderPage("software", {
        applications: [archived, descriptionMatch],
        viewMode,
      });
      expect(html.includes(archived.jobTitle)).toBe(viewMode === "archive");
      expect(html.includes(descriptionMatch.jobTitle)).toBe(viewMode === "active");
    },
  );

  it("composes search with status filters", () => {
    const html = renderPage("software", {
      applications: [{ ...titleMatch, status: "Rejected" }, descriptionMatch],
      tablePreferences: {
        ...tablePreferences,
        filters: { ...DEFAULT_APPLICATION_FILTERS, status: "Awaiting Response" },
      },
    });
    expect(html).toContain(descriptionMatch.jobTitle);
    expect(html).not.toContain(titleMatch.jobTitle);
  });

  it("composes search with needs-attention focus", () => {
    const html = renderPage("software", {
      applications: [
        titleMatch,
        { ...descriptionMatch, followUpNeeded: true, followUpDate: "2020-01-01" },
      ],
      tablePreferences: { ...tablePreferences, needsAttentionOnly: true },
    });
    expect(html).toContain(descriptionMatch.jobTitle);
    expect(html).not.toContain(titleMatch.jobTitle);
  });

  it("ignores saved searches when remembering table state is disabled", () => {
    const html = renderPage("accounting", {
      settings: { ...DEFAULT_USER_SETTINGS, rememberTableState: false },
    });
    expect(html).toContain(titleMatch.jobTitle);
    expect(html).toContain(descriptionMatch.jobTitle);
  });

  it.each(["active", "archive"] as const)(
    "treats whitespace as an empty search in the %s empty state",
    (viewMode) => {
      const html = renderPage("   ", { applications: [], viewMode });
      expect(html).toContain(
        viewMode === "archive" ? "No archived applications" : "No applications yet",
      );
      expect(html).not.toContain("No matching applications");
    },
  );
});

describe("applications page on narrow screens", () => {
  it("pairs the summary metrics at every width below xl", () => {
    expect(renderPage("")).toContain(
      'class="grid grid-cols-2 gap-3 xl:grid-cols-4"',
    );
  });

  it("renders compact cards that switch layout by container width", () => {
    const html = renderPage("");

    expect(html).toContain('class="grid gap-3 p-3 lg:grid-cols-2 xl:hidden"');
    expect(html).toContain('class="application-card ');
    expect(html).toContain('class="application-card-fields ');
    expect(html).toContain('class="application-card-field min-w-0"');
  });

  it("keeps the contacts button at its natural width in card rows", () => {
    // Card values stretch to their column so long text truncates; the
    // contacts button opts out so it does not become a full-width bar.
    expect(renderPage("")).toMatch(
      /<button class="[^"]*\bjustify-self-start\b[^"]*"[^>]*><svg[^>]*lucide-message-square-text/,
    );
  });

  it("offers Columns beside Filters as well as in the wide-toolbar footer", () => {
    const html = renderPage("");

    expect(html).toContain('class="applications-toolbar-columns-inline min-w-0"');
    expect(html).toContain('class="applications-toolbar-footer ');
    expect(html.match(/<span class="truncate">Columns<\/span>/g)).toHaveLength(2);
  });
});
