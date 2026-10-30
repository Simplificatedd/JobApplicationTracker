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
beforeEach(() => { host.cursor = 0; host.slots = []; host.effects = []; host.cleanups = []; vi.stubGlobal("window", { confirm: () => true }); });
afterEach(() => { host.cleanups.forEach(cleanup => cleanup?.()); vi.unstubAllGlobals(); });
const assessmentActions = () => ({ addAssessment: vi.fn(), updateAssessment: vi.fn(), deleteAssessment: vi.fn(), convertInterviewToAssessment: vi.fn() });
function detailProps(): ComponentProps<typeof ApplicationDetailPanel> {
  return {
    application, assessments: [], assessmentActions: assessmentActions(), activities: [], contacts: [], coverLetters: [], interviews: [], resumes: [],
    coverLetterActionError: "", resumeActionError: "", workingResumeId: null, workingCoverLetterId: null,
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
