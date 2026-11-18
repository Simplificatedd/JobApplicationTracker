import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { APPLICATION_TABLE_COLUMNS } from "./ApplicationsTable";
import {
  ApplicationsToolbar,
  ColumnsModal,
  MoreFiltersModal,
  PhoneSortSelect,
} from "./ApplicationsToolbar";
import type { ApplicationFilters } from "./applicationFilters";
import { DEFAULT_APPLICATION_FILTERS, DEFAULT_SORT_STATE } from "./applicationFilters";

function renderColumnsModal(onResetColumnWidths?: () => void) {
  return renderToStaticMarkup(
    <ColumnsModal
      onChange={vi.fn()}
      onClose={vi.fn()}
      onResetColumnWidths={onResetColumnWidths}
      visibleApplicationColumns={["company"]}
    />,
  );
}

describe("Columns dialog", () => {
  it("offers size reset only when resizing is enabled", () => {
    expect(renderColumnsModal(vi.fn())).toContain("Reset column sizes");
    expect(renderColumnsModal()).not.toContain("Reset column sizes");
  });

  it("labels every column checkbox with its column name", () => {
    const markup = renderColumnsModal();
    const checkboxIds = [...markup.matchAll(/<input[^>]*type="checkbox"[^>]*>/g)].map(
      ([input]) => /id="([^"]+)"/.exec(input)?.[1],
    );

    expect(checkboxIds).toHaveLength(APPLICATION_TABLE_COLUMNS.length);
    APPLICATION_TABLE_COLUMNS.forEach((column, index) => {
      const id = checkboxIds[index];

      expect(id).toBeTruthy();
      expect(markup).toContain(`for="${id}">${column.label}</label>`);
    });
  });

  it("keeps the info button out of the label so it cannot become the label's control", () => {
    const labels = renderColumnsModal().match(/<label[\s\S]*?<\/label>/g) ?? [];

    expect(labels).toHaveLength(APPLICATION_TABLE_COLUMNS.length);
    labels.forEach((label) => {
      expect(label).not.toMatch(/<(button|input|select|textarea)\b/);
    });
  });

  it("still offers a tappable description for each column", () => {
    const markup = renderColumnsModal();

    expect(markup.match(/<button aria-expanded="false"/g)).toHaveLength(
      APPLICATION_TABLE_COLUMNS.length,
    );
  });
});

describe("phone sort control", () => {
  it("lists the phone sorts with the current one selected", () => {
    const markup = renderToStaticMarkup(
      <PhoneSortSelect onChange={vi.fn()} sort={{ column: "company", direction: "ascending" }} />,
    );

    expect([...markup.matchAll(/<option[^>]*>([^<]+)<\/option>/g)].map((match) => match[1])).toEqual([
      "Last updated",
      "Newest applied",
      "Oldest applied",
      "Company A–Z",
      "Job title A–Z",
      "Status",
    ]);
    expect(markup).toMatch(/value="company:ascending" selected=""/);
  });

  it("keeps a table-only sort visible until another is chosen", () => {
    const onChange = vi.fn();
    const element = PhoneSortSelect({
      onChange,
      sort: { column: "priority", direction: "descending" },
    });

    expect(renderToStaticMarkup(element)).toMatch(/<option disabled="" value="priority:descending" selected="">Table sort<\/option>/);
    (element.props.onChange as (value: string) => void)("updatedAt:descending");
    expect(onChange).toHaveBeenCalledWith(DEFAULT_SORT_STATE);
  });
});

describe("phone filter dialog footer", () => {
  it("gives Reset and Done 44px on phones", () => {
    // The dialog only renders after Filters is pressed, so check the source.
    const source = readFileSync(new URL("./ApplicationsToolbar.tsx", import.meta.url), "utf8");
    const start = source.indexOf("<footer", source.indexOf("function MoreFiltersModal"));
    const footer = source.slice(start, source.indexOf("</footer>", start));
    // Each footer button's class list, found by the button's own label.
    const buttonClasses = (label: string) => {
      const button = footer.slice(footer.lastIndexOf("<button", footer.indexOf(label)));
      return /className="([^"]*)"/.exec(button)?.[1].split(" ") ?? [];
    };

    for (const label of ["Reset", "Done"]) {
      expect(buttonClasses(label)).toEqual(expect.arrayContaining(["h-10", "max-md:h-11"]));
    }
  });
});

