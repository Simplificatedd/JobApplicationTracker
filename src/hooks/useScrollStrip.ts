import { type RefObject, useEffect } from "react";

interface StripMetrics {
  clientWidth: number;
  scrollLeft: number;
  scrollWidth: number;
}

// Which edges of a horizontal strip have more content beyond them. A pixel
// of tolerance absorbs fractional scroll positions.
export function getScrollEdges({ clientWidth, scrollLeft, scrollWidth }: StripMetrics) {
  const maxScrollLeft = scrollWidth - clientWidth;

  return {
    hasMoreAfter: maxScrollLeft > 1 && scrollLeft < maxScrollLeft - 1,
    hasMoreBefore: maxScrollLeft > 1 && scrollLeft > 1,
  };
}

// The strip's next scroll position for a mostly vertical wheel gesture, or
// null when the page should scroll instead: the gesture is horizontal, the
// strip does not overflow, or it is already at the end being scrolled to.
export function getWheelScrollLeft(
  strip: StripMetrics,
  deltaX: number,
  deltaY: number,
) {
  const maxScrollLeft = strip.scrollWidth - strip.clientWidth;

  if (Math.abs(deltaY) <= Math.abs(deltaX) || maxScrollLeft <= 0) {
    return null;
  }

  const nextScrollLeft = Math.min(
    maxScrollLeft,
    Math.max(0, strip.scrollLeft + deltaY),
  );

  return nextScrollLeft === strip.scrollLeft ? null : nextScrollLeft;
}

// Drives the .scroll-strip style: marks the edges that hide more content so
// they fade, and lets a mouse wheel scroll the strip, since its scrollbar is
// hidden. Pass the item count so the hint updates when items change.
export function useScrollStrip(
  stripRef: RefObject<HTMLElement | null>,
  itemCount: number,
) {
  useEffect(() => {
    const strip = stripRef.current;

    if (!strip) {
      return;
    }

    const element = strip;

    function updateEdges() {
      const { hasMoreAfter, hasMoreBefore } = getScrollEdges(element);
      element.dataset.fadeStart = String(hasMoreBefore);
      element.dataset.fadeEnd = String(hasMoreAfter);
    }

    function scrollWithWheel(event: WheelEvent) {
      const nextScrollLeft = getWheelScrollLeft(
        element,
        event.deltaX,
        event.deltaY,
      );

      if (nextScrollLeft === null) {
        return;
      }

      event.preventDefault();
      element.scrollLeft = nextScrollLeft;
    }

    const resizeObserver = new ResizeObserver(updateEdges);
    resizeObserver.observe(element);
    [...element.children].forEach((child) => resizeObserver.observe(child));
    element.addEventListener("scroll", updateEdges, { passive: true });
    element.addEventListener("wheel", scrollWithWheel, { passive: false });
    updateEdges();

    return () => {
      resizeObserver.disconnect();
      element.removeEventListener("scroll", updateEdges);
      element.removeEventListener("wheel", scrollWithWheel);
    };
  }, [itemCount, stripRef]);
}
