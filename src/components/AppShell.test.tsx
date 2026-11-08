import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AppShell,
  findVisibleNavigationTarget,
  MorePanel,
  navigationItems,
  readSidebarState,
  SIDEBAR_STATE_STORAGE_KEY,
  writeSidebarState,
} from "./AppShell";

function renderShell(overrides: Partial<ComponentProps<typeof AppShell>> = {}) {
  return renderToStaticMarkup(
    <AppShell
      currentView="applications"
      enableBetaAnalytics={false}
      enableNotificationBell={false}
      groupedNotifications={false}
      navigationDisplayMode="side"
      notifications={[]}
      onDismissNotification={vi.fn()}
      onMarkNotificationsOpened={vi.fn()}
      onOpenApplicationFromNotification={vi.fn()}
      onPrimaryAction={vi.fn()}
      onUpdateApplication={vi.fn()}
      onUpdateAssessment={vi.fn()}
      onUpdateInterview={vi.fn()}
      onViewChange={vi.fn()}
      {...overrides}
    >
      <p>Page content</p>
    </AppShell>,
  );
}

function navigations(markup: string) {
  return [...markup.matchAll(/<nav aria-label="Primary navigation"[\s\S]*?<\/nav>/g)].map(
    (match) => match[0],
  );
}

function labels(markup: string) {
  return [...markup.matchAll(/<button[^>]*>(?:<svg[\s\S]*?<\/svg>)?<span[^>]*>([^<]+)<\/span>/g)].map(
    (match) => match[1],
  );
}

function classOf(markup: string, marker: string) {
  const tag = markup.slice(markup.lastIndexOf("<", markup.indexOf(marker)));
  return /class="([^"]*)"/.exec(tag)?.[1] ?? "";
}

