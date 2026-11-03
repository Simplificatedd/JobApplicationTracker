import { type ReactElement, isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Charts keep their hovered item in useState(null) and measure their width in
// useState(0); stand in for both so the handlers run without a DOM.
const state = vi.hoisted(() => ({ setActive: vi.fn() }));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useRef: () => ({ current: null }),
  useId: () => "test-id",
  useState: (initial: unknown) => {
    if (initial === 0) return [640, vi.fn()];
    if (initial === null) return [null, state.setActive];
    return [typeof initial === "function" ? (initial as () => unknown)() : initial, vi.fn()];
  },
  useEffect: () => {},
}));
import { HorizontalBarChart, StackedShareBar } from "./charts";
import { ColumnChart } from "./ColumnChart";
import { MultiSeriesChart } from "./MultiSeriesChart";
import { TimeSeriesChart } from "./TimeSeriesChart";
import { DonutChart } from "./DonutChart";
import { RadarChart, RadialBarChart, StackedColumnChart, TreemapChart, WaffleChart } from "./chartViews";

type Element = ReactElement<Record<string, unknown>>;
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children)];
}

const data = [{ label: "Alpha", value: 3 }, { label: "Beta", value: 2 }, { label: "Gamma", value: 1 }];
const colorFor = () => "#123456";
const charts = [
  ["treemap", () => TreemapChart({ colorFor, data })],
  ["waffle", () => WaffleChart({ colorFor, data })],
  ["radial bars", () => RadialBarChart({ colorFor, data })],
  ["radar", () => RadarChart({ color: "#123456", data })],
  ["stacked columns", () => StackedColumnChart({
    formatLabel: (label: string) => label, labels: ["Mon", "Tue", "Wed"],
    series: [{ color: "#123456", id: "a", label: "A", values: [1, 2, 3] }],
  })],
  ["columns", () => ColumnChart({ colorFor, data })],
  ["donut", () => DonutChart({ colorFor, data, totalLabel: "applications" })],
  ["horizontal bars", () => HorizontalBarChart({ colorFor, data })],
  ["share strip", () => StackedShareBar({ colorFor, data })],
] as const;

beforeEach(() => state.setActive.mockClear());

describe.each(charts)("%s on touch screens", (_name, render) => {
  const leaveHandlers = () =>
    elements(render()).filter((element) => typeof element.props.onPointerLeave === "function");

  it("keeps a tapped item's details when a finger or pen lifts", () => {
    const handlers = leaveHandlers();
    expect(handlers.length).toBeGreaterThan(0);
    for (const element of handlers) {
      const currentTarget = {};
      const call = (name: string, event: object) => (element.props[name] as (event: object) => void)({ currentTarget, ...event });
      call("onPointerLeave", { pointerType: "touch", timeStamp: 10 });
      // A pen without hover lifts and leaves in one burst.
      call("onPointerUp", { pointerType: "pen", timeStamp: 1000 });
      call("onPointerLeave", { pointerType: "pen", timeStamp: 1003 });
    }
    expect(state.setActive).not.toHaveBeenCalled();
  });

  it("clears on mouse leave and when a scroll cancels the pointer", () => {
    const [element] = leaveHandlers();
    (element.props.onPointerLeave as (event: { pointerType: string }) => void)({ pointerType: "mouse" });
    (element.props.onPointerCancel as () => void)();
    expect(state.setActive.mock.calls).toEqual([[null], [null]]);
  });
});

describe("activity heatmap on touch screens", () => {
  it("keeps a tapped day's summary when the finger lifts and clears for a mouse", async () => {
    const { AnalyticsPage } = await import("./AnalyticsPage");
    const { DEFAULT_ANALYTICS_SETTINGS, DEFAULT_USER_SETTINGS } = await import("../../lib/domain");
    const { application } = await import("../../test/assessmentFixtures");
    // Function components aren't rendered by this harness; call the ones on
    // the way down to the heatmap by name.
    const callNamed = (tree: unknown, name: string) => {
      const element = elements(tree).find((e) => typeof e.type === "function" && e.type.name === name)!;
      return (element.type as (props: unknown) => unknown)(element.props);
    };
    const page = AnalyticsPage({
      activities: [], analyticsSettings: { ...DEFAULT_ANALYTICS_SETTINGS, visibleCharts: ["activityCalendar"] },
      applications: [{ ...application, dateApplied: "2026-09-20" }], assessments: [], interviews: [],
      onUpdateAnalyticsSettings: vi.fn(), userSettings: DEFAULT_USER_SETTINGS,
    });
    const heatmap = callNamed(callNamed(page, "ActivityCalendar"), "ActivityHeatmap");
    const day = elements(heatmap).find((e) => e.type === "button" && typeof e.props.onPointerLeave === "function")!;

    (day.props.onPointerLeave as (event: { pointerType: string }) => void)({ pointerType: "touch" });
    expect(state.setActive).not.toHaveBeenCalled();
    (day.props.onPointerLeave as (event: { pointerType: string }) => void)({ pointerType: "mouse" });
    expect(state.setActive).toHaveBeenCalledWith(null);
  });
});

const periods = [
  { label: "2026-10-01", value: 1 }, { label: "2026-10-02", value: 4 }, { label: "2026-10-03", value: 2 },
];
describe.each([
  ["applications over time", () => TimeSeriesChart({ data: periods, grouping: "daily", seriesLabel: "Applications" })],
  ["activity comparison", () => MultiSeriesChart({
    grouping: "daily", series: [{ color: "#123456", data: periods, id: "applications", label: "Applications" }],
  })],
] as const)("%s on touch screens", (_name, render) => {
  const group = () => elements(render()).find((element) => element.props.role === "group")!;

  it("picks the tapped period on press and keeps it when the finger lifts", () => {
    const chart = group();
    const press = {
      clientX: 10_000,
      currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 200 }) },
    };

    (chart.props.onPointerDown as (event: unknown) => void)(press);
    // Far right of the plot is the last period.
    expect(state.setActive).toHaveBeenLastCalledWith(2);
    (chart.props.onPointerLeave as (event: { pointerType: string }) => void)({ pointerType: "touch" });
    expect(state.setActive).toHaveBeenCalledTimes(1);
  });

  it("still clears for a mouse and on pointer cancel", () => {
    const chart = group();
    (chart.props.onPointerLeave as (event: { pointerType: string }) => void)({ pointerType: "mouse" });
    (chart.props.onPointerCancel as () => void)();
    expect(state.setActive.mock.calls).toEqual([[null], [null]]);
  });
});
