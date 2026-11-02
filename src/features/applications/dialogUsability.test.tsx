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
function openActions(props: ComponentProps<typeof ApplicationDetailPanel>) {
  call(button(render(() => ApplicationDetailPanel(props)), "More actions").props.onClick);
  return render(() => ApplicationDetailPanel(props));
}
it("archives an active application from the detail actions menu and closes the menu", () => {
  const props = detailProps(); let tree = render(() => ApplicationDetailPanel(props));
  expect(button(tree, "Archive")).toBeUndefined();
  tree = openActions(props); expect(button(tree, "More actions").props["aria-expanded"]).toBe(true);
  call(button(tree, "Archive").props.onClick); expect(props.onArchive).toHaveBeenCalledWith(application.id);
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
  const open = escape(); call(actionsWrapper(tree).props.onKeyDown, open);
  expect(open.preventDefault).toHaveBeenCalled(); expect(open.stopPropagation).toHaveBeenCalled();
  const closed = render(() => ApplicationDetailPanel(props));
  expect(button(closed, "More actions").props["aria-expanded"]).toBe(false);
  // With the menu closed, Escape bubbles to the dialog's own close guard.
  const next = escape(); call(actionsWrapper(closed).props.onKeyDown, next);
  expect(next.stopPropagation).not.toHaveBeenCalled();
});
it("closes the actions menu on an outside pointer, but not on one inside it", () => {
  const props = detailProps(); openActions(props);
  // The first null ref slot is the menu wrapper, declared before the trigger ref.
  const inside = { target: "inside" }; const ref = host.slots.find(s => s && typeof s === "object" && "current" in s && (s as { current: unknown }).current === null) as { current: unknown };
  ref.current = { contains: (node: unknown) => node === inside.target };
  listeners.get("pointerdown")!(inside);
  expect(button(render(() => ApplicationDetailPanel(props)), "More actions").props["aria-expanded"]).toBe(true);
  listeners.get("pointerdown")!({ target: "outside" });
  expect(button(render(() => ApplicationDetailPanel(props)), "More actions").props["aria-expanded"]).toBe(false);
  expect(listeners.has("pointerdown")).toBe(false);
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
