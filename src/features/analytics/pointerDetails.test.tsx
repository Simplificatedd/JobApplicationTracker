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

  it("keeps tapped details when a finger or pen lifts", () => {
    const clear = vi.fn();
    const handlers = clearOnMouseLeave(clear);

    handlers.onPointerLeave(leave("touch"));
    handlers.onPointerLeave(leave("pen"));
    expect(clear).not.toHaveBeenCalled();
  });
});

describe("HoverOrTap", () => {
  it("shows hover to mice and tap on touch screens", () => {
    expect(renderToStaticMarkup(<HoverOrTap />)).toBe(
      '<span class="touch:hidden">hover</span><span class="hidden touch:inline">tap</span>',
    );
  });
});
