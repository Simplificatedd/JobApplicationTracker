import { afterEach, beforeEach, expect, it, vi, type Mock } from "vitest";
import type { ComponentProps } from "react";
import { application } from "../../test/assessmentFixtures";

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
  useRef(initial: unknown) {
    const i = host.cursor++;
    if (!(i in host.slots)) host.slots[i] = { current: initial };
    return host.slots[i];
  },
}));
import { ApplicationDetailPanel } from "./ApplicationDetailPanel";
import { InterviewsSection } from "./InterviewsSection";
import { AssessmentsSection } from "./AssessmentsSection";
import { NotificationBell } from "../../components/NotificationBell";
import type { ReminderNotification } from "../../lib/reminders";

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
  const picker = (tree: unknown) => elements(tree).find(e => e.type === "select" && e.props.className?.toString().includes("field-control h-9"))!;
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
