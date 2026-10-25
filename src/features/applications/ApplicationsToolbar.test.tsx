import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { APPLICATION_TABLE_COLUMNS } from "./ApplicationsTable";
import { ColumnsModal } from "./ApplicationsToolbar";

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
