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
  it("stacks the upload name and version fields until md", () => {
    const markup = renderModal();

    expect(markup).not.toContain("sm:grid-cols-2");
    expect(markup.match(/class="mt-3 grid gap-3 md:grid-cols-2"/g)).toHaveLength(2);
  });
});
