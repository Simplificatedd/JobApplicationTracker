import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

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
    expect(navClass).toContain("overflow-x-auto");
    expect(navClass).toContain("xl:grid");
    expect(navClass).not.toMatch(/(^| )grid-cols-2/);
  });

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
