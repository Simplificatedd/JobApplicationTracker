import { type ReactElement, isValidElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  effects: [] as (() => void | (() => void))[],
  setters: [] as ReturnType<typeof vi.fn>[],
}));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useRef: () => ({ current: null }),
  useId: () => "test-gradient",
  useState: (initial: unknown) => {
    const setter = vi.fn();
    hooks.setters.push(setter);
    return [initial, setter];
  },
  useEffect: (effect: () => void | (() => void)) => hooks.effects.push(effect),
}));
import { TimeSeriesChart } from "./TimeSeriesChart";
import { MultiSeriesChart } from "./MultiSeriesChart";
import { FlowChart, TreemapChart } from "./chartViews";

// Effects run after React attaches refs. Check that the empty render has a real
// measurement target at the same DOM position as the populated render.
function measuredElement(node: unknown, path = "root"): { element: ReactElement; path: string; ref: { current: unknown } } | undefined {
  if (Array.isArray(node)) {
    return node.map((child, index) => measuredElement(child, `${path}.${index}`)).find(Boolean);
  }
  if (!isValidElement<{ children?: unknown }>(node)) return;
  const ref = (node as ReactElement & { ref?: { current: unknown } }).ref;
  if (ref) return { element: node, path, ref };
  const children = node.props.children;
  return measuredElement(Array.isArray(children) ? children : [children], `${path}.children`);
}

afterEach(() => {
  hooks.effects = [];
  hooks.setters = [];
  vi.unstubAllGlobals();
});

const data = [{ label: "2026-10-01", value: 2 }];
const charts = [
  { name: "time series", render: (empty: boolean) => TimeSeriesChart({
    data: empty ? [] : data, grouping: "daily", seriesLabel: "Applications",
  }) },
  { name: "multi series", render: (empty: boolean) => MultiSeriesChart({
    grouping: "daily", series: [{ id: "applications", label: "Applications", color: "blue", data: empty ? [] : data }],
  }) },
  { name: "treemap", render: (empty: boolean) => TreemapChart({
    data: empty ? [] : data, colorFor: () => "#123456",
  }) },
  { name: "status flow", render: (empty: boolean) => FlowChart({
    links: empty ? [] : [{ from: "Awaiting Response", to: "Interviewing", value: 2 }],
    order: ["Awaiting Response", "Interviewing"], colorFor: () => "#123456",
  }) },
];

describe.each(charts)("$name measurement", ({ render }) => {
  it("keeps its measured DOM position through empty/populated transitions", () => {
    const empty = measuredElement(render(true));
    const populated = measuredElement(render(false));
    const emptyAgain = measuredElement(render(true));
    expect(empty?.element.type).toBe("div");
    expect(populated?.path).toBe(empty?.path);
    expect(emptyAgain?.path).toBe(empty?.path);
    expect(populated?.element.type).toBe(empty?.element.type);
  });

  it("measures its initially empty target and disconnects on unmount", () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    let resize: () => void = () => {};
    const observe = vi.fn(), disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { resize = callback; }
      observe = observe;
      disconnect = disconnect;
    });
    const target = measuredElement(render(true))!;
    const element = { clientWidth: 640 };
    target.ref.current = element;
    const cleanups = hooks.effects.map(effect => effect());
    expect(observe).toHaveBeenCalledExactlyOnceWith(element);
    expect(hooks.setters.some(setter => setter.mock.calls.some(([width]) => width === 640))).toBe(true);
    element.clientWidth = 320;
    resize();
    expect(hooks.setters.some(setter => setter.mock.calls.some(([width]) => width === 320))).toBe(true);
    cleanups.forEach(cleanup => cleanup?.());
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
