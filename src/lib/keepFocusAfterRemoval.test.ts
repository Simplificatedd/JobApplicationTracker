import { afterEach, expect, it, vi } from "vitest";
import { keepFocusAfterRemoval } from "./keepFocusAfterRemoval";

class Item {
  isConnected = true;
  focus = vi.fn();
  target = { focus: vi.fn() };
  getClientRects() { return [{}]; }
  querySelector() { return this.target; }
}

let notify = () => {};
const disconnect = vi.fn();
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); disconnect.mockClear(); });

function setup(count: number) {
  const items = Array.from({ length: count }, () => new Item());
  const body = {};
  const doc = { activeElement: body as unknown, body, querySelectorAll: () => items.filter((item) => item.isConnected) };
  vi.stubGlobal("document", doc);
  vi.stubGlobal("MutationObserver", class {
    constructor(callback: () => void) { notify = callback; }
    observe() {}
    disconnect = disconnect;
  });
  const fallback = { focus: vi.fn() };
  const remove = (item: Item) => { item.isConnected = false; notify(); };
  return { items, doc, fallback, remove };
}

it("focuses the next entry's control once the entry is removed", () => {
  const { items, fallback, remove } = setup(3);
  keepFocusAfterRemoval(items[1] as unknown as Element, "[x]", () => fallback as unknown as HTMLElement, "button");
  notify(); // Unrelated DOM change: the entry is still there.
  expect(items[2].target.focus).not.toHaveBeenCalled();
  remove(items[1]);
  expect(items[2].target.focus).toHaveBeenCalled();
  expect(disconnect).toHaveBeenCalled();
});

it("uses the previous entry for the last one, the entry itself without a target, and the fallback when empty", () => {
  let { items, fallback, remove } = setup(2);
  keepFocusAfterRemoval(items[1] as unknown as Element, "[x]", () => fallback as unknown as HTMLElement);
  remove(items[1]);
  expect(items[0].focus).toHaveBeenCalled();

  ({ items, fallback, remove } = setup(1));
  keepFocusAfterRemoval(items[0] as unknown as Element, "[x]", () => fallback as unknown as HTMLElement, "button");
  remove(items[0]);
  expect(fallback.focus).toHaveBeenCalled();
});

it("leaves focus alone if it already moved, and stops watching after 10 s", () => {
  vi.useFakeTimers();
  const { items, doc, fallback, remove } = setup(2);
  keepFocusAfterRemoval(items[0] as unknown as Element, "[x]", () => fallback as unknown as HTMLElement, "button");
  doc.activeElement = {};
  remove(items[0]);
  expect(items[1].target.focus).not.toHaveBeenCalled();

  keepFocusAfterRemoval(items[1] as unknown as Element, "[x]", () => fallback as unknown as HTMLElement, "button");
  disconnect.mockClear();
  vi.advanceTimersByTime(10_000);
  expect(disconnect).toHaveBeenCalled();
});
