import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APPLICATION_TABLE_COLUMNS } from "./ApplicationsTable";
import { ColumnsModal, PhoneSortSelect, SearchScopeToggle } from "./ApplicationsToolbar";
import { DEFAULT_SORT_STATE } from "./applicationFilters";

// Opt into the hook-host style used by AppShell.sidebar.test.ts only for the
// positioning tests; static-markup tests continue using React's real hooks.
const host = vi.hoisted(() => ({ active: false, cursor: 0, slots: [] as unknown[], effects: [] as (() => void)[] }));
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useState(initial: unknown) {
      if (!host.active) return react.useState(initial);
      const i = host.cursor++;
      if (!(i in host.slots)) host.slots[i] = typeof initial === "function" ? initial() : initial;
      return [host.slots[i], (value: unknown) => { host.slots[i] = typeof value === "function" ? value(host.slots[i]) : value; }];
    },
    useRef(initial: unknown) {
      if (!host.active) return react.useRef(initial);
      const i = host.cursor++;
      if (!(i in host.slots)) host.slots[i] = { current: initial };
      return host.slots[i];
    },
    useId() { return host.active ? "test-columns" : react.useId(); },
    useEffect(...args: Parameters<typeof react.useEffect>) {
      if (!host.active) return react.useEffect(...args);
    },
    useLayoutEffect(effect: () => void, deps: unknown[]) {
      if (!host.active) return react.useLayoutEffect(effect, deps);
      const i = host.cursor++; const previous = host.slots[i] as unknown[] | undefined;
      if (previous && deps.every((d, n) => Object.is(d, previous[n]))) return;
      host.slots[i] = deps;
      host.effects.push(effect);
    },
  };
});

function renderColumnsModal(onResetColumnWidths?: () => void) {
  return renderToStaticMarkup(
    <ColumnsModal
      onChange={vi.fn()}
      onClose={vi.fn()}
      onResetColumnWidths={onResetColumnWidths}
      visibleApplicationColumns={["company"]}
    />,
  );
}

describe("Columns dialog", () => {
  it("offers size reset only when resizing is enabled", () => {
    expect(renderColumnsModal(vi.fn())).toContain("Reset column sizes");
    expect(renderColumnsModal()).not.toContain("Reset column sizes");
  });

  it("labels every column checkbox with its column name", () => {
    const markup = renderColumnsModal();
    const checkboxIds = [...markup.matchAll(/<input[^>]*type="checkbox"[^>]*>/g)].map(
      ([input]) => /id="([^"]+)"/.exec(input)?.[1],
    );

    expect(checkboxIds).toHaveLength(APPLICATION_TABLE_COLUMNS.length);
    APPLICATION_TABLE_COLUMNS.forEach((column, index) => {
      const id = checkboxIds[index];

      expect(id).toBeTruthy();
      expect(markup).toContain(`for="${id}">${column.label}</label>`);
    });
  });

  it("keeps the info button out of the label so it cannot become the label's control", () => {
    const labels = renderColumnsModal().match(/<label[\s\S]*?<\/label>/g) ?? [];

    expect(labels).toHaveLength(APPLICATION_TABLE_COLUMNS.length);
    labels.forEach((label) => {
      expect(label).not.toMatch(/<(button|input|select|textarea)\b/);
    });
  });

  it("still offers a tappable description for each column", () => {
    const markup = renderColumnsModal();

    expect(markup.match(/<button aria-expanded="false"/g)).toHaveLength(
      APPLICATION_TABLE_COLUMNS.length,
    );
  });
});

describe("column info tooltip position", () => {
  type Element = { type: unknown; props: Record<string, unknown> };
  function elements(node: unknown): Element[] {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!node || typeof node !== "object" || !("props" in node)) return [];
    const element = node as Element;
    return [element, ...elements(element.props.children)];
  }

  beforeEach(() => {
    host.active = true; host.cursor = 0; host.slots = []; host.effects = [];
    vi.stubGlobal("window", { innerWidth: 852, innerHeight: 393 });
  });
  afterEach(() => { host.active = false; vi.unstubAllGlobals(); });

  it.each([
    ["a dialog with a safe-area border", { left: 17, top: 23, clientLeft: 59, clientTop: 11 }, { left: 100, top: 134 }],
    ["a zero-offset dialog", { left: 0, top: 0, clientLeft: 0, clientTop: 0 }, { left: 176, top: 168 }],
    ["no dialog ancestor", null, { left: 176, top: 168 }],
  ])("positions relative to %s", (_, offset, expected) => {
    const modal = ColumnsModal({ onChange: vi.fn(), onClose: vi.fn(), visibleApplicationColumns: ["company"] });
    const info = elements(modal).find(e => typeof e.type === "function" && e.type.name === "ColumnInfoTooltip")!;
    // Give the tooltip its own hook host, as a mounted child would have.
    host.slots = []; host.effects = [];
    const closest = vi.fn().mockReturnValue(offset && {
      getBoundingClientRect: () => ({ left: offset.left, top: offset.top }),
      clientLeft: offset.clientLeft, clientTop: offset.clientTop,
    });
    const view = () => {
      host.cursor = 0;
      const tree = (info.type as (props: unknown) => Element)(info.props);
      const refs = host.slots.filter(slot => slot && typeof slot === "object" && "current" in slot) as { current: unknown }[];
      refs[0].current = { closest, getBoundingClientRect: () => ({ left: 380, right: 400, top: 140, bottom: 160 }) };
      refs[1].current = elements(tree).some(e => e.type === "span")
        ? { getBoundingClientRect: () => ({ width: 224, height: 60 }) } : null;
      host.effects.splice(0).forEach(effect => effect());
      return tree;
    };

    const closed = view();
    (closed.props.onClick as () => void)();
    view(); // Layout positioning runs after the tooltip ref is attached.
    const tooltip = elements(view()).find(e => e.type === "span")!;
    expect(closest).toHaveBeenCalledWith("dialog");
    expect(tooltip.props.style).toEqual(expected);
  });
});

