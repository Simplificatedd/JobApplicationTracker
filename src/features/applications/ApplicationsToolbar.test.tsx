import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { APPLICATION_TABLE_COLUMNS } from "./ApplicationsTable";
import { ColumnsModal, SearchScopeToggle } from "./ApplicationsToolbar";

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
