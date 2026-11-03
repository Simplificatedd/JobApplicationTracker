import type { PointerEvent as ReactPointerEvent } from "react";

// Handlers that clear a chart's hovered item. Screens without hover (touch,
// most pens) fire pointerleave straight after a tap, which would hide the
// tapped item's details at once, so only a mouse leaving clears it; a scroll
// that starts on the chart cancels the pointer instead, so that still clears.
export function clearOnMouseLeave(clear: () => void) {
  return {
    onPointerCancel: () => clear(),
    onPointerLeave: (event: ReactPointerEvent) => {
      if (event.pointerType === "mouse") clear();
    },
  };
}

// "hover" for mice, "tap" on touch screens; the hidden word is display:none,
// so screen readers announce only one.
export function HoverOrTap() {
  return (
    <>
      <span className="touch:hidden">hover</span>
      <span className="hidden touch:inline">tap</span>
    </>
  );
}