describe("phone filter dialog scroll lock", () => {
  it("marks the Filters dialog and locks the page behind it below md only", () => {
    const toolbar = readFileSync(new URL("./ApplicationsToolbar.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
    const filters = toolbar.slice(toolbar.indexOf("function MoreFiltersModal"));

    // The dialog only renders after Filters is pressed, so check the source.
    expect(filters.slice(0, filters.indexOf("</NativeModal>"))).toMatch(/<NativeModal\s+className="applications-filter-dialog /);
    expect(css).toMatch(/not all and \(min-width:\s*768px\)\s*\{[^}]*html:has\(\.applications-filter-dialog\[open\]\)\s*\{\s*overflow:\s*hidden/);
  });
});

function renderFiltersModal(filters: Partial<ApplicationFilters> = {}, needsAttentionOnly = false) {
  return renderToStaticMarkup(
    <MoreFiltersModal
      companyOptions={["Acme"]}
      currentFilters={{ ...DEFAULT_APPLICATION_FILTERS, ...filters }}
      locationOptions={["Singapore"]}
      needsAttentionOnly={needsAttentionOnly}
      onClose={vi.fn()}
    />,
  );
}

// Each select's label text, and whether it is visible.
const selectLabels = (markup: string) =>
  [...markup.matchAll(/<label class="relative block min-w-0"><span class="([^"]*)">([^<]*)<\/span>/g)].map(
    ([, className, label]) => ({ label, visible: className !== "sr-only" }),
  );

describe("Filters dialog labels (#258)", () => {
  it("shows every field's name above its select, even once a value is picked", () => {
    const labels = selectLabels(renderFiltersModal({ company: "Acme", priority: "high" }));

    expect(labels).toHaveLength(24);
    expect(labels.filter((field) => !field.visible)).toEqual([]);
    expect(labels.map((field) => field.label)).toEqual(
      expect.arrayContaining(["Company", "Priority", "Status", "Role end date"]),
    );
  });

  it("keeps the inline toolbar filters' labels for screen readers only", () => {
    const labels = selectLabels(
      renderToStaticMarkup(
        <ApplicationsToolbar
          companyOptions={[]}
          filters={DEFAULT_APPLICATION_FILTERS}
          locationOptions={[]}
          needsAttentionOnly={false}
          searchQuery=""
          sort={DEFAULT_SORT_STATE}
          visibleApplicationColumns={[]}
        />,
      ),
    );

    expect(labels.length).toBeGreaterThan(0);
    expect(labels.filter((field) => field.visible)).toEqual([]);
  });
});

describe("Filters dialog layout (#258)", () => {
  const common = ["Company", "Location", "Applied date", "Job type", "Work mode", "Last updated"];
  const commonKeys = ["company", "location", "dateApplied", "jobType", "workMode", "updatedAt"];
  const moreSection = (markup: string) => markup.slice(markup.indexOf("<details"), markup.indexOf("</details>"));
  const isOpen = (markup: string) => /<details class="[^"]*" open="">/.test(markup);

  it("puts Needs attention and the common filters before More filters", () => {
    const markup = renderFiltersModal();
    const beforeMore = markup.slice(0, markup.indexOf("<details"));

    expect(beforeMore.indexOf("Needs attention")).toBeLessThan(beforeMore.indexOf(">Company<"));
    expect(selectLabels(beforeMore).map((field) => field.label)).toEqual(common);
    expect(moreSection(markup)).toMatch(/<summary[^>]*>More filters</);
    expect(selectLabels(moreSection(markup))).toHaveLength(18);
  });

  it("starts closed unless a filter inside it is already active", () => {
    expect(isOpen(renderFiltersModal())).toBe(false);
    expect(isOpen(renderFiltersModal({ company: "Acme" }, true))).toBe(false);

    for (const key of Object.keys(DEFAULT_APPLICATION_FILTERS) as (keyof ApplicationFilters)[]) {
      expect(isOpen(renderFiltersModal({ [key]: "x" })), key).toBe(!commonKeys.includes(key));
    }
  });
});

describe("More filters focus ring (#258)", () => {
  it("gives the summary the same focus ring as other controls", () => {
    const css = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

    expect(css).toMatch(/summary:focus-visible,[^{]*\{\s*outline: none;\s*box-shadow: var\(--focus-ring\);/);
  });
});
