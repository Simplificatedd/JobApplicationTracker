import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { APPLICATION_TABLE_COLUMNS } from "./ApplicationsTable";
import { ColumnsModal, PhoneSortSelect, SearchScopeToggle } from "./ApplicationsToolbar";
import { DEFAULT_SORT_STATE } from "./applicationFilters";

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

type ToggleElement = {
  props: { children?: unknown; onClick?: () => void; "aria-pressed"?: boolean };
  type: unknown;
};

function toggleButtons(node: unknown): ToggleElement[] {
  if (Array.isArray(node)) return node.flatMap(toggleButtons);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ToggleElement;
  return [
    ...(element.type === "button" ? [element] : []),
    ...toggleButtons(element.props.children),
  ];
}

describe("Search scope toggle", () => {
  it.each([
    ["active", "Active only"],
    ["archive", "Archived only"],
  ] as const)(
    "switches between all applications and the %s section",
    (viewMode, sectionLabel) => {
      const onChange = vi.fn();
      const buttons = toggleButtons(
        SearchScopeToggle({ onChange, scope: "all", viewMode }),
      );

      expect(buttons.map((button) => button.props.children)).toEqual([
        "Active and archived",
        sectionLabel,
      ]);
      expect(buttons.map((button) => button.props["aria-pressed"])).toEqual([
        true,
        false,
      ]);
      buttons[1].props.onClick?.();
      expect(onChange).toHaveBeenCalledWith("section");
      buttons[0].props.onClick?.();
      expect(onChange).toHaveBeenLastCalledWith("all");
    },
  );
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
    expect(css).toMatch(/max-width:\s*767\.98px\)\s*\{[^}]*html:has\(\.applications-filter-dialog\[open\]\)\s*\{\s*overflow:\s*hidden/);
  });
});
