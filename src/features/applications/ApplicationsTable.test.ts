import { type ReactElement, isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The table measures its scroll area into useState(0) and keeps dragged widths
// in useState(null). Stand in for the measurement and run effects at once, so
// any effect that writes widths back would show up as an onColumnWidthsChange
// call.
const host = vi.hoisted(() => ({
  viewportWidth: 0,
  setDraft: vi.fn(),
}));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useRef: () => ({ current: null }),
  useState: (initial: unknown) => {
    if (initial === 0) return [host.viewportWidth, vi.fn()];
    if (initial === null) return [null, host.setDraft];
    return [initial, vi.fn()];
  },
  useEffect: (effect: () => void) => { effect(); },
}));
import { application } from "../../test/assessmentFixtures";
import { DEFAULT_VISIBLE_APPLICATION_COLUMNS } from "../../lib/domain";
import { DEFAULT_SORT_STATE } from "./applicationFilters";
import {
  APPLICATION_TABLE_COLUMNS,
  ApplicationsTable,
  DEFAULT_COLUMN_WIDTHS,
  getBaseWidthForDisplayedWidth,
  stretchColumnWidthsToViewport,
} from "./ApplicationsTable";

type Element = ReactElement<Record<string, unknown>>;
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children)];
}

const visibleColumns = APPLICATION_TABLE_COLUMNS.filter(
  (column) => !column.canHide || DEFAULT_VISIBLE_APPLICATION_COLUMNS.includes(column.id),
);
const total = (widths: Record<string, number>) =>
  visibleColumns.reduce((sum, column) => sum + widths[column.id], 0);

function renderTable(viewportWidth: number, columnWidths = DEFAULT_COLUMN_WIDTHS) {
  host.viewportWidth = viewportWidth;
  const onColumnWidthsChange = vi.fn();
  const tree = ApplicationsTable({
    applications: [application],
    columnWidths,
    coverLetters: [],
    enableDeleteActiveApplications: false,
    enableDraggableColumnWidths: true,
    onArchiveApplication: vi.fn(),
    onColumnWidthsChange,
    onDeleteApplication: vi.fn(),
    onOpenApplication: vi.fn(),
    onOpenContacts: vi.fn(),
    onPreviewResume: vi.fn(),
    onRestoreApplication: vi.fn(),
    onSortChange: vi.fn(),
    onUpdateApplication: vi.fn(),
    resumes: [],
    sort: DEFAULT_SORT_STATE,
    visibleApplicationColumns: DEFAULT_VISIBLE_APPLICATION_COLUMNS,
    workingResumeId: null,
  });
  const all = elements(tree);
  const colWidths = all.filter((e) => e.type === "col").map((e) => parseInt((e.props.style as { width: string }).width, 10));
  const separator = (label: string) => all.find((e) => e.props["aria-label"] === `Resize ${label} column`)!;
  return { all, colWidths, onColumnWidthsChange, separator };
}

beforeEach(() => host.setDraft.mockClear());
afterEach(() => vi.unstubAllGlobals());

describe("stretchColumnWidthsToViewport", () => {
  it("fills a wider viewport without changing the base widths", () => {
    const stretched = stretchColumnWidthsToViewport(visibleColumns, DEFAULT_COLUMN_WIDTHS, 1566);

    expect(total(stretched)).toBe(1566);
    expect(total(DEFAULT_COLUMN_WIDTHS)).toBe(1455);
  });

  it("leaves widths alone when the viewport is narrower than the table", () => {
    expect(stretchColumnWidthsToViewport(visibleColumns, DEFAULT_COLUMN_WIDTHS, 926)).toEqual(DEFAULT_COLUMN_WIDTHS);
  });
});

