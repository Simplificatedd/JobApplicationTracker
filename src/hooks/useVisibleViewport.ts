import { type CSSProperties, useEffect, useState } from "react";

// Sizes a full-screen phone form to the part of the screen the on-screen
// keyboard leaves visible, so its pinned Save and Cancel stay reachable.
// Returns no style when inactive or when the browser lacks visualViewport.
export function useVisibleViewportStyle(active: boolean): CSSProperties | undefined {
  const [viewport, setViewport] = useState<{ height: number; top: number } | null>(null);

  useEffect(() => {
    const visual = typeof window === "undefined" ? undefined : window.visualViewport;
    if (!active || !visual) {
      setViewport(null);
      return;
    }
    const update = () => {
      // A deliberate pinch-zoom also changes the visual viewport; keep the
      // form steady instead of resizing it on every zoom frame.
      if (visual.scale > 1.01) return;
      setViewport({ height: visual.height, top: visual.offsetTop });
      // The browser scrolled the focused field into view before the form
      // shrank, so bring it back into view inside the smaller form.
      window.requestAnimationFrame?.(() => {
        const focused = document.activeElement;
        if (focused instanceof HTMLElement) focused.scrollIntoView?.({ block: "nearest" });
      });
    };
    update();
    visual.addEventListener("resize", update);
    visual.addEventListener("scroll", update);
    return () => {
      visual.removeEventListener("resize", update);
      visual.removeEventListener("scroll", update);
    };
  }, [active]);

  if (!active || !viewport) return undefined;

  // The overlay already keeps clear of the top and bottom safe areas.
  return {
    height: `calc(${viewport.height}px - env(safe-area-inset-top) - env(safe-area-inset-bottom))`,
    transform: viewport.top ? `translateY(${viewport.top}px)` : undefined,
  };
}
