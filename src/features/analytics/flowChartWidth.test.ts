import { type ReactElement, isValidElement } from "react";
import { describe, expect, it, vi } from "vitest";

// Stands in for useElementWidth's measurement: its width state starts at 0.
const measured = vi.hoisted(() => ({ width: 0 }));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useRef: () => ({ current: null }),
  useState: (initial: unknown) => [initial === 0 ? measured.width : initial, vi.fn()],
  useEffect: () => {},
}));
import { FlowChart } from "./chartViews";

type Element = ReactElement<Record<string, unknown>>;
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children)];
}

function renderAt(width: number) {
  measured.width = width;
  const root = FlowChart({
    colorFor: () => "#123456",
    links: [{ from: "Awaiting Response", to: "Online Assessment", value: 2 }],
    order: ["Awaiting Response", "Online Assessment"],
  }) as Element;
  const all = elements(root);
  const svg = all.find((element) => element.type === "svg")!;
  const rightLabelX = Math.max(
    ...all.filter((element) => element.type === "text").map((element) => Number(element.props.x)),
  );
  // Only the drawing scrolls; the hint below it stays put.
  const scroller = all.find((element) => element.type === "div" && elements(element.props.children)[0] === svg)!;
  return { root, scroller, svg, rightLabelX };
}

describe("status flow width", () => {
  it("keeps room for both label columns on a narrow card and scrolls inside it", () => {
    const { root, scroller, svg, rightLabelX } = renderAt(256);

    expect(svg.props.width).toBe(344);
    // Right labels start 18px past the node and get the full 132px column.
    expect(Number(svg.props.width) - rightLabelX).toBe(132 - 18);
    expect(scroller.props.className).toBe("overflow-x-auto py-1.5 pr-4");
    expect(root.props.className).toBeUndefined();
  });

  it("draws at the card width with no scroll container once it fits", () => {
    const { scroller, svg, rightLabelX } = renderAt(640);

    expect(svg.props.width).toBe(640);
    expect(rightLabelX).toBe(640 - 132 + 18);
    expect(scroller.props.className).toBeUndefined();
  });
});
