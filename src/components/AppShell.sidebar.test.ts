import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

// The small hook host used by dialogUsability.test.tsx: run real handlers
// without a DOM dependency.
const host = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[], effects: [] as (() => void)[], cleanups: [] as (() => void)[] }));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState(initial: unknown) {
    const i = host.cursor++;
    if (!(i in host.slots)) host.slots[i] = typeof initial === "function" ? initial() : initial;
    return [host.slots[i], (value: unknown) => { host.slots[i] = typeof value === "function" ? value(host.slots[i]) : value; }];
  },
  useEffect(effect: () => (() => void) | undefined, deps: unknown[]) {
    const i = host.cursor++; const previous = host.slots[i] as unknown[] | undefined;
    if (previous && deps.every((d, n) => Object.is(d, previous[n]))) return;
    host.slots[i] = deps;
    host.effects.push(() => { host.cleanups[i]?.(); host.cleanups[i] = effect() ?? (() => {}); });
  },
  useRef(initial: unknown) {
    const i = host.cursor++;
    if (!(i in host.slots)) host.slots[i] = { current: initial };
    return host.slots[i];
  },
  useCallback: (fn: unknown) => fn,
}));
vi.mock("react-dom", () => ({ createPortal: (node: unknown) => node }));
import { AppShell, SIDEBAR_STATE_STORAGE_KEY } from "./AppShell";

type Element = { type: unknown; props: Record<string, unknown> };
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node) || !("type" in node)) return [];
  const e = node as Element; return [e, ...elements(e.props.children)];
}
function render<T>(component: () => T): T { host.cursor = 0; const tree = component(); host.effects.splice(0).forEach(effect => effect()); return tree; }
const call = (fn: unknown, ...args: unknown[]) => (fn as (...args: unknown[]) => unknown)(...args);
const byLabel = (tree: unknown, label: string) => elements(tree).find(e => e.props["aria-label"] === label);
const named = (tree: unknown, name: string) => elements(tree).find(e => typeof e.type === "function" && e.type.name === name);