describe("getBaseWidthForDisplayedWidth", () => {
  it("returns the displayed width when nothing is stretched", () => {
    expect(getBaseWidthForDisplayedWidth(visibleColumns, DEFAULT_COLUMN_WIDTHS, "status", 240, 926)).toBe(240);
  });

  it("finds the base width that stretches back to the displayed width", () => {
    const base = getBaseWidthForDisplayedWidth(visibleColumns, DEFAULT_COLUMN_WIDTHS, "status", 240, 1566);
    const stretched = stretchColumnWidthsToViewport(
      visibleColumns,
      { ...DEFAULT_COLUMN_WIDTHS, status: Math.round(base) },
      1566,
    );

    // Rounding and the last column's remainder allow a pixel either way.
    expect(Math.abs(stretched.status - 240)).toBeLessThanOrEqual(1);
  });
});

describe("applications table column widths", () => {
  it("stretches for display on a wide screen but never saves the stretched widths", () => {
    const { colWidths, onColumnWidthsChange } = renderTable(1566);

    expect(colWidths.reduce((sum, width) => sum + width, 0)).toBe(1566);
    expect(onColumnWidthsChange).not.toHaveBeenCalled();
  });

  it("shrinks back to the saved widths on a narrower screen", () => {
    const { colWidths } = renderTable(926);

    expect(colWidths).toEqual(visibleColumns.map((column) => DEFAULT_COLUMN_WIDTHS[column.id]));
  });

  it("saves a keyboard resize as the base width that shows the requested width", () => {
    const { colWidths, onColumnWidthsChange, separator } = renderTable(1566);
    const statusIndex = visibleColumns.findIndex((column) => column.id === "status");
    (separator("Status").props.onKeyDown as (event: { key: string }) => void)({ key: "ArrowRight" });

    const saved = onColumnWidthsChange.mock.calls[0][0] as Record<string, number>;
    const shown = stretchColumnWidthsToViewport(visibleColumns, saved, 1566);
    expect(Math.abs(shown.status - (colWidths[statusIndex] + 16))).toBeLessThanOrEqual(1);
    // Other columns keep their saved (unstretched) widths.
    expect(saved.company).toBe(DEFAULT_COLUMN_WIDTHS.company);
  });

  it("saves a dragged width once, on release, without stretching the other columns", () => {
    const listeners = new Map<string, (event: { clientX: number }) => void>();
    vi.stubGlobal("document", {
      addEventListener: (type: string, fn: (event: { clientX: number }) => void) => listeners.set(type, fn),
      removeEventListener: (type: string) => listeners.delete(type),
      body: { style: {} },
    });
    const { onColumnWidthsChange, separator } = renderTable(926);
    (separator("Company").props.onPointerDown as (event: object) => void)({
      clientX: 500, preventDefault: vi.fn(), stopPropagation: vi.fn(),
    });
    listeners.get("pointermove")!({ clientX: 540 });
    expect(onColumnWidthsChange).not.toHaveBeenCalled();
    listeners.get("pointerup")!({ clientX: 540 });

    expect(onColumnWidthsChange).toHaveBeenCalledTimes(1);
    expect(onColumnWidthsChange.mock.calls[0][0]).toEqual({ ...DEFAULT_COLUMN_WIDTHS, company: DEFAULT_COLUMN_WIDTHS.company + 40 });
  });

  it("resets one column, or all of them, to the unstretched defaults", () => {
    const wide = { ...DEFAULT_COLUMN_WIDTHS, status: 400 };
    const { all, onColumnWidthsChange, separator } = renderTable(1566, wide);
    (separator("Status").props.onDoubleClick as () => void)();
    expect(onColumnWidthsChange).toHaveBeenLastCalledWith({ ...wide, status: DEFAULT_COLUMN_WIDTHS.status });

    const reset = all.find((e) => e.type === "button" && [e.props.children].flat().includes("Reset column sizes"))!;
    (reset.props.onClick as () => void)();
    expect(onColumnWidthsChange).toHaveBeenLastCalledWith(DEFAULT_COLUMN_WIDTHS);
  });
});
