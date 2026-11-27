// Call just before an action that may remove `item`, a list entry holding
// focus. Once the item is gone, if focus fell to <body>, focus the next (or
// previous) entry's `targetSelector` control (or the entry itself), else the
// fallback. Watching the DOM covers actions that remove the entry later.
export function keepFocusAfterRemoval(
  item: Element | null | undefined,
  itemSelector: string,
  fallback: () => HTMLElement | null | undefined,
  targetSelector?: string,
) {
  if (!item) return;
  const items = [...document.querySelectorAll<HTMLElement>(itemSelector)]
    .filter((entry) => entry.getClientRects().length > 0);
  const index = items.indexOf(item as HTMLElement);
  const neighbor = items[index + 1] ?? items[index - 1];

  const observer = new MutationObserver(() => {
    if (item.isConnected) return;
    stop();
    if (document.activeElement && document.activeElement !== document.body) return;
    const target = neighbor?.isConnected
      ? targetSelector ? neighbor.querySelector<HTMLElement>(targetSelector) : neighbor
      : null;
    (target ?? fallback())?.focus();
  });
  // The action failed or kept the entry (for example archived rows in Total view).
  const timer = setTimeout(stop, 10_000);
  function stop() {
    observer.disconnect();
    clearTimeout(timer);
  }
  observer.observe(document.body, { childList: true, subtree: true });
}