describe("AppShell responsive layout", () => {
  it("shows side navigation as one scrolling row below xl", () => {
    const navClass = classOf(renderShell(), 'aria-label="Primary navigation"');

    expect(navClass).toContain("flex");
    expect(navClass).toContain("scroll-strip");
    expect(navClass).toContain("xl:grid");
    expect(navClass).not.toMatch(/(^| )grid-cols-2/);
  });

  it.each(["side", "top"] as const)(
    "pads the %s navigation row so focus rings are not clipped",
    (navigationDisplayMode) => {
      const navClass = classOf(
        renderShell({ navigationDisplayMode }),
        'aria-label="Primary navigation"',
      );

      expect(navClass).toContain("scroll-strip");
      expect(navClass).toMatch(/(^| )p-1( |$)/);
    },
  );

  it("marks only the current page in each navigation", () => {
    const markup = renderShell({ currentView: "resumes" });
    const [tabletNavigation, bottomNavigation] = navigations(markup);

    expect(tabletNavigation.match(/aria-current="page"/g)).toHaveLength(1);
    expect(tabletNavigation).toMatch(/aria-current="page"[^>]*>.*?Resumes/);
    // Resumes lives behind More on phones, so More is the active tab.
    expect(bottomNavigation.match(/aria-current="page"/g)).toHaveLength(1);
    expect(bottomNavigation).toMatch(/aria-current="page"[^>]*>.*?More/);
  });

  it("keeps the navigation toggle below every overlay layer", () => {
    const toggleClass = classOf(renderShell(), 'aria-label="Hide side navigation"');

    expect(toggleClass).toContain("z-30");
    expect(toggleClass).not.toMatch(/z-(40|50|\[)/);
  });

  it.each([
    ["applications", "Add job"],
    ["resumes", "Upload resume"],
    ["coverLetters", "Upload cover letter"],
  ] as const)(
    "keeps the %s action on the title row as an icon button on phones",
    (currentView, label) => {
      const markup = renderShell({ currentView });

      expect(markup).toContain(`aria-label="${label}"`);
      expect(markup).toContain(`<span class="hidden md:inline">${label}</span>`);
      expect(markup).not.toContain("w-full items-center justify-end");
    },
  );

  it("hides the Workspace eyebrow on phones", () => {
    expect(renderShell()).toContain(
      '<p class="hidden text-sm text-muted sm:block">Workspace</p>',
    );
  });
});

describe("AppShell phone navigation", () => {
  it.each([
    [false, ["Applications", "Archive", "More"]],
    [true, ["Applications", "Archive", "Analytics", "More"]],
  ] as const)(
    "shows the bottom tabs with analytics %s",
    (enableBetaAnalytics, tabs) => {
      const bottomNavigation = navigations(renderShell({ enableBetaAnalytics }))[1];

      expect(labels(bottomNavigation)).toEqual(tabs);
      expect(classOf(bottomNavigation, "<nav")).toContain("md:hidden");
      expect(classOf(bottomNavigation, "<nav")).toContain("pb-[env(safe-area-inset-bottom)]");
    },
  );

  it("keeps the tablet and desktop navigation and hides it on phones", () => {
    for (const navigationDisplayMode of ["side", "top"] as const) {
      const markup = renderShell({ navigationDisplayMode });
      const tabletNavigation = navigations(markup)[0];

      expect(labels(tabletNavigation)).toEqual([
        "Applications", "Archive", "Resumes", "Cover Letters", "Settings",
      ]);
      const row = navigationDisplayMode === "side" ? "<aside" : "border-b border-border bg-surface px-4 py-3";
      expect(classOf(markup, row)).toContain("max-md:hidden");
    }
    expect(classOf(renderShell(), 'aria-label="Hide side navigation"')).toContain("max-md:hidden");
  });

  it("shows the header bell on phones and desktops, but not beside the tablet row's bell", () => {
    const markup = renderShell({ enableNotificationBell: true });

    expect(markup).toContain('<div class="md:max-lg:hidden">');
    expect(markup).toContain('<div class="lg:hidden">');
  });

  it("pads page content clear of the bottom bar", () => {
    expect(renderShell()).toContain("max-md:pb-[calc(4.75rem+env(safe-area-inset-bottom))]");
  });

  it("lists the views not on the bottom bar in the More panel", () => {
    const items = navigationItems;
    const markup = renderToStaticMarkup(
      <MorePanel currentView="settings" items={items} onClose={vi.fn()} onViewChange={vi.fn()} />,
    );
    const moreNavigation = /<nav aria-label="More navigation"[\s\S]*?<\/nav>/.exec(markup)?.[0] ?? "";

    expect(markup).toContain('aria-labelledby="more-navigation-title"');
    expect(markup).toMatch(/data-initial-focus[^>]*>.*?Close/);
    expect([...moreNavigation.matchAll(/<\/svg>([^<]+)<\/button>/g)].map((m) => m[1])).toEqual([
      "Resumes", "Cover Letters", "Settings",
    ]);
    expect(moreNavigation).toMatch(/aria-current="page"[^>]*>.*?Settings/);
  });

  it("closes the More panel before navigating", () => {
    const calls: string[] = [];
    const panel = MorePanel({
      currentView: "applications",
      items: navigationItems,
      onClose: () => calls.push("close"),
      onViewChange: (view) => calls.push(view),
    });
    const settings = flatten(panel).find(
      (node) => node.type === "button" && JSON.stringify(node.props.children).includes("Settings"),
    )!;

    (settings.props.onClick as () => void)();
    expect(calls).toEqual(["close", "settings"]);
  });
});

type Node = { type: unknown; props: Record<string, unknown> };
function flatten(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  return [node as Node, ...flatten((node as Node).props.children)];
}

describe("AppShell phone primary action", () => {
  it("sizes the top-bar primary action to 44px on phones", () => {
    const classes = classOf(renderShell(), 'aria-label="Add job"').split(" ");

    expect(classes).toEqual(expect.arrayContaining(["h-10", "min-w-10", "max-md:h-11", "max-md:min-w-11"]));
  });
});

describe("More sheet focus at the breakpoint", () => {
  afterEach(() => vi.unstubAllGlobals());

  const hidden = { getClientRects: () => [] };
  const visible = { getClientRects: () => [{}] };
  const stubDocument = (matches: Record<string, unknown[]>) =>
    vi.stubGlobal("document", { querySelectorAll: (selector: string) => matches[selector] ?? [] });

  it("falls back to the current page's visible navigation item", () => {
    const toggle = { getClientRects: () => [{}] };
    stubDocument({ 'nav [aria-current="page"]': [hidden, visible], "[data-navigation-toggle]": [toggle] });

    expect(findVisibleNavigationTarget()).toBe(visible);
  });

  it("falls back to the navigation toggle when the desktop navigation is hidden", () => {
    const toggle = { getClientRects: () => [{}] };
    // Only the phone bottom bar's current item exists, and it's hidden.
    stubDocument({ 'nav [aria-current="page"]': [hidden], "[data-navigation-toggle]": [toggle] });

    expect(findVisibleNavigationTarget()).toBe(toggle);
  });

  it("marks the navigation toggle so the fallback can find it", () => {
    expect(renderShell()).toMatch(/<button aria-pressed="true" aria-label="Hide side navigation"[^>]*data-navigation-toggle="true"/);
  });

  it("gives the More sheet that fallback", () => {
    const sheet = MorePanel({ currentView: "settings", items: navigationItems, onClose: vi.fn(), onViewChange: vi.fn() });

    expect(sheet.props.fallbackFocus).toBe(findVisibleNavigationTarget);
  });
});

describe("navigation toggle in landscape on notched phones", () => {
  it("offsets the toggle by the safe-area insets so it clears the notch", () => {
    const classes = classOf(renderShell(), "data-navigation-toggle").split(" ");

    expect(classes).toEqual(expect.arrayContaining([
      "left-[calc(1rem+env(safe-area-inset-left))]",
      "top-[calc(1rem+env(safe-area-inset-top))]",
    ]));
    expect(classes).not.toContain("left-4");
  });
});

function stubBrowser({
  desktop = true,
  stored = null as string | null,
  storageFails = false,
} = {}) {
  const storage = new Map<string, string>();

  if (stored !== null) {
    storage.set(SIDEBAR_STATE_STORAGE_KEY, stored);
  }

  const fail = () => {
    throw new Error("Storage unavailable");
  };
  vi.stubGlobal("window", {
    localStorage: {
      getItem: storageFails ? fail : (key: string) => storage.get(key) ?? null,
      setItem: storageFails
        ? fail
        : (key: string, value: string) => storage.set(key, value),
    },
    matchMedia: (query: string) => ({ matches: query.includes("min-width") && desktop, addEventListener() {}, removeEventListener() {} }),
  });

  return storage;
}

describe("AppShell sidebar state", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(["expanded", "compact", "hidden"] as const)(
    "reads a saved %s state",
    (stored) => {
      stubBrowser({ stored });

      expect(readSidebarState()).toBe(stored);
    },
  );

  it.each([null, "", "collapsed", "HIDDEN"])(
    "falls back to expanded for %j",
    (stored) => {
      stubBrowser({ stored });

      expect(readSidebarState()).toBe("expanded");
    },
  );

  it("falls back to expanded and keeps working when storage is unavailable", () => {
    stubBrowser({ storageFails: true });

    expect(readSidebarState()).toBe("expanded");
    expect(() => writeSidebarState("compact")).not.toThrow();
  });

  it("saves the state per browser", () => {
    const storage = stubBrowser();
    writeSidebarState("hidden");

    expect(storage.get(SIDEBAR_STATE_STORAGE_KEY)).toBe("hidden");
  });

  it("starts hidden on desktop when hidden was saved", () => {
    stubBrowser({ stored: "hidden" });
    const markup = renderShell();

    expect(markup).toContain('aria-label="Show side navigation"');
    expect(markup).not.toContain("<aside");
  });

  it("ignores a saved hidden state below 1280px", () => {
    stubBrowser({ desktop: false, stored: "hidden" });

    expect(renderShell()).toContain('aria-label="Primary navigation"');
  });

  it("renders a saved compact state as a 64px icon rail", () => {
    stubBrowser({ stored: "compact" });
    const markup = renderShell({ currentView: "resumes" });

    expect(classOf(markup, "<aside")).toContain("xl:w-16");
    expect(classOf(markup, "<aside")).not.toContain("--side-navigation-width");
    expect(markup).not.toContain('aria-label="Resize side navigation"');
    expect(markup).toContain('aria-label="Job Application Tracker" class=');
    expect(markup).toMatch(/aria-current="page"[^>]*>.*?<span class="truncate xl:sr-only">Resumes<\/span>/);
    expect(markup.match(/xl:sr-only/g)).toHaveLength(5);
    // Compact counts as shown: the toggle still offers to hide it.
    expect(markup).toContain('aria-label="Hide side navigation"');
  });

  it("keeps the resizable expanded sidebar by default", () => {
    stubBrowser();
    const markup = renderShell();

    expect(classOf(markup, "<aside")).toContain("xl:w-[var(--side-navigation-width)]");
    expect(markup).toContain('aria-label="Resize side navigation"');
    expect(markup).not.toContain("xl:sr-only");
  });

  it.each([
    [null, "Collapse sidebar", "true", "left-3.5"],
    ["compact", "Expand sidebar", "false", "left-2.5"],
  ])(
    "offers one desktop control to switch density near the toggle (saved %j)",
    (stored, label, expanded, position) => {
      stubBrowser({ stored });
      const markup = renderShell();

      expect(markup).toContain(`aria-expanded="${expanded}" aria-label="${label}"`);
      expect(classOf(markup, `aria-label="${label}"`)).toContain("hidden size-11 xl:inline-flex");
      expect(classOf(markup, `aria-label="${label}"`)).toContain(`absolute top-16`);
      expect(classOf(markup, `aria-label="${label}"`)).toContain(position);
    },
  );

  it("has no density control in top navigation", () => {
    stubBrowser({ stored: "compact" });
    const markup = renderShell({ navigationDisplayMode: "top" });

    expect(markup).not.toContain("Expand sidebar");
    expect(markup).not.toContain("Collapse sidebar");
  });

  it("ignores a saved state in top navigation", () => {
    stubBrowser({ stored: "hidden" });
    const markup = renderShell({ navigationDisplayMode: "top" });

    expect(markup).toContain('aria-label="Hide top navigation"');
    expect(markup).toContain('aria-label="Primary navigation"');
  });

  it("ignores a saved compact state in top navigation", () => {
    stubBrowser({ stored: "compact" });
    const markup = renderShell({ navigationDisplayMode: "top" });

    expect(markup).not.toContain("xl:sr-only");
    expect(markup).not.toContain("xl:w-16");
  });
});
