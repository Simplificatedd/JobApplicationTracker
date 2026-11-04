import { renderToStaticMarkup } from "react-dom/server";
import { BarChart3 } from "lucide-react";
import { describe, expect, it } from "vitest";
import { ChartCard } from "./charts";

const views = ["bars", "table"].map((id) => ({
  icon: BarChart3,
  id,
  label: id,
  render: () => null,
}));

function headerTag(markup: string) {
  return markup.slice(markup.indexOf("<header"), markup.indexOf(">", markup.indexOf("<header")) + 1);
}

describe("chart card header on phones", () => {
  it("wraps the controls below the title when a card has an extra action", () => {
    const markup = renderToStaticMarkup(
      <ChartCard action={<button type="button">Include not set</button>} title="Response rate by source" views={views} />,
    );

    expect(headerTag(markup)).toContain("max-sm:flex-wrap");
  });

  it("keeps the view switcher beside the title when there is no extra action", () => {
    const markup = renderToStaticMarkup(<ChartCard title="Applications over time" views={views} />);

    expect(headerTag(markup)).not.toContain("max-sm:flex-wrap");
  });
});
