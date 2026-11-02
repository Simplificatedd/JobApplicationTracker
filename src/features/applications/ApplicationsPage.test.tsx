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

  const archivedMatch: Application = {
    ...titleMatch,
    id: "archived",
    jobTitle: "Archived Software Engineer",
    archivedAt: "2026-09-03T00:00:00.000Z",
  };
  const archivedBadge = />Archived<\/span>/;

  it.each(["active", "archive"] as const)(
    "searches active and archived applications from the %s view",
    (viewMode) => {
      const html = renderPage("software", {
        applications: [archivedMatch, descriptionMatch],
        viewMode,
      });
      expect(html).toContain(archivedMatch.jobTitle);
      expect(html).toContain(descriptionMatch.jobTitle);
      expect(html).toMatch(archivedBadge);
    },
  );

  it.each(["active", "archive"] as const)(
    "keeps the %s section split for blank searches",
    (viewMode) => {
      const html = renderPage("", {
        applications: [archivedMatch, descriptionMatch],
        viewMode,
      });
      expect(html.includes(archivedMatch.jobTitle)).toBe(viewMode === "archive");
      expect(html.includes(descriptionMatch.jobTitle)).toBe(viewMode === "active");
      expect(html).not.toMatch(archivedBadge);
    },
  );

  it.each([
    ["active", "Active only"],
    ["archive", "Archived only"],
  ] as const)(
    "shows the active search scope in the %s view",
    (viewMode, sectionLabel) => {
      const html = renderPage("software", { viewMode });
      expect(html).toContain(
        '<button aria-pressed="true" class="touch-target rounded px-2 py-0.5 font-semibold transition bg-surface text-foreground shadow-sm" type="button">Active and archived</button>',
      );
      expect(html).toContain(sectionLabel);
      expect(renderPage("", { viewMode })).not.toContain("Active and archived");
    },
  );

  it("finds applications by company name", () => {
    const html = renderPage("example company", {
      applications: [descriptionMatch, { ...titleMatch, company: "Other Co" }],
    });
    expect(html).toContain(descriptionMatch.jobTitle);
    expect(html).not.toContain(titleMatch.jobTitle);
  });

  it("explains that a cross-archive search found nothing", () => {
    expect(renderPage("accounting")).toContain(
      "No active or archived applications match",
    );
  });

  it("composes cross-archive search with status filters", () => {
    const html = renderPage("software", {
      applications: [
        { ...archivedMatch, status: "Rejected" },
        { ...titleMatch, status: "Awaiting Response" },
      ],
      tablePreferences: {
        ...tablePreferences,
        filters: { ...DEFAULT_APPLICATION_FILTERS, status: "Rejected" },
      },
    });
    expect(html).toContain(archivedMatch.jobTitle);
    expect(html).not.toContain(`>${titleMatch.jobTitle}<`);
  });

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

  it("keeps the scoped metric's label for screen readers but hides it beside the toggle on phones", () => {
    const html = renderPage("");

    expect(html).toMatch(/<p class="[^"]*\bmax-sm:sr-only\b[^"]*">Active<\/p>/);
    // Metrics without a toggle keep their visible label at every width.
    expect(html).toMatch(/<p class="min-w-0 truncate text-sm font-medium text-muted ">Needs attention<\/p>/);
  });

  it("renders compact cards that switch layout by container width", () => {
    const html = renderPage("");

    expect(html).toContain('class="hidden gap-3 p-3 md:grid lg:grid-cols-2 xl:hidden"');
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

  it("offers Columns beside Filters as well as in the wide-toolbar footer, but not on phones", () => {
    const html = renderPage("");

    expect(html).toContain('class="applications-toolbar-columns-inline min-w-0 max-md:hidden"');
    expect(html).toMatch(/class="applications-toolbar-footer [^"]*max-md:hidden"/);
    expect(html).toContain('class="applications-toolbar-footer ');
    expect(html.match(/<span class="truncate">Columns<\/span>/g)).toHaveLength(2);
  });
});

describe("applications page on phones", () => {
  const phoneRows = (html: string) =>
    /<ul class="divide-y divide-border md:hidden">([\s\S]*?)<\/ul>/.exec(html)?.[1] ?? "";
  const rowTexts = (html: string) =>
    [...phoneRows(html).matchAll(/<li>([\s\S]*?)<\/li>/g)].map((match) =>
      match[1].replace(/<[^>]+>/g, "|").replace(/\|+/g, "|").replace(/^\||\|$/g, ""),
    );

  it("shows company, status, title and details as read-only rows", () => {
    const html = renderPage("", {
      applications: [
        { ...titleMatch, dateApplied: "2026-10-20", location: "Singapore", workMode: "hybrid" },
      ],
    });

    expect(rowTexts(html)).toEqual([
      "Example Company|Awaiting Response|Software Engineer|Applied 20 Oct 2026 · Singapore · Hybrid",
    ]);
    expect(phoneRows(html)).not.toMatch(/<(input|select)|role="menu/);
  });

  it("leaves out missing optional fields and falls back to the job title", () => {
    const html = renderPage("", {
      applications: [{ ...titleMatch, company: "" }],
    });

    expect(rowTexts(html)).toEqual(["Software Engineer|Awaiting Response"]);
  });

  it("shows the next event with its own scheduled time", () => {
    const html = renderPage("", {
      applications: [{ ...titleMatch, status: "Interviewing" }],
      interviews: [
        {
          id: "interview-1",
          applicationId: titleMatch.id,
          dateTime: "2026-11-05T14:30",
          mode: "video",
          proctored: false,
          round: 1,
          type: "technical-interview",
          createdAt: titleMatch.createdAt,
          updatedAt: titleMatch.updatedAt,
        },
      ],
      now: new Date(2026, 10, 2, 12, 0),
    });

    expect(rowTexts(html)[0]).toContain("Interview · 05 Nov 2026, 02:30 pm");
  });

  it("marks archived results in a cross-archive search", () => {
    const html = renderPage("engineer", {
      applications: [{ ...titleMatch, archivedAt: "2026-10-01T00:00:00.000Z" }],
    });

    expect(rowTexts(html)[0]).toContain("Archived");
  });

  it.each([
    ["no applications", { applications: [] }, "No applications yet"],
    ["no archived applications", { applications: [], viewMode: "archive" as const }, "No archived applications"],
    [
      "filters with no match",
      {
        tablePreferences: {
          ...tablePreferences,
          searchQuery: "",
          filters: { ...DEFAULT_APPLICATION_FILTERS, status: "Offered" as const },
        },
      },
      "No applications match these filters",
    ],
  ])("explains an empty list with %s", (_case, overrides, title) => {
    expect(renderPage("", overrides)).toContain(title);
  });

  it("explains an empty search", () => {
    expect(renderPage("zzzz")).toContain("No matching applications");
  });

  it("offers sorting beside Filters", () => {
    expect(renderPage("")).toMatch(/<div class="min-w-0 md:hidden"><label[\s\S]*?Sort applications/);
  });
});
