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
}));
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

const storage = new Map<string, string>();
let desktop = true;
beforeEach(() => {
  host.cursor = 0; host.slots = []; host.effects = []; host.cleanups = [];
  storage.clear(); desktop = true;
  vi.stubGlobal("window", {
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
    matchMedia: () => ({ matches: desktop }),
  });
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
    expect(byLabel(shell(), "Primary navigation")).toBeUndefined();

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