type ToggleElement = {
  props: { children?: unknown; onClick?: () => void; "aria-pressed"?: boolean };
  type: unknown;
};

function toggleButtons(node: unknown): ToggleElement[] {
  if (Array.isArray(node)) return node.flatMap(toggleButtons);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ToggleElement;
  return [
    ...(element.type === "button" ? [element] : []),
    ...toggleButtons(element.props.children),
  ];
}

describe("Search scope toggle", () => {
  it.each([
    ["active", "Active only"],
    ["archive", "Archived only"],
  ] as const)(
    "switches between all applications and the %s section",
    (viewMode, sectionLabel) => {
      const onChange = vi.fn();
      const buttons = toggleButtons(
        SearchScopeToggle({ onChange, scope: "all", viewMode }),
      );

      expect(buttons.map((button) => button.props.children)).toEqual([
        "Active and archived",
        sectionLabel,
      ]);
      expect(buttons.map((button) => button.props["aria-pressed"])).toEqual([
        true,
        false,
      ]);
      buttons[1].props.onClick?.();
      expect(onChange).toHaveBeenCalledWith("section");
      buttons[0].props.onClick?.();
      expect(onChange).toHaveBeenLastCalledWith("all");
    },
  );
});

describe("phone sort control", () => {
  it("lists the phone sorts with the current one selected", () => {
    const markup = renderToStaticMarkup(
      <PhoneSortSelect onChange={vi.fn()} sort={{ column: "company", direction: "ascending" }} />,
    );

    expect([...markup.matchAll(/<option[^>]*>([^<]+)<\/option>/g)].map((match) => match[1])).toEqual([
      "Last updated",
      "Newest applied",
      "Oldest applied",
      "Company A–Z",
      "Job title A–Z",
      "Status",
    ]);
    expect(markup).toMatch(/value="company:ascending" selected=""/);
  });

  it("keeps a table-only sort visible until another is chosen", () => {
    const onChange = vi.fn();
    const element = PhoneSortSelect({
      onChange,
      sort: { column: "priority", direction: "descending" },
    });

    expect(renderToStaticMarkup(element)).toMatch(/<option disabled="" value="priority:descending" selected="">Table sort<\/option>/);
    (element.props.onChange as (value: string) => void)("updatedAt:descending");
    expect(onChange).toHaveBeenCalledWith(DEFAULT_SORT_STATE);
  });
});

describe("phone filter dialog footer", () => {
  it("gives Reset and Done 44px on phones", () => {
    // The dialog only renders after Filters is pressed, so check the source.
    const source = readFileSync(new URL("./ApplicationsToolbar.tsx", import.meta.url), "utf8");
    const start = source.indexOf("<footer", source.indexOf("function MoreFiltersModal"));
    const footer = source.slice(start, source.indexOf("</footer>", start));
    // Each footer button's class list, found by the button's own label.
    const buttonClasses = (label: string) => {
      const button = footer.slice(footer.lastIndexOf("<button", footer.indexOf(label)));
      return /className="([^"]*)"/.exec(button)?.[1].split(" ") ?? [];
    };

    for (const label of ["Reset", "Done"]) {
      expect(buttonClasses(label)).toEqual(expect.arrayContaining(["h-10", "max-md:h-11"]));
    }
  });
});

describe("phone filter dialog scroll lock", () => {
  it("marks the Filters dialog and locks the page behind it below md only", () => {
    const toolbar = readFileSync(new URL("./ApplicationsToolbar.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
    const filters = toolbar.slice(toolbar.indexOf("function MoreFiltersModal"));

    // The dialog only renders after Filters is pressed, so check the source.
    expect(filters.slice(0, filters.indexOf("</NativeModal>"))).toMatch(/<NativeModal\s+className="applications-filter-dialog /);
    expect(css).toMatch(/max-width:\s*767\.98px\)\s*\{[^}]*html:has\(\.applications-filter-dialog\[open\]\)\s*\{\s*overflow:\s*hidden/);
  });
});
