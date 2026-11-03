import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StackedShareBar } from "./charts";
import { RadarChart, TreemapChart } from "./chartViews";

const data = [{ label: "Alpha", value: 3 }, { label: "Beta", value: 2 }, { label: "Gamma", value: 1 }];
const verb = '<span class="touch:hidden">hover</span><span class="hidden touch:inline">tap</span>';

describe("chart hints on touch screens", () => {
  it.each([
    ["treemap", () => <TreemapChart colorFor={() => "#123456"} data={data} />, " a tile for details"],
    ["radar", () => <RadarChart color="#123456" data={data} />, " a point"],
    ["share strip", () => <StackedShareBar colorFor={() => "#123456"} data={data} />, " the strip for a breakdown"],
  ])("the %s hint says tap on touch screens and hover for mice", (_name, chart, rest) => {
    expect(renderToStaticMarkup(chart())).toContain(`${verb}${rest}`);
  });
});
