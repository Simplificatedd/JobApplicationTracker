import { type RefObject, useEffect } from "react";

const EDGE_PADDING = 16;

interface HorizontalBounds {
  left: number;
  right: number;
}

// Returns how far a horizontal strip must scroll so the item is fully
// visible, keeping a little padding so the item does not sit on the edge.
export function getHorizontalScrollDelta(
  container: HorizontalBounds,
  item: HorizontalBounds,
) {
  if (item.left < container.left) {
    return item.left - container.left - EDGE_PADDING;
  }

  if (item.right > container.right) {
    return item.right - container.right + EDGE_PADDING;
  }

  return 0;
}

// Keeps the `aria-current` item of a horizontally scrolling strip in view.
// Only the strip scrolls; the page's vertical position is left alone.
export function useScrollActiveIntoView(
  containerRef: RefObject<HTMLElement | null>,
  activeKey: string,
) {
  useEffect(() => {
    const container = containerRef.current;
    const activeItem = container?.querySelector<HTMLElement>(
      '[aria-current]:not([aria-current="false"])',
    );

    if (
      !container ||
      !activeItem ||
      container.scrollWidth <= container.clientWidth
    ) {
      return;
    }

    container.scrollLeft += getHorizontalScrollDelta(
      container.getBoundingClientRect(),
      activeItem.getBoundingClientRect(),
    );
  }, [activeKey, containerRef]);
}
