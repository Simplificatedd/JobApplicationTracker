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
