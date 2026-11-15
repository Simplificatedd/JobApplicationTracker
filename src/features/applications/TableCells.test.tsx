import { beforeEach, describe, expect, it, vi } from "vitest";
import { application } from "../../test/assessmentFixtures";

// The same small hook-host approach as dialogUsability.test.tsx: exercise the
// real components without adding a browser/DOM dependency to the project.
const host = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[], effects: [] as (() => void)[], cleanups: [] as (() => void)[] }));
vi.mock("react", () => {
  function useEffect(effect: () => (() => void) | undefined, deps: unknown[]) {
    const i = host.cursor++; const previous = host.slots[i] as unknown[] | undefined;
    if (previous && deps.every((d, n) => Object.is(d, previous[n]))) return;
    host.slots[i] = deps;
    host.effects.push(() => { host.cleanups[i]?.(); host.cleanups[i] = effect() ?? (() => {}); });
  }
  return {
    useState(initial: unknown) {
      const i = host.cursor++;
      if (!(i in host.slots)) host.slots[i] = typeof initial === "function" ? initial() : initial;
      return [host.slots[i], (value: unknown) => { host.slots[i] = typeof value === "function" ? value(host.slots[i]) : value; }];
    },
    useEffect,
    useLayoutEffect: useEffect,
    useId() { return "test-id"; },
    useRef(initial: unknown) {
      const i = host.cursor++;
      if (!(i in host.slots)) host.slots[i] = { current: initial };
      return host.slots[i];
    },
  };
});
vi.mock("react-dom", () => ({ createPortal: (node: unknown) => node }));
import { ContactsButton, StatusQuickEditCell } from "./TableCells";

type Element = { type: unknown; props: Record<string, unknown> };
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node) || !("type" in node)) return [];
  const e = node as Element; return [e, ...elements(e.props.children)];
}
const named = (node: unknown, name: string) => elements(node).find(e => typeof e.type === "function" && e.type.name === name)!;
const flushEffects = () => host.effects.splice(0).forEach(effect => effect());

beforeEach(() => {
  host.cursor = 0; host.slots = []; host.effects = []; host.cleanups = [];
  vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {}, innerHeight: 800, innerWidth: 1200 });
  vi.stubGlobal("document", { addEventListener() {}, removeEventListener() {} });
});

describe("quick-edit popover keyboard focus", () => {
  it("moves focus to the first control when it opens, and only then", () => {
    const quickEdit = named(StatusQuickEditCell({ application, onUpdate: vi.fn() }), "AnchoredQuickEdit");
    const editor = quickEdit.type as (props: Record<string, unknown>) => unknown;
    host.slots = []; host.effects = [];
    const focus = vi.fn();
    const querySelector = vi.fn(() => ({ focus }));
    const props = {
      ...quickEdit.props,
      isOpen: true,
      triggerRef: { current: { getBoundingClientRect: () => ({ bottom: 0, left: 0, right: 0, top: 0 }) } },
    };
    const open = () => {
      host.cursor = 0;
      const dialog = elements(editor(props)).find(e => e.props.role === "dialog")!;
      (dialog as unknown as { ref: { current: unknown } }).ref.current = { offsetHeight: 0, offsetWidth: 0, querySelector };
      flushEffects();
    };

    open();
    expect(querySelector).toHaveBeenCalledWith("input, select, textarea, button");
    expect(focus).toHaveBeenCalledTimes(1);

    // A re-render while editing (for example after typing) must not pull
    // focus back to the first control.
    open();
    expect(focus).toHaveBeenCalledTimes(1);
  });
});

describe("table row control names", () => {
  it("names the Contacts button with the job title and count", () => {
    const button = ContactsButton({ count: 2, jobTitle: "Software Intern" }) as unknown as Element;
    expect(button.props["aria-label"]).toBe("Contacts for Software Intern: 2");
  });
});
