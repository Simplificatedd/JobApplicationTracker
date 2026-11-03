import { type ReactElement, isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// useElementWidth's state starts at 0 and the active flow's at null; record
// the active-flow setter so the handlers can be exercised without a DOM.
const state = vi.hoisted(() => ({ setActiveLink: vi.fn() }));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useRef: () => ({ current: null }),
  useState: (initial: unknown) => {
    if (initial === 0) return [640, vi.fn()];
    if (initial === null) return [null, state.setActiveLink];
    return [initial, vi.fn()];
  },
  useEffect: () => {},
}));
import { FlowChart } from "./chartViews";

type Element = ReactElement<Record<string, unknown>>;
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children)];
}

function render() {
  return elements(FlowChart({
    colorFor: () => "#123456",
    links: [{ from: "Awaiting Response", to: "Interviewing", value: 2 }],
    order: ["Awaiting Response", "Interviewing"],
  }));
}

beforeEach(() => state.setActiveLink.mockClear());

describe("status flow on touch screens", () => {
  it("keeps a tapped flow's details when the tap ends", () => {
    const all = render();
    const ribbon = all.find((element) => element.type === "path")!;
    const svg = all.find((element) => element.type === "svg")!;

    (ribbon.props.onPointerEnter as () => void)();
    expect(state.setActiveLink).toHaveBeenLastCalledWith("Awaiting Response→Interviewing");

    // Browsers fire pointerleave right after a touch pointerup.
    (svg.props.onPointerLeave as (event: { pointerType: string }) => void)({ pointerType: "touch" });
    expect(state.setActiveLink).toHaveBeenCalledTimes(1);
  });

  it("still clears the highlight when a mouse leaves the chart", () => {
    const svg = render().find((element) => element.type === "svg")!;

    (svg.props.onPointerLeave as (event: { pointerType: string }) => void)({ pointerType: "mouse" });
    expect(state.setActiveLink).toHaveBeenCalledWith(null);
  });

  it("keeps a pen tap's details too", () => {
    const svg = render().find((element) => element.type === "svg")!;

    (svg.props.onPointerLeave as (event: { pointerType: string }) => void)({ pointerType: "pen" });
    expect(state.setActiveLink).not.toHaveBeenCalled();
  });

  it("clears the highlight when a scroll takes over a touch on a ribbon", () => {
    const all = render();
    (all.find((element) => element.type === "path")!.props.onPointerEnter as () => void)();
    (all.find((element) => element.type === "svg")!.props.onPointerCancel as () => void)();

    expect(state.setActiveLink).toHaveBeenLastCalledWith(null);
  });
});
