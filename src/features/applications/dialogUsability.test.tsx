import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { ComponentProps } from "react";
import { application, interview } from "../../test/assessmentFixtures";

// The same small hook-host approach used by the existing store tests. Exercise
// real editor handlers without adding a browser/DOM dependency to the project.
const host = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[], effects: [] as (() => void)[], cleanups: [] as (() => void)[] }));
vi.mock("react", () => ({
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
  useId() { return "test-id"; },
  Fragment: "react-fragment",
  useRef(initial: unknown) {
    const i = host.cursor++;
    if (!(i in host.slots)) host.slots[i] = { current: initial };
    return host.slots[i];
  },
}));
import { ApplicationDetailPanel } from "./ApplicationDetailPanel";
import { InterviewsSection } from "./InterviewsSection";
import { AssessmentsSection } from "./AssessmentsSection";
import { findVisibleNotificationsBell, NotificationBell } from "../../components/NotificationBell";
import { AppShell } from "../../components/AppShell";
import { ApplicationsToolbar } from "./ApplicationsToolbar";
import { useVisibleViewportStyle } from "../../hooks/useVisibleViewport";
import type { ReminderNotification } from "../../lib/reminders";
import type { Assessment } from "../../types/application";
import type { AssessmentActions } from "../../lib/assessments";

