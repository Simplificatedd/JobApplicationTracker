import type { PointerEvent as ReactPointerEvent } from "react";

// When each chart element last saw a pen lift, to tell a lift from hovering away.
const penLiftedAt = new WeakMap<EventTarget, number>();
// A pen without hover fires pointerleave in the same burst as pointerup.
const LIFT_LEAVE_WINDOW_MS = 100;

// Handlers that clear a chart's hovered item. Screens without hover (touch,
// most pens) fire pointerleave straight after a tap, which would hide the
// tapped item's details at once, so a finger never clears it and a pen only
// clears when it hovers away rather than lifts; a mouse always clears. A
// scroll that starts on the chart cancels the pointer instead, so that still
// clears.
export function clearOnMouseLeave(clear: () => void) {
  return {
    onPointerCancel: () => clear(),
    onPointerLeave: (event: ReactPointerEvent) => {
      if (event.pointerType === "mouse") {
        clear();
      } else if (event.pointerType === "pen") {
        const liftedAt = penLiftedAt.get(event.currentTarget) ?? -Infinity;
        if (event.timeStamp - liftedAt > LIFT_LEAVE_WINDOW_MS) clear();
      }
    },
    onPointerUp: (event: ReactPointerEvent) => {
      if (event.pointerType === "pen") penLiftedAt.set(event.currentTarget, event.timeStamp);
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
