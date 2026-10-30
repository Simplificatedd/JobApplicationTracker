import { afterEach, expect, it, vi } from "vitest";
const host = vi.hoisted(() => ({ dialog: undefined as unknown, cleanups: [] as (() => void)[] }));
vi.mock("react", () => ({
  useRef: () => ({ current: host.dialog }),
  useEffect(effect: () => (() => void) | undefined) { const cleanup = effect(); if (cleanup) host.cleanups.push(cleanup); },
}));
import { NativeModal } from "./NativeModal";
afterEach(() => { host.cleanups.forEach(cleanup => cleanup()); host.cleanups = []; vi.unstubAllGlobals(); });
it("prevents native cancel until the guarded close request permits dismissal and restores the opener", () => {
  class Element { isConnected = true; focus = vi.fn(); }
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