type Element = { type: unknown; props: Record<string, unknown> };
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node) || !("type" in node)) return [];
  const e = node as Element; return [e, ...elements(e.props.children)];
}
function text(node: unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(text).join("");
  if (node && typeof node === "object" && "props" in node) return text((node as Element).props.children);
  return "";
}
const named = (node: unknown, name: string) => elements(node).find(e => typeof e.type === "function" && e.type.name === name)!;
const button = (node: unknown, label: string) => elements(node).find(e => e.type === "button" && text(e.props.children).trim() === label)!;
function render<T>(component: () => T): T { host.cursor = 0; const tree = component(); host.effects.splice(0).forEach(effect => effect()); return tree; }
const call = (fn: unknown, ...args: unknown[]) => (fn as (...args: unknown[]) => unknown)(...args);
const listeners = vi.hoisted(() => new Map<string, (event: unknown) => void>());
beforeEach(() => {
  host.cursor = 0; host.slots = []; host.effects = []; host.cleanups = []; listeners.clear();
  vi.stubGlobal("window", { confirm: () => true });
  vi.stubGlobal("document", { addEventListener: (type: string, fn: (event: unknown) => void) => listeners.set(type, fn), removeEventListener: (type: string) => listeners.delete(type) });
});
afterEach(() => { host.cleanups.forEach(cleanup => cleanup?.()); vi.unstubAllGlobals(); });
const assessmentActions = () => ({ addAssessment: vi.fn(), updateAssessment: vi.fn(), deleteAssessment: vi.fn(), convertInterviewToAssessment: vi.fn() });
function detailProps(): ComponentProps<typeof ApplicationDetailPanel> {
  return {
    application, assessments: [], assessmentActions: assessmentActions(), activities: [], contacts: [], coverLetters: [], interviews: [], resumes: [],
    coverLetterActionError: "", resumeActionError: "", workingResumeId: null, workingCoverLetterId: null,
    enableDeleteActiveApplications: false, onArchive: vi.fn().mockResolvedValue({ ok: true }), onDelete: vi.fn().mockResolvedValue({ ok: true }), onRestore: vi.fn().mockResolvedValue({ ok: true }),
    onClose: vi.fn(), onAddInterview: vi.fn(), onDeleteInterview: vi.fn(), onUpdate: vi.fn(), onUpdateInterview: vi.fn(),
    onDownloadCoverLetter: vi.fn(), onDownloadResume: vi.fn(), onPreviewResume: vi.fn(), onPreviewCoverLetter: vi.fn(),
  };
}
it("keeps details open for either nested editor and blocks switching away from its draft", () => {
  const props = detailProps(); const view = () => render(() => ApplicationDetailPanel(props));
  let tree = view(); const read = named(tree, "ReadOnlyDetails");
  call(read.props.onInterviewEditingChange, true); call(read.props.onAssessmentEditingChange, true); tree = view();
  call(tree.props.onRequestClose); expect(props.onClose).not.toHaveBeenCalled();
  expect(button(tree, "Edit").props.disabled).toBe(true); expect(button(tree, "Close").props.disabled).toBe(true);
  call(read.props.onInterviewEditingChange, false); tree = view(); call(tree.props.onRequestClose); expect(props.onClose).not.toHaveBeenCalled();
  call(read.props.onAssessmentEditingChange, false); tree = view(); call(tree.props.onRequestClose); expect(props.onClose).toHaveBeenCalledTimes(1);
});
it("reports an interview draft through a pending/failed save and only releases it on explicit Cancel", async () => {
  let resolve!: (value: unknown) => void; const pending = new Promise(resolvePromise => { resolve = resolvePromise; });
  const props: ComponentProps<typeof InterviewsSection> = { application, interviews: [], onEditingChange: vi.fn(), onAdd: vi.fn().mockReturnValue(pending), onUpdate: vi.fn(), onDelete: vi.fn(), onConvert: vi.fn() };
  const view = () => render(() => InterviewsSection(props));
  call(button(view(), "Add interview").props.onClick); let tree = view(); let form = named(tree, "InterviewForm");
  call(form.props.onChange, { ...(form.props.draft as object), notes: "Keep this draft" }); tree = view(); form = named(tree, "InterviewForm");
  call(form.props.onSave); tree = view(); form = named(tree, "InterviewForm"); expect(form.props.isSaving).toBe(true);
  call(form.props.onCancel); expect((named(view(), "InterviewForm").props.draft as { notes: string }).notes).toBe("Keep this draft");
  resolve({ ok: false, error: "Offline" }); await Promise.resolve(); await Promise.resolve(); tree = view();
  expect((props.onEditingChange as Mock).mock.lastCall).toEqual([true]); form = named(tree, "InterviewForm");
  expect((form.props.draft as { notes: string }).notes).toBe("Keep this draft"); call(form.props.onCancel); view();
  expect((props.onEditingChange as Mock).mock.lastCall).toEqual([false]);
});
it("keeps an assessment editor registered until its explicit Cancel", () => {
  const props: ComponentProps<typeof AssessmentsSection> = { application, assessments: [], assessmentActions: assessmentActions(), onEditingChange: vi.fn() };
  const view = () => render(() => AssessmentsSection(props));
  call(button(view(), "Add assessment").props.onClick); let tree = view(); expect((props.onEditingChange as Mock).mock.lastCall).toEqual([true]);
  const name = elements(tree).find(e => e.type === "input" && e.props.value === "")!; call(name.props.onChange, { target: { value: "Keep my assessment" } });
  tree = view(); expect(elements(tree).some(e => e.type === "input" && e.props.value === "Keep my assessment")).toBe(true);
  call(button(tree, "Cancel").props.onClick); view(); expect((props.onEditingChange as Mock).mock.lastCall).toEqual([false]);
});
// The second null ref slot is the trigger, declared after the menu wrapper.
function triggerFocus() {
  const refs = host.slots.filter(s => s && typeof s === "object" && "current" in s) as { current: unknown }[];
  const focus = vi.fn(); refs[1].current = { focus }; return focus;
}
function openActions(props: ComponentProps<typeof ApplicationDetailPanel>) {
  call(button(render(() => ApplicationDetailPanel(props)), "More actions").props.onClick);
  return render(() => ApplicationDetailPanel(props));
}
it("archives an active application from the detail actions menu and closes the menu", () => {
  const props = detailProps(); let tree = render(() => ApplicationDetailPanel(props));
  expect(button(tree, "Archive")).toBeUndefined();
  tree = openActions(props); expect(button(tree, "More actions").props["aria-expanded"]).toBe(true);
  const focus = triggerFocus();
  call(button(tree, "Archive").props.onClick); expect(props.onArchive).toHaveBeenCalledWith(application.id);
  expect(focus).toHaveBeenCalled();
  expect(button(tree, "Restore")).toBeUndefined(); expect(button(tree, "Delete")).toBeUndefined();
  expect(button(render(() => ApplicationDetailPanel(props)), "Archive")).toBeUndefined();
});
it("restores and deletes an archived application after confirmation", () => {
  const props = { ...detailProps(), application: { ...application, archivedAt: "2026-10-01T00:00:00.000Z" } };
  let tree = openActions(props); expect(button(tree, "Archive")).toBeUndefined();
  call(button(tree, "Restore").props.onClick); expect(props.onRestore).toHaveBeenCalledWith(application.id);
  vi.stubGlobal("window", { confirm: () => false }); tree = openActions(props);
  call(button(tree, "Delete").props.onClick); expect(props.onDelete).not.toHaveBeenCalled();
  vi.stubGlobal("window", { confirm: () => true }); tree = openActions(props);
  call(button(tree, "Delete").props.onClick); expect(props.onDelete).toHaveBeenCalledWith(application.id);
});
it("offers active deletion only when it is enabled in Settings", () => {
  expect(button(openActions(detailProps()), "Delete")).toBeUndefined();
  host.slots = [];
  const props = { ...detailProps(), enableDeleteActiveApplications: true };
  call(button(openActions(props), "Delete").props.onClick);
  expect(props.onDelete).toHaveBeenCalledWith(application.id);
});
const actionsWrapper = (tree: unknown) => elements(tree).find(e => e.type === "div" && typeof e.props.onKeyDown === "function" && e.props.role !== "menu")!;
const escape = () => ({ key: "Escape", preventDefault: vi.fn(), stopPropagation: vi.fn() });
it("closes only the actions menu on Escape, leaving the detail panel to handle Escape otherwise", () => {
  const props = detailProps(); const tree = openActions(props);
  const focus = triggerFocus(); const open = escape(); call(actionsWrapper(tree).props.onKeyDown, open);
  expect(open.preventDefault).toHaveBeenCalled(); expect(open.stopPropagation).toHaveBeenCalled(); expect(focus).toHaveBeenCalled();
  const closed = render(() => ApplicationDetailPanel(props));
  expect(button(closed, "More actions").props["aria-expanded"]).toBe(false);
  // With the menu closed, Escape bubbles to the dialog's own close guard.
  const next = escape(); call(actionsWrapper(closed).props.onKeyDown, next);
  expect(next.stopPropagation).not.toHaveBeenCalled();
});
it("closes the actions menu when a pointer or focus moves outside it, but not inside it", () => {
  const props = detailProps(); openActions(props);
  // The first null ref slot is the menu wrapper, declared before the trigger ref.
  const inside = { target: "inside" }; const ref = host.slots.find(s => s && typeof s === "object" && "current" in s && (s as { current: unknown }).current === null) as { current: unknown };
  ref.current = { contains: (node: unknown) => node === inside.target };
  listeners.get("pointerdown")!(inside);
  expect(button(render(() => ApplicationDetailPanel(props)), "More actions").props["aria-expanded"]).toBe(true);
  listeners.get("focusin")!(inside);
  expect(button(render(() => ApplicationDetailPanel(props)), "More actions").props["aria-expanded"]).toBe(true);
  listeners.get("pointerdown")!({ target: "outside" });
  expect(button(render(() => ApplicationDetailPanel(props)), "More actions").props["aria-expanded"]).toBe(false);
  expect(listeners.size).toBe(0);
  openActions(props); listeners.get("focusin")!({ target: "outside" });
  expect(button(render(() => ApplicationDetailPanel(props)), "More actions").props["aria-expanded"]).toBe(false);
});
it("blocks repeat header actions while one is pending and shows its failure in the panel", async () => {
  let resolve!: (value: unknown) => void;
  const props = { ...detailProps(), onArchive: vi.fn().mockReturnValue(new Promise(resolvePromise => { resolve = resolvePromise; })) };
  call(button(openActions(props), "Archive").props.onClick);
  let tree = render(() => ApplicationDetailPanel(props));
  expect(button(tree, "Archive")).toBeUndefined(); expect(button(tree, "Edit").props.disabled).toBe(true);
  expect(button(tree, "Close").props.disabled).toBe(true); call(tree.props.onRequestClose); expect(props.onClose).not.toHaveBeenCalled();
  expect(button(openActions(props), "Archive").props.disabled).toBe(true);
  resolve({ ok: false, error: "Archive could not be saved." }); await Promise.resolve(); await Promise.resolve();
  tree = render(() => ApplicationDetailPanel(props));
  expect(button(tree, "Archive").props.disabled).toBe(false); expect(props.onArchive).toHaveBeenCalledTimes(1);
  expect(elements(tree).some(e => e.props.role === "alert" && text(e.props.children) === "Archive could not be saved.")).toBe(true);
});
it("disables the actions menu while a nested editor is open and hides it while editing", () => {
  const props = detailProps(); let tree = render(() => ApplicationDetailPanel(props));
  call(named(tree, "ReadOnlyDetails").props.onInterviewEditingChange, true); tree = render(() => ApplicationDetailPanel(props));
  expect(button(tree, "More actions").props.disabled).toBe(true);
  call(named(tree, "ReadOnlyDetails").props.onInterviewEditingChange, false); tree = render(() => ApplicationDetailPanel(props));
  call(button(tree, "Edit").props.onClick); tree = render(() => ApplicationDetailPanel(props));
  expect(button(tree, "More actions")).toBeUndefined();
});
it("returns focus to the trigger when the trigger closes the menu", () => {
  const props = detailProps(); const tree = openActions(props); const focus = triggerFocus();
  call(button(tree, "More actions").props.onClick);
  expect(focus).toHaveBeenCalled();
  expect(button(render(() => ApplicationDetailPanel(props)), "More actions").props["aria-expanded"]).toBe(false);
});
it("changes the status from the phone header through the guarded header action", async () => {
  let resolve!: (value: unknown) => void;
  const props = { ...detailProps(), onUpdate: vi.fn().mockReturnValue(new Promise(resolvePromise => { resolve = resolvePromise; })) };
  const picker = (tree: unknown) => elements(tree).find(e => e.type === "select" && e.props.className?.toString().includes("field-control h-11"))!;
  let tree = render(() => ApplicationDetailPanel(props));
  expect(picker(tree).props.value).toBe(application.status);
  call(picker(tree).props.onChange, { target: { value: "Offered" } });
  expect(props.onUpdate).toHaveBeenCalledWith(application.id, { status: "Offered" });
  tree = render(() => ApplicationDetailPanel(props));
  // The choice stays shown and focusable while saving, and a second change waits.
  expect(picker(tree).props.value).toBe("Offered");
  expect(picker(tree).props.disabled).toBe(false);
  call(picker(tree).props.onChange, { target: { value: "Rejected" } });
  expect(props.onUpdate).toHaveBeenCalledTimes(1);
  resolve({ ok: false, error: "Status could not be saved." });
  for (let i = 0; i < 4; i++) await Promise.resolve();
  tree = render(() => ApplicationDetailPanel(props));
  expect(picker(tree).props.value).toBe(application.status);
  expect(elements(tree).some(e => e.props.role === "alert" && text(e.props.children) === "Status could not be saved.")).toBe(true);
  call(named(tree, "ReadOnlyDetails").props.onInterviewEditingChange, true);
  expect(picker(render(() => ApplicationDetailPanel(props))).props.disabled).toBe(true);
});
function bellProps(): ComponentProps<typeof NotificationBell> {
  const notification = {
    application, applicationId: application.id, body: "Example / Due soon", group: "followups", id: "follow-up",
    severity: "due_soon", sortAt: 0, title: `Follow up on ${application.jobTitle}`, type: "follow_up", dueAt: "2026-11-04",
  } as ReminderNotification;
  return {
    grouped: false, notifications: [notification], onDismiss: vi.fn(), onMarkOpened: vi.fn(), onOpenApplication: vi.fn(),
    onUpdateApplication: vi.fn(), onUpdateAssessment: vi.fn(), onUpdateInterview: vi.fn(),
  };
}
function openBell(props: ComponentProps<typeof NotificationBell>, phone: boolean) {
  vi.stubGlobal("window", { confirm: () => true, matchMedia: () => ({ matches: phone, addEventListener() {}, removeEventListener() {} }) });
  const tree = render(() => NotificationBell(props));
  call(elements(tree).find(e => e.props.title === "Notifications")!.props.onClick);
  return render(() => NotificationBell(props));
}
it("opens a full-screen notifications panel on phones and marks reminders opened", () => {
  const props = bellProps(); const tree = openBell(props, true);
  const panel = named(tree, "NativeModal");
  expect(props.onMarkOpened).toHaveBeenCalledTimes(1);
  expect(panel.props.className).toContain("fixed inset-0");
  expect(panel.props.className).toContain("pt-[env(safe-area-inset-top)]");
  expect(elements(tree).some(e => e.props.role === "dialog" && e.props["aria-label"] === "Notifications")).toBe(false);
  const close = elements(panel).find(e => e.props["aria-label"] === "Close notifications")!;
  expect(close.props["data-initial-focus"]).toBe(true);
  call(panel.props.onRequestClose);
  expect(named(render(() => NotificationBell(props)), "NativeModal")).toBeUndefined();
});
it("keeps notification actions working from the phone panel", () => {
  const props = bellProps(); let tree = openBell(props, true);
  const item = named(tree, "NotificationItem");
  call(item.props.onDismiss, "follow-up"); expect(props.onDismiss).toHaveBeenCalledWith("follow-up");
  call(item.props.onOpenApplication, application.id);
  expect(props.onOpenApplication).toHaveBeenCalledWith(application.id);
  tree = render(() => NotificationBell(props));
  expect(named(tree, "NativeModal")).toBeUndefined();
});
it("gives the detail panel and phone notifications their breakpoint focus fallbacks (#217)", () => {
  const row = { getClientRects: () => [{}] };
  vi.stubGlobal("CSS", { escape: (value: string) => value });
  vi.stubGlobal("document", { ...document, querySelectorAll: (selector: string) =>
    selector === `[data-application-id="${application.id}"]` ? [row] : [] });
  const detail = render(() => ApplicationDetailPanel(detailProps()));
  expect(call(detail.props.fallbackFocus)).toBe(row);
  expect(named(openBell(bellProps(), true), "NativeModal").props.fallbackFocus).toBe(findVisibleNotificationsBell);
});
it("keeps the anchored popover on tablets and desktops", () => {
  const tree = openBell(bellProps(), false);
  expect(named(tree, "NativeModal")).toBeUndefined();
  const popover = elements(tree).find(e => e.props.role === "dialog" && e.props["aria-label"] === "Notifications")!;
  expect(popover.props.className).toContain("absolute right-0 top-12");
  expect(popover.props.className).not.toContain("max-md:");
});
it("closes the notifications panel when the layout crosses the phone breakpoint", () => {
  const props = bellProps(); openBell(props, true);
  expect(named(render(() => NotificationBell(props)), "NativeModal")).toBeDefined();
  // The breakpoint listener reports a wider screen.
  // The open flag is the first true slot; the phone flag is the last one.
  const isPhoneSlot = host.slots.lastIndexOf(true);
  expect(isPhoneSlot).toBeGreaterThan(host.slots.indexOf(true));
  host.slots[isPhoneSlot] = false;
  render(() => NotificationBell(props));
  const tree = render(() => NotificationBell(props));
  expect(named(tree, "NativeModal")).toBeUndefined();
  expect(elements(tree).some(e => e.props.role === "dialog")).toBe(false);
});
it("closes the phone More sheet when the layout crosses the phone breakpoint", () => {
  vi.stubGlobal("window", { confirm: () => true, matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const props = {
    children: null, currentView: "applications", enableBetaAnalytics: false, enableNotificationBell: false, groupedNotifications: false,
    navigationDisplayMode: "side", notifications: [], onDismissNotification: vi.fn(), onMarkNotificationsOpened: vi.fn(),
    onOpenApplicationFromNotification: vi.fn(), onPrimaryAction: vi.fn(), onUpdateApplication: vi.fn(), onUpdateAssessment: vi.fn(),
    onUpdateInterview: vi.fn(), onViewChange: vi.fn(),
  } as ComponentProps<typeof AppShell>;
  let tree = render(() => AppShell(props));
  call(named(tree, "BottomNavigation").props.onOpenMore);
  tree = render(() => AppShell(props));
  expect(named(tree, "MorePanel")).toBeDefined();
  // The More flag is the first true slot; the phone flag is the one after it.
  const isMoreSlot = host.slots.indexOf(true);
  const isPhoneSlot = host.slots.indexOf(true, isMoreSlot + 1);
  expect(isPhoneSlot).toBeGreaterThan(isMoreSlot);
  host.slots[isPhoneSlot] = false;
  render(() => AppShell(props));
  expect(named(render(() => AppShell(props)), "MorePanel")).toBeUndefined();
});
it.each([
  ["Filters", "MoreFiltersModal", "more-filters-title"],
  ["Columns", "ColumnsModal", "columns-title"],
])("opens the %s dialog as a native modal and closes it through the modal's request", (trigger, component, title) => {
  let tree = render(() => ApplicationsToolbar({}));
  const opener = trigger === "Columns"
    ? named(tree, "ColumnsButton")
    : elements(tree).find(e => e.type === "button" && text(e.props.children).trim().startsWith(trigger))!;
  call(opener.props.onClick);
  tree = render(() => ApplicationsToolbar({}));
  const dialog = named(tree, component);
  // NativeModal (showModal) moves focus in, contains it, makes the page inert
  // and returns focus to the trigger on close.
  // Give the dialog its own state slots after the toolbar's.
  host.cursor = host.slots.length;
  const modal = (dialog.type as (props: unknown) => Element)(dialog.props);
  expect((modal.type as { name: string }).name).toBe("NativeModal");
  expect(modal.props.labelledBy).toBe(title);
  call(modal.props.onRequestClose);
  expect(named(render(() => ApplicationsToolbar({})), component)).toBeUndefined();
});
it("returns Columns focus to the Filters button when the Columns buttons are hidden", () => {
  let tree = render(() => ApplicationsToolbar({}));
  call(named(tree, "ColumnsButton").props.onClick);
  tree = render(() => ApplicationsToolbar({}));
  const filters = elements(tree).find(e => e.type === "button" && text(e.props.children).trim().startsWith("Filters"))!;
  const filtersButton = { focus: vi.fn() };
  // React 18 keeps the ref on the element; React 19 moves it into props.
  const ref = (filters.props.ref ?? (filters as unknown as { ref: unknown }).ref) as { current: unknown };
  ref.current = filtersButton;
  const dialog = named(tree, "ColumnsModal");
  expect(call(dialog.props.fallbackFocus)).toBe(filtersButton);
  // NativeModal only uses the fallback when the opener is no longer rendered.
  host.cursor = host.slots.length;
  const modal = (dialog.type as (props: unknown) => Element)(dialog.props);
  expect(modal.props.fallbackFocus).toBe(dialog.props.fallbackFocus);
});
it("sizes an active phone form to the visible viewport and stops listening when inactive", () => {
  const listeners = new Map<string, () => void>();
  const visual = { height: 400, offsetTop: 0, scale: 1, addEventListener: (type: string, fn: () => void) => listeners.set(type, fn), removeEventListener: (type: string) => listeners.delete(type) };
  const focused = { scrollIntoView: vi.fn() };
  vi.stubGlobal("HTMLElement", class {});
  Object.setPrototypeOf(focused, (globalThis as unknown as { HTMLElement: { prototype: object } }).HTMLElement.prototype);
  vi.stubGlobal("document", { activeElement: focused });
  vi.stubGlobal("window", { visualViewport: visual, requestAnimationFrame: (fn: () => void) => fn() });
  let active = true;
  const view = () => render(() => useVisibleViewportStyle(active));
  view();
  expect(view()).toEqual({ height: "calc(400px - env(safe-area-inset-top) - env(safe-area-inset-bottom))", transform: undefined });
  // The keyboard opens and Safari scrolls the visual viewport.
  visual.height = 300; visual.offsetTop = 120; listeners.get("resize")!();
  expect(view()).toEqual({ height: "calc(300px - env(safe-area-inset-top) - env(safe-area-inset-bottom))", transform: "translateY(120px)" });
  expect(focused.scrollIntoView).toHaveBeenLastCalledWith({ block: "nearest" });
  // Safari scrolls the visual viewport without resizing it.
  visual.offsetTop = 60; listeners.get("scroll")!();
  expect(view()).toEqual({ height: "calc(300px - env(safe-area-inset-top) - env(safe-area-inset-bottom))", transform: "translateY(60px)" });
  // A pinch-zoom leaves the form as it was.
  visual.scale = 2; visual.height = 150; listeners.get("resize")!();
  expect(view()?.height).toBe("calc(300px - env(safe-area-inset-top) - env(safe-area-inset-bottom))");
  active = false; view();
  expect(view()).toBeUndefined();
  expect(listeners.size).toBe(0);
});
it("shows labelled Save and Cancel in the phone edit footer and hides the header icons below md", () => {
  const props = detailProps(); let tree = render(() => ApplicationDetailPanel(props));
  call(button(tree, "Edit").props.onClick); tree = render(() => ApplicationDetailPanel(props));
  const footer = elements(tree).find(e => e.type === "footer")!;
  expect(footer.props.className).toContain("md:hidden");
  expect(button(footer, "Cancel")).toBeDefined(); expect(button(footer, "Save")).toBeDefined();
  expect(elements(tree).filter(e => e.type === "button" && String(e.props.className).includes("hidden md:inline-flex"))).toHaveLength(2);
});

// #228: after the last interview or assessment goes, the detail panel offers a
// status change. Keep status is the default; confirming saves with a baseline.
describe("status prompt after removing the last interview or assessment (#228)", () => {
  const assessment = (id: string): Assessment => ({
    id, applicationId: application.id, number: 1, type: "coding", proctored: "unknown",
    progress: "not-started", result: "unknown", createdAt: application.createdAt, updatedAt: application.updatedAt,
  });
  let addButtons: { focus: Mock; getClientRects: () => object[] }[] = [];
  beforeEach(() => {
    addButtons = [];
    vi.stubGlobal("document", { ...document, querySelectorAll: (selector: string) =>
      selector.startsWith("[data-stage-add=") ? addButtons : [] });
  });
  function setup(overrides: Partial<ComponentProps<typeof ApplicationDetailPanel>> = {}) {
    const props = { ...detailProps(), ...overrides };
    // Like the store, a successful action publishes the remaining records first.
    props.onDeleteInterview = vi.fn(async (id: string) => {
      props.interviews = props.interviews.filter((item) => item.id !== id);
      return { ok: true as const, value: undefined };
    });
    props.onUpdate = vi.fn().mockResolvedValue({ ok: true });
    props.assessmentActions = { ...assessmentActions(),
      deleteAssessment: vi.fn(async (id: string) => {
        props.assessments = props.assessments.filter((item) => item.id !== id);
        return { ok: true as const, value: undefined };
      }),
      convertInterviewToAssessment: vi.fn(async (id: string) => {
        props.interviews = props.interviews.filter((item) => item.id !== id);
        props.assessments = [...props.assessments, assessment(id)];
        return { ok: true as const, value: assessment(id) };
      }) };
    // Run the panel and its read-only details with stable hook slots.
    const view = () => render(() => {
      const details = named(ApplicationDetailPanel(props), "ReadOnlyDetails");
      return (details.type as (value: unknown) => unknown)(details.props);
    });
    const prompt = () => named(view(), "UnsavedChangesDialog");
    const deleteInterview = (id: string) => call(named(view(), "InterviewsSection").props.onDelete, id);
    const deleteAssessment = (id: string) =>
      call((named(view(), "AssessmentsSection").props.assessmentActions as AssessmentActions).deleteAssessment, id);
    return { props, view, prompt, deleteInterview, deleteAssessment };
  }

  it("offers Awaiting Response after the last interview is deleted, and Keep status changes nothing", async () => {
    const { props, prompt, deleteInterview } = setup({ interviews: [interview(1)] });
    await deleteInterview("round-1");
    expect(prompt().props).toMatchObject({ title: "Change status?", cancelLabel: "Keep status", confirmLabel: "Change status" });
    expect(prompt().props.body).toContain("from Interviewing back to Awaiting Response");
    call(prompt().props.onCancel);
    expect(prompt()).toBeUndefined();
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it("saves the suggested status against the application as shown in the prompt", async () => {
    const { props, prompt, deleteInterview } = setup({ interviews: [interview(1)], assessments: [assessment("oa-1")] });
    await deleteInterview("round-1");
    expect(prompt().props.body).toContain("back to Online Assessment");
    await call(prompt().props.onConfirm);
    expect(props.onUpdate).toHaveBeenCalledWith(application.id, { status: "Online Assessment" }, undefined, undefined, application);
    expect(prompt()).toBeUndefined();
  });

  it("shows the error when the status change is rejected, for example by a conflict", async () => {
    const { props, view, prompt, deleteInterview } = setup({ interviews: [interview(1)] });
    (props.onUpdate as Mock).mockResolvedValue({ ok: false, error: "Status changed in another session." });
    await deleteInterview("round-1");
    call(prompt().props.onConfirm); await Promise.resolve(); await Promise.resolve();
    expect(elements(view()).find(e => e.props.role === "alert")?.props.children).toBe("Status changed in another session.");
    // A conflict loads the other session's status; the error stays until the next attempt.
    props.application = { ...application, status: "Offered" };
    expect(elements(view()).find(e => e.props.role === "alert")).toBeDefined();
  });

  it("returns focus to the section's add button before the prompt opens", async () => {
    const { prompt, deleteInterview } = setup({ interviews: [interview(1)] });
    const hidden = { focus: vi.fn(), getClientRects: () => [] }, visible = { focus: vi.fn(), getClientRects: () => [{}] };
    addButtons = [hidden, visible];
    await deleteInterview("round-1");
    expect(visible.focus).toHaveBeenCalled(); expect(hidden.focus).not.toHaveBeenCalled();
    expect(prompt()).toBeDefined();
  });

  it("does not prompt while another interview remains, or when the delete fails", async () => {
    const { prompt, deleteInterview } = setup({ interviews: [interview(1), interview(2)] });
    await deleteInterview("round-1");
    expect(prompt()).toBeUndefined();
    const single = setup({ interviews: [interview(1)] });
    single.props.onDeleteInterview = vi.fn().mockResolvedValue({ ok: false, error: "Conflict" });
    await single.deleteInterview("round-1");
    expect(single.prompt()).toBeUndefined();
  });

  it("drops the prompt when the status changes elsewhere, so it can't come back on its own", async () => {
    const { props, prompt, deleteInterview } = setup({ interviews: [interview(1)] });
    await deleteInterview("round-1");
    expect(prompt()).toBeDefined();
    props.application = { ...application, status: "Rejected" };
    expect(prompt()).toBeUndefined();
    // Later the user sets Interviewing by hand, with no interviews left.
    props.application = application;
    expect(prompt()).toBeUndefined();
  });

  it("offers Online Assessment after converting the last interview (R9)", async () => {
    const { props, view, prompt } = setup({ interviews: [interview(1)] });
    await call(named(view(), "InterviewsSection").props.onConvert, "round-1");
    expect(props.assessmentActions.convertInterviewToAssessment).toHaveBeenCalledWith("round-1");
    expect(prompt().props.body).toContain("from Interviewing back to Online Assessment");
  });

  it("offers Awaiting Response after the last assessment is deleted while in Online Assessment", async () => {
    const { prompt, deleteAssessment } = setup({ application: { ...application, status: "Online Assessment" }, assessments: [assessment("oa-1")] });
    await deleteAssessment("oa-1");
    expect(prompt().props.body).toContain("No assessments remain");
    expect(prompt().props.body).toContain("back to Awaiting Response");
  });

  it("does not prompt after deleting an assessment while Interviewing", async () => {
    const { prompt, deleteAssessment } = setup({ assessments: [assessment("oa-1")] });
    await deleteAssessment("oa-1");
    expect(prompt()).toBeUndefined();
  });

  it.each(["Offered", "Accepted", "Rejected", "Withdrawn"] as const)("never prompts for %s", async (status) => {
    const { prompt, deleteInterview } = setup({ application: { ...application, status }, interviews: [interview(1)] });
    await deleteInterview("round-1");
    expect(prompt()).toBeUndefined();
  });
});
