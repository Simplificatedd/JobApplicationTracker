import type { PointerEvent as ReactPointerEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { clearOnMouseLeave, HoverOrTap } from "./pointerDetails";

const leave = (pointerType: string) => ({ pointerType }) as ReactPointerEvent;

describe("clearOnMouseLeave", () => {
  it("clears when a mouse leaves or a pointer is cancelled", () => {
    const clear = vi.fn();
    const handlers = clearOnMouseLeave(clear);

    handlers.onPointerLeave(leave("mouse"));
    handlers.onPointerCancel();
    expect(clear).toHaveBeenCalledTimes(2);
  });

  it("keeps tapped details when a finger lifts", () => {
    const clear = vi.fn();
    clearOnMouseLeave(clear).onPointerLeave(leave("touch"));
    expect(clear).not.toHaveBeenCalled();
  });

  it("keeps details when a pen lifts but clears when a hovering pen moves away", () => {
    const clear = vi.fn();
    const handlers = clearOnMouseLeave(clear);
    const target = {};
    const pen = (timeStamp: number) => ({ currentTarget: target, pointerType: "pen", timeStamp }) as unknown as ReactPointerEvent;

    // A pen without hover: pointerleave follows pointerup at once.
    handlers.onPointerUp(pen(1000));
    handlers.onPointerLeave(pen(1004));
    expect(clear).not.toHaveBeenCalled();

    // A hover-capable pen that later hovers off the chart.
    handlers.onPointerLeave(pen(2500));
    expect(clear).toHaveBeenCalledTimes(1);
  });
});

describe("HoverOrTap", () => {
  it("shows hover to mice and tap on touch screens", () => {
    expect(renderToStaticMarkup(<HoverOrTap />)).toBe(
      '<span class="touch:hidden">hover</span><span class="hidden touch:inline">tap</span>',
    );
  });
});
