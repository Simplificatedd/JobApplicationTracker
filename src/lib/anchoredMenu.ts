interface AnchorRect {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export function getAnchoredMenuPosition({
  anchor,
  gap = 8,
  menuHeight,
  menuWidth,
  padding = 8,
  viewportHeight,
  viewportWidth,
}: {
  anchor: AnchorRect;
  gap?: number;
  menuHeight: number;
  menuWidth: number;
  padding?: number;
  viewportHeight: number;
  viewportWidth: number;
}) {
  const belowTop = anchor.bottom + gap;
  const aboveTop = anchor.top - gap - menuHeight;
  const hasRoomBelow = belowTop + menuHeight <= viewportHeight - padding;
  const top = hasRoomBelow
    ? belowTop
    : Math.max(padding, aboveTop);
  const maximumLeft = Math.max(padding, viewportWidth - menuWidth - padding);
  const left = Math.min(
    maximumLeft,
    Math.max(padding, anchor.right - menuWidth),
  );

  return { left, top };
}
