import type { ComponentProps, ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_SETTINGS } from "../../lib/domain";
import type { Application } from "../../types/application";
import type { TablePreferences } from "../../types/tablePreferences";
import { ApplicationsPage } from "./ApplicationsPage";
import { ApplicationsToolbar } from "./ApplicationsToolbar";
import { ApplicationsTable, DEFAULT_COLUMN_WIDTHS } from "./ApplicationsTable";
import {
  DEFAULT_APPLICATION_FILTERS,
  DEFAULT_SORT_STATE,
} from "./applicationFilters";

// Run the page's handlers and effects; let its children use real React during
// static rendering, following the hook-host pattern in the sidebar tests.
const host = vi.hoisted(() => ({ active: false, cursor: 0, slots: [] as unknown[], effects: [] as (() => void)[] }));
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useState(initial: unknown) {
      if (!host.active) return react.useState(initial);
      const i = host.cursor++;
      if (!(i in host.slots)) host.slots[i] = typeof initial === "function" ? initial() : initial;
      return [host.slots[i], (value: unknown) => { host.slots[i] = typeof value === "function" ? value(host.slots[i]) : value; }];
    },
    useMemo: (calculate: () => unknown, deps: unknown[]) => host.active ? calculate() : react.useMemo(calculate, deps),
    useEffect(effect: () => void, deps: unknown[]) {
      if (!host.active) return react.useEffect(effect, deps);
      const i = host.cursor++;
      const previous = host.slots[i] as unknown[] | undefined;
      if (previous && deps.every((value, index) => Object.is(value, previous[index]))) return;
      host.slots[i] = deps;
      host.effects.push(effect);
    },
  };
});

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

function mountPage(
  overrides: Partial<ComponentProps<typeof ApplicationsPage>> = {},
) {
  host.slots = [];
  const element = (
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
      tablePreferences={tablePreferences}
      resetTablePreferences={vi.fn()}
      updateContact={vi.fn()}
      updateInterview={vi.fn()}
      updateApplication={vi.fn()}
      updateSettings={vi.fn()}
      updateTablePreferences={vi.fn()}
      {...overrides}
    />
  );
  const props = { ...element.props } as ComponentProps<typeof ApplicationsPage>;
  const render = () => {
    host.cursor = 0;
    host.active = true;
    let tree;
    try {
      tree = ApplicationsPage(props);
    } finally {
      host.active = false;
    }
    host.effects.splice(0).forEach((effect) => effect());
    return tree;
  };
  return { props, render };
}

function toolbar(tree: ReturnType<typeof ApplicationsPage>) {
  return tree.props.children.find((child: ReactElement) => child?.type === ApplicationsToolbar)
    .props as ComponentProps<typeof ApplicationsToolbar>;
}