const storage = new Map<string, string>();
const listeners = new Map<string, (event: unknown) => void>();
let desktop = true;
let onMediaChange = () => {};
beforeEach(() => {
  host.cursor = 0; host.slots = []; host.effects = []; host.cleanups = [];
  storage.clear(); listeners.clear(); desktop = true;
  vi.stubGlobal("window", {
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
    matchMedia: () => ({ get matches() { return desktop; }, addEventListener: (_: string, fn: () => void) => { onMediaChange = fn; }, removeEventListener() {} }),
  });
  vi.stubGlobal("document", { addEventListener: (type: string, fn: (event: unknown) => void) => listeners.set(type, fn), removeEventListener: (type: string) => listeners.delete(type) });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => { vi.unstubAllGlobals(); });

function props(overrides: Partial<ComponentProps<typeof AppShell>> = {}): ComponentProps<typeof AppShell> {
  return {
    children: null, currentView: "applications", enableBetaAnalytics: false, enableNotificationBell: false, groupedNotifications: false,
    navigationDisplayMode: "side", notifications: [], onDismissNotification: vi.fn(), onMarkNotificationsOpened: vi.fn(),
    onOpenApplicationFromNotification: vi.fn(), onPrimaryAction: vi.fn(), onUpdateApplication: vi.fn(), onUpdateAssessment: vi.fn(),
    onUpdateInterview: vi.fn(), onViewChange: vi.fn(), ...overrides,
  };
}

describe("sidebar state transitions", () => {
  it("collapses, hides, restores compact and expands, saving each state", () => {
    const shell = () => render(() => AppShell(props()));
    call(byLabel(shell(), "Collapse sidebar")!.props.onClick);
    expect(storage.get(SIDEBAR_STATE_STORAGE_KEY)).toBe("compact");

    call(byLabel(shell(), "Hide side navigation")!.props.onClick);
    expect(storage.get(SIDEBAR_STATE_STORAGE_KEY)).toBe("hidden");
    expect(named(shell(), "NavigationButtons")).toBeUndefined();

    // Show restores the last visible state, not always expanded.
    call(byLabel(shell(), "Show side navigation")!.props.onClick);
    expect(storage.get(SIDEBAR_STATE_STORAGE_KEY)).toBe("compact");

    call(byLabel(shell(), "Expand sidebar")!.props.onClick);
    expect(storage.get(SIDEBAR_STATE_STORAGE_KEY)).toBe("expanded");
    expect(byLabel(shell(), "Resize side navigation")).toBeDefined();
  });

  it.each([
    ["below 1280px", false, "side"],
    ["in top navigation", true, "top"],
  ] as const)("does not save show/hide %s", (_, isDesktop, navigationDisplayMode) => {
    desktop = isDesktop;
    const shell = () => render(() => AppShell(props({ navigationDisplayMode })));
    call(byLabel(shell(), `Hide ${navigationDisplayMode} navigation`)!.props.onClick);

    expect(byLabel(shell(), `Show ${navigationDisplayMode} navigation`)).toBeDefined();
    expect(storage.has(SIDEBAR_STATE_STORAGE_KEY)).toBe(false);
  });
});

describe("crossing 1280px", () => {
  it("keeps the row visible below 1280px and reapplies the saved state above it", () => {
    storage.set(SIDEBAR_STATE_STORAGE_KEY, "hidden");
    desktop = false;
    const shell = () => render(() => AppShell(props()));
    expect(named(shell(), "NavigationButtons")).toBeDefined();

    desktop = true; onMediaChange();
    expect(named(shell(), "NavigationButtons")).toBeUndefined();
    expect(byLabel(shell(), "Show side navigation")).toBeDefined();

    // Hiding the row is per visit and leaves the saved desktop state alone.
    storage.set(SIDEBAR_STATE_STORAGE_KEY, "compact");
    host.slots = [];
    desktop = false; shell();
    call(byLabel(shell(), "Hide side navigation")!.props.onClick);
    expect(named(shell(), "NavigationButtons")).toBeUndefined();
    desktop = true; onMediaChange();
    expect(byLabel(shell(), "Expand sidebar")).toBeDefined();
    expect(storage.get(SIDEBAR_STATE_STORAGE_KEY)).toBe("compact");
  });
});

describe("compact rail tooltips", () => {
  // Render the shell once to get the navigation element, then render that
  // component on its own so its hooks get a fresh host.
  function navigation(stored: string | null) {
    if (stored) storage.set(SIDEBAR_STATE_STORAGE_KEY, stored);
    const nav = named(render(() => AppShell(props())), "NavigationButtons")!;
    host.slots = []; host.cleanups = [];
    return () => render(() => (nav.type as (p: unknown) => unknown)(nav.props));
  }
  const target = { currentTarget: { getBoundingClientRect: () => ({ right: 56, top: 100, height: 44 }) } };
  const tooltipText = (tree: unknown) => elements(tree).find(e => e.props["aria-hidden"] === "true" && e.type === "span" && String(e.props.className).includes("fixed"))?.props.children;

  it("shows on focus beside the icon, outside the rail, and hides on Escape", () => {
    const view = navigation("compact");
    const resumes = elements(view()).find(e => e.type === "button" && elements(e.props.children).some(c => c.props.children === "Resumes"))!;
    call(resumes.props.onFocus, target);
    const tooltip = elements(view()).find(e => e.type === "span" && String(e.props.className).includes("fixed"))!;
    expect(tooltip.props.children).toBe("Resumes");
    expect(tooltip.props.style).toEqual({ left: 68, top: 122 });

    call(listeners.get("keydown"), { key: "Escape", preventDefault: vi.fn() });
    expect(tooltipText(view())).toBeUndefined();
  });

  it.each([
    ["the expanded sidebar", null, true],
    ["a compact state below 1280px", "compact", false],
  ])("does not show for %s", (_, stored, isDesktop) => {
    desktop = isDesktop;
    const view = navigation(stored);
    const first = elements(view()).find(e => e.type === "button")!;
    call(first.props.onMouseEnter, target);

    expect(tooltipText(view())).toBeUndefined();
  });
});
