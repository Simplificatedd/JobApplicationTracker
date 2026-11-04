import { readFileSync } from "node:fs";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AddApplicationModal } from "./AddApplicationModal";

function renderModal(
  overrides: Partial<ComponentProps<typeof AddApplicationModal>> = {},
) {
  return renderToStaticMarkup(
    <AddApplicationModal
      applications={[]}
      coverLetters={[]}
      defaultFollowUpPromptDays={7}
      isOpen
      onClose={vi.fn()}
      onCreate={vi.fn()}
      resumes={[]}
      {...overrides}
    />,
  );
}

describe("AddApplicationModal quick location", () => {
  it("shows a button that fills in the configured location", () => {
    const markup = renderModal({ quickLocation: "Kuala Lumpur" });

    expect(markup).toContain('aria-label="Set location to Kuala Lumpur"');
    expect(markup).toContain(">Kuala Lumpur</span>");
  });

  it("hides the button when no quick location is configured", () => {
    expect(renderModal()).not.toContain("Set location to");
  });
});

describe("AddApplicationModal on phones", () => {
  it("fills the screen below md and keeps the dialog layout from md up", () => {
    const markup = renderModal();

    expect(markup).toMatch(/<dialog[^>]*class="[^"]*\bp-0 max-md:items-start md:p-4\b/);
    expect(markup).toContain(
      'class="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-surface shadow-popover max-md:h-full max-md:max-h-none max-md:rounded-none"',
    );
  });

  it("pins Cancel and Save in a two-column footer outside the scrolling form", () => {
    const markup = renderModal();
    const footer = /<\/form><div class="([^"]*)">([\s\S]*?)<\/div>/.exec(markup);

    expect(footer?.[1]).toContain("max-md:grid max-md:grid-cols-2");
    expect(footer?.[2]).toMatch(/max-md:h-11[^>]*>Cancel<\/button>/);
    expect(footer?.[2]).toMatch(/form="add-application-form"[^>]*type="submit"[^>]*>Save<\/button>/);
  });

  it("stacks the upload name and version fields until md", () => {
    const markup = renderModal();

    expect(markup).not.toContain("sm:grid-cols-2");
    expect(markup.match(/class="mt-3 grid gap-3 md:grid-cols-2"/g)).toHaveLength(2);
  });
});

describe("phone quick location button", () => {
  it("matches the 44px phone fields beside it and keeps 40px from md", () => {
    const markup = renderModal({ quickLocation: "Kuala Lumpur" });
    const tag = markup.slice(markup.lastIndexOf("<button", markup.indexOf('aria-label="Set location to Kuala Lumpur"')));
    const classes = (/class="([^"]*)"/.exec(tag)?.[1] ?? "").split(" ");

    expect(classes).toEqual(expect.arrayContaining(["h-10", "max-md:h-11"]));
  });
});

describe("phone Add job scroll lock", () => {
  it("marks the form dialog for the phone lock and keeps its scrolling inside", () => {
    const markup = renderModal({});
    const dialog = markup.slice(markup.indexOf("<dialog"), markup.indexOf(">", markup.indexOf("<dialog")) + 1);
    const form = markup.slice(markup.indexOf("<form"), markup.indexOf(">", markup.indexOf("<form")) + 1);

    expect(dialog).toContain("add-application-dialog");
    expect(form).toContain("max-md:overscroll-contain");
  });

  it("locks the page behind it below md only", () => {
    const css = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

    expect(css).toMatch(/max-width:\s*767\.98px\)\s*\{[^}]*html:has\(\.add-application-dialog\[open\]\)[^{]*\{\s*overflow:\s*hidden/);
  });
});
