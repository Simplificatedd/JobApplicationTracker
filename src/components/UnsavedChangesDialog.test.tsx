import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

describe("UnsavedChangesDialog on phones", () => {
  it("gives Keep editing and Discard 44px below md and keeps 40px from md", () => {
    const markup = renderToStaticMarkup(<UnsavedChangesDialog onCancel={vi.fn()} onConfirm={vi.fn()} />);
    const buttons = [...markup.matchAll(/<button class="([^"]*)"[^>]*>([^<]+)<\/button>/g)];

    expect(buttons.map((match) => match[2])).toEqual(["Keep editing", "Discard"]);
    for (const [, classes] of buttons) expect(classes.split(" ")).toEqual(expect.arrayContaining(["h-10", "max-md:h-11"]));
  });
});

describe("UnsavedChangesDialog for a non-destructive choice", () => {
  it("uses custom labels, keeps the cancel button first and focused, and styles confirm as primary", () => {
    const markup = renderToStaticMarkup(
      <UnsavedChangesDialog cancelLabel="Keep status" confirmLabel="Change status" confirmTone="primary" onCancel={vi.fn()} onConfirm={vi.fn()} />,
    );
    const buttons = [...markup.matchAll(/<button class="([^"]*)"([^>]*)>([^<]+)<\/button>/g)];

    expect(buttons.map((match) => match[3])).toEqual(["Keep status", "Change status"]);
    expect(buttons[0][2]).toContain("data-initial-focus");
    expect(buttons[1][1]).toContain("bg-primary");
    expect(buttons[1][1]).not.toContain("bg-red-600");
  });
});
