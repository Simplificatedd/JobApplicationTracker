import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { APPLICATION_TABLE_COLUMNS } from "./ApplicationsTable";
import { ColumnsModal, PhoneSortSelect, SearchScopeToggle } from "./ApplicationsToolbar";
import { DEFAULT_SORT_STATE } from "./applicationFilters";

function renderColumnsModal() {
  return renderToStaticMarkup(
    <ColumnsModal
      onChange={vi.fn()}
      onClose={vi.fn()}
      visibleApplicationColumns={["company"]}
    />,
  );
}

describe("Columns dialog", () => {
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
      "Recently updated",
      "Applied, newest first",
      "Applied, oldest first",
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