function renderPage(
  query: string,
  overrides: Partial<ComponentProps<typeof ApplicationsPage>> = {},
) {
  const page = mountPage(overrides);
  toolbar(page.render()).onSearchQueryChange!(query);
  return renderToStaticMarkup(page.render());
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

describe("remembered table view", () => {
  it.each([true, false])("starts with an empty search when remembering is %s", (rememberTableState) => {
    const page = mountPage({
      settings: { ...DEFAULT_USER_SETTINGS, rememberTableState },
      tablePreferences: { ...tablePreferences, searchQuery: "accounting" },
    });
    const tree = page.render();
    expect(toolbar(tree).searchQuery).toBe("");
    const html = renderToStaticMarkup(tree);
    expect(html).toContain(titleMatch.jobTitle);
    expect(html).toContain(descriptionMatch.jobTitle);
  });

  it("keeps search through view switches and cloud updates, but clears it on remount", () => {
    const page = mountPage();
    toolbar(page.render()).onSearchQueryChange!("engineer");
    expect(toolbar(page.render()).searchQuery).toBe("engineer");
    page.props.viewMode = "archive";
    page.props.tablePreferences = { ...tablePreferences, searchQuery: "remote search" };
    expect(toolbar(page.render()).searchQuery).toBe("engineer");
    page.props.viewMode = "active";
    expect(toolbar(page.render()).searchQuery).toBe("engineer");

    expect(toolbar(mountPage(page.props).render()).searchQuery).toBe("");
  });

  it("remembers other preferences while saving an empty search and avoids saving on keystrokes", () => {
    const updateTablePreferences = vi.fn();
    const preferences: TablePreferences = {
      ...tablePreferences,
      columnWidths: { jobTitle: 320 },
      filters: { ...DEFAULT_APPLICATION_FILTERS, status: "Rejected" },
      needsAttentionOnly: true,
      sort: { column: "company", direction: "ascending" },
    };
    const page = mountPage({ tablePreferences: preferences, updateTablePreferences });
    const tree = page.render();
    expect(toolbar(tree)).toMatchObject({
      filters: preferences.filters,
      needsAttentionOnly: true,
      sort: preferences.sort,
    });
    expect(updateTablePreferences).toHaveBeenCalledExactlyOnceWith({
      ...preferences,
      columnWidths: expect.objectContaining(preferences.columnWidths),
      searchQuery: "",
    });

    toolbar(tree).onSearchQueryChange!("engineer");
    toolbar(page.render()).onSearchQueryChange!("software");
    toolbar(page.render()).onFilterChange!({ company: "Example Company" });
    page.render();
    expect(updateTablePreferences).toHaveBeenCalledTimes(2);
    expect(updateTablePreferences).toHaveBeenLastCalledWith(expect.objectContaining({
      searchQuery: "",
      filters: { ...preferences.filters, company: "Example Company" },
    }));
  });

  it("does not save preferences when remembering is disabled", () => {
    const updateTablePreferences = vi.fn();
    const page = mountPage({
      settings: { ...DEFAULT_USER_SETTINGS, rememberTableState: false },
      updateTablePreferences,
    });
    toolbar(page.render()).onSearchQueryChange!("engineer");
    page.render();
    expect(updateTablePreferences).not.toHaveBeenCalled();
  });
});

describe("applications page on narrow screens", () => {
  it("pairs the summary metrics at every width below xl", () => {
    expect(renderPage("")).toContain(
      'class="grid grid-cols-2 gap-3 max-md:gap-2 xl:grid-cols-4"',
    );
  });

  it("keeps the scoped metric's label for screen readers but hides it beside the toggle on phones", () => {
    const html = renderPage("");

    expect(html).toMatch(/<p class="[^"]*\bmax-sm:sr-only\b[^"]*">Active<\/p>/);
    // Metrics without a toggle keep their visible label at every width.
    expect(html).toMatch(/<p class="(?![^"]*sr-only)min-w-0 truncate text-sm font-medium text-muted[^"]*">Needs attention<\/p>/);
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

  it("offers Columns inline at every toolbar width, but not on phones", () => {
    const html = renderPage("");

    expect(html).toContain('class="applications-toolbar-columns-inline min-w-0 max-md:hidden"');
    expect(html).not.toContain("applications-toolbar-footer");
    expect(html.match(/<span class="truncate">Columns<\/span>/g)).toHaveLength(1);
  });
});

it("resets only column widths from the toolbar when resizing is enabled", () => {
  const page = mountPage({
    settings: { ...DEFAULT_USER_SETTINGS, enableDraggableColumnWidths: true },
    tablePreferences: { ...tablePreferences, columnWidths: { company: 400 } },
  });
  toolbar(page.render()).onSearchQueryChange!("engineer");
  toolbar(page.render()).onResetColumnWidths!();
  const tree = page.render();
  const table = tree.props.children.find((child: ReactElement) => child?.type === ApplicationsTable);
  expect(table.props.columnWidths).toEqual(DEFAULT_COLUMN_WIDTHS);
  expect(toolbar(tree).searchQuery).toBe("engineer");
  expect(page.props.resetTablePreferences).not.toHaveBeenCalled();

  const disabled = mountPage({ settings: { ...DEFAULT_USER_SETTINGS, enableDraggableColumnWidths: false } });
  expect(toolbar(disabled.render()).onResetColumnWidths).toBeUndefined();
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

  it("finds the next event beyond the attention window and with interview attention off", () => {
    const html = renderPage("", {
      applications: [{ ...titleMatch, status: "Interviewing", followUpDate: "2026-11-20" }],
      interviews: [
        {
          id: "interview-1",
          applicationId: titleMatch.id,
          dateTime: "2026-11-30T09:00",
          mode: "video",
          proctored: false,
          round: 1,
          type: "technical-interview",
          createdAt: titleMatch.createdAt,
          updatedAt: titleMatch.updatedAt,
        },
      ],
      now: new Date(2026, 10, 2, 12, 0),
      settings: { ...DEFAULT_USER_SETTINGS, dueSoonDays: 3, includeUpcomingInterviewsInAttention: false },
    });

    expect(rowTexts(html)[0]).toContain("Follow up · 20 Nov 2026");
  });

  it("shows no event for archived applications", () => {
    const html = renderPage("engineer", {
      applications: [{ ...titleMatch, archivedAt: "2026-10-01T00:00:00.000Z", followUpDate: "2026-11-20" }],
      now: new Date(2026, 10, 2, 12, 0),
    });

    expect(rowTexts(html)[0]).not.toContain("Follow up");
  });

  it("explains an empty list filtered only by company", () => {
    const html = renderPage("", {
      tablePreferences: {
        ...tablePreferences,
        searchQuery: "",
        filters: { ...DEFAULT_APPLICATION_FILTERS, company: "Nobody Inc" },
      },
    });

    expect(html).toContain("No applications match these filters");
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

describe("compact phone summary", () => {
  const summary = (html: string) => {
    const start = html.indexOf("<section");
    return html.slice(start, html.indexOf("</section>", start));
  };
  const classesOf = (html: string, pattern: RegExp) =>
    [...html.matchAll(pattern)].map((match) => match[1].split(" "));

  it("puts each value beside its label with tighter spacing below md", () => {
    const tiles = classesOf(summary(renderPage("")), /<div class="(surface-panel[^"]*)"/g);

    expect(tiles).toHaveLength(4);
    for (const classes of tiles) {
      expect(classes).toEqual(expect.arrayContaining([
        "px-4", "py-3", "max-md:flex", "max-md:flex-wrap", "max-md:px-3", "max-md:py-2",
      ]));
    }
  });

  it("shrinks values and lets labels wrap on phones only", () => {
    const html = summary(renderPage(""));
    const values = classesOf(html, /<p class="(mt-1 text-2xl[^"]*)"/g);
    const labels = classesOf(html, /<p class="(min-w-0 truncate[^"]*)"/g);

    expect(values).toHaveLength(4);
    for (const classes of values) expect(classes).toEqual(expect.arrayContaining(["text-2xl", "max-md:text-xl", "max-md:mt-0"]));
    expect(labels).toHaveLength(4);
    for (const classes of labels) expect(classes).toEqual(expect.arrayContaining(["truncate", "max-md:whitespace-normal"]));
  });

  it("keeps all four values, their labels and the count scope toggle", () => {
    const html = summary(renderPage(""));

    for (const label of ["Needs attention", "Interviews", "Assessments"]) expect(html).toContain(`>${label}</p>`);
    expect(html).toContain('aria-label="Application count scope"');
    expect(html.match(/text-2xl/g)).toHaveLength(4);
  });
});

describe("phone list toolbar", () => {
  const classesOf = (html: string, marker: string) => {
    const index = html.indexOf(marker);
    const tagStart = html.lastIndexOf("<", index);
    return (/class="([^"]*)"/.exec(html.slice(tagStart, html.indexOf(">", index) + 1))?.[1] ?? "").split(" ");
  };

  it("gives search, Filters and sort 44px on phones and keeps 40px from md", () => {
    const html = renderPage("");
    // The sort and filter selects share one select style.
    const selects = [...html.matchAll(/<select class="([^"]*appearance-none[^"]*)"/g)].map((match) => match[1].split(" "));

    expect(selects.length).toBeGreaterThan(0);
    for (const classes of [
      classesOf(html, 'type="search"'),
      classesOf(html, 'aria-haspopup="dialog"'),
      ...selects,
    ]) {
      expect(classes).toEqual(expect.arrayContaining(["h-10", "max-md:h-11"]));
    }
  });
});

describe("application entries across layouts (#217)", () => {
  it("marks the phone row, card and table row of each application for focus fallback", () => {
    const html = renderPage("");
    for (const id of [titleMatch.id, descriptionMatch.id]) {
      const marked = html.match(new RegExp(`<(\\w+)[^>]*data-application-id="${id}"`, "g")) ?? [];
      expect(marked.map((tag) => tag.slice(1, tag.indexOf(" "))).sort()).toEqual(["article", "button", "tr"]);
    }
  });
});
