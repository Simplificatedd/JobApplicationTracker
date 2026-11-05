import { afterEach, expect, it, vi } from "vitest";
const host = vi.hoisted(() => ({ dialog: undefined as unknown, cleanups: [] as (() => void)[] }));
vi.mock("react", () => ({
  useRef: () => ({ current: host.dialog }),
  useEffect(effect: () => (() => void) | undefined) { const cleanup = effect(); if (cleanup) host.cleanups.push(cleanup); },
}));
import { NativeModal } from "./NativeModal";
afterEach(() => { host.cleanups.forEach(cleanup => cleanup()); host.cleanups = []; vi.unstubAllGlobals(); });
it("prevents native cancel until the guarded close request permits dismissal and restores the opener", () => {
  class Element { isConnected = true; focus = vi.fn(); getClientRects() { return [{}]; } }
  class Dialog extends EventTarget {
    open = false;
    querySelector() { return null; }
    setAttribute = vi.fn();
    showModal = vi.fn(() => { this.open = true; });
    close = vi.fn(() => { this.open = false; });
  }
  const opener = new Element(); vi.stubGlobal("HTMLElement", Element); vi.stubGlobal("document", { activeElement: opener });
  const dialog = new Dialog(); host.dialog = dialog;
  const requestClose = vi.fn();
  const modal = NativeModal({ className: "modal-overlay", labelledBy: "title", children: "Editor", onRequestClose: requestClose });
  const event = new Event("cancel", { cancelable: true }); dialog.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true); expect(requestClose).toHaveBeenCalledTimes(1); expect(dialog.open).toBe(true);
  const key = { key: "Escape", preventDefault: vi.fn(), stopPropagation: vi.fn() };
  modal.props.onKeyDown(key); expect(key.preventDefault).toHaveBeenCalled(); expect(key.stopPropagation).toHaveBeenCalled();
  expect(requestClose).toHaveBeenCalledTimes(2); expect(dialog.open).toBe(true);
  modal.props.onMouseDown({ target: opener, currentTarget: dialog, button: 0 }); expect(requestClose).toHaveBeenCalledTimes(2);
  modal.props.onMouseDown({ target: dialog, currentTarget: dialog, button: 0 }); expect(requestClose).toHaveBeenCalledTimes(3);
  host.cleanups.forEach(cleanup => cleanup()); expect(dialog.open).toBe(false); expect(opener.focus).toHaveBeenCalled();
  dialog.dispatchEvent(new Event("cancel", { cancelable: true })); expect(requestClose).toHaveBeenCalledTimes(3);
});

it("focuses the fallback when the opener is no longer rendered, and the opener otherwise", () => {
  class Element { isConnected = true; rendered = true; focus = vi.fn(); getClientRects() { return this.rendered ? [{}] : []; } }
  class Dialog extends EventTarget {
    open = false;
    querySelector() { return null; }
    setAttribute = vi.fn();
    showModal = vi.fn(() => { this.open = true; });
    close = vi.fn(() => { this.open = false; });
  }
  vi.stubGlobal("HTMLElement", Element);
  const open = (opener: Element, fallback?: Element) => {
    vi.stubGlobal("document", { activeElement: opener });
    host.dialog = new Dialog();
    NativeModal({ className: "x", labelledBy: "t", children: null, onRequestClose: vi.fn(), fallbackFocus: fallback && (() => fallback as unknown as HTMLElement) });
    host.cleanups.splice(0).forEach(cleanup => cleanup());
  };

  // A layout change hid the opener: focus the fallback instead.
  const hidden = new Element(); hidden.rendered = false; const fallback = new Element();
  open(hidden, fallback);
  expect(fallback.focus).toHaveBeenCalled(); expect(hidden.focus).not.toHaveBeenCalled();

  // A visible opener always wins over the fallback.
  const visible = new Element(); const unused = new Element();
  open(visible, unused);
  expect(visible.focus).toHaveBeenCalled(); expect(unused.focus).not.toHaveBeenCalled();

  // An update removed the opener (for example an archived row): use the fallback.
  const removed = new Element(); removed.isConnected = false; const replacement = new Element();
  open(removed, replacement);
  expect(replacement.focus).toHaveBeenCalled(); expect(removed.focus).not.toHaveBeenCalled();

  // A removed opener without a fallback is left alone, as before.
  const orphan = new Element(); orphan.isConnected = false;
  open(orphan);
  expect(orphan.focus).not.toHaveBeenCalled();

  // No fallback: keep the old behaviour of trying the opener.
  const alone = new Element(); alone.rendered = false;
  open(alone);
  expect(alone.focus).toHaveBeenCalled();
});
