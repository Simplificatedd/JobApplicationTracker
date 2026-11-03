import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AppShell,
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

  it("marks only the current page in the navigation", () => {
    const markup = renderShell({ currentView: "resumes" });

    expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
    expect(markup).toMatch(/aria-current="page"[^>]*>.*?Resumes/);
  });

  it("keeps the navigation toggle below every overlay layer", () => {
    const toggleClass = classOf(renderShell(), 'aria-label="Hide side navigation"');

    expect(toggleClass).toContain("z-30");
    expect(toggleClass).not.toMatch(/z-(40|50|\[)/);
  });

  it.each([
    ["applications", "Add job", "Add job"],
    ["resumes", "Upload resume", "Upload"],
    ["coverLetters", "Upload cover letter", "Upload"],
  ] as const)(
    "keeps the %s action on the title row with a short phone label",
    (currentView, fullLabel, shortLabel) => {
      const markup = renderShell({ currentView });

      expect(markup).toContain(`aria-label="${fullLabel}"`);
      expect(markup).toContain(`<span class="sm:hidden">${shortLabel}</span>`);
      expect(markup).toContain(`<span class="hidden sm:inline">${fullLabel}</span>`);
      expect(markup).not.toContain("w-full items-center justify-end");
    },
  );

  it("hides the Workspace eyebrow on phones", () => {
    expect(renderShell()).toContain(
      '<p class="hidden text-sm text-muted sm:block">Workspace</p>',
    );
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
    matchMedia: () => ({ matches: desktop }),
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
    expect(markup).not.toContain('aria-label="Primary navigation"');
  });

  it("ignores a saved hidden state below 1280px", () => {
    stubBrowser({ desktop: false, stored: "hidden" });

    expect(renderShell()).toContain('aria-label="Primary navigation"');
  });

  it("ignores a saved state in top navigation", () => {
    stubBrowser({ stored: "hidden" });
    const markup = renderShell({ navigationDisplayMode: "top" });

    expect(markup).toContain('aria-label="Hide top navigation"');
    expect(markup).toContain('aria-label="Primary navigation"');
  });
});
