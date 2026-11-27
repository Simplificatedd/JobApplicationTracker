import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { application } from "../../test/assessmentFixtures";
import { ContactsPanel } from "./ContactsPanel";

function renderPanel(overrides: Partial<ComponentProps<typeof ContactsPanel>> = {}) {
  return renderToStaticMarkup(
    <ContactsPanel
      application={application}
      contacts={[]}
      displayMode="side_panel"
      onAddContact={vi.fn()}
      onClose={vi.fn()}
      onDeleteContact={vi.fn()}
      onUpdateContact={vi.fn()}
      {...overrides}
    />,
  );
}

describe("contacts panel initial focus (#287)", () => {
  it("starts in the new contact's Name when opened to add a contact", () => {
    const inputs = renderPanel({ focusNewContact: true }).match(/<input[^>]*>/g) ?? [];
    expect(inputs.filter((input) => input.includes("data-initial-focus"))).toHaveLength(1);
    expect(inputs[0]).toContain("data-initial-focus");
  });

  it("leaves focus on the panel when opened from the table", () => {
    expect(renderPanel()).not.toContain("data-initial-focus");
  });
});

describe("contacts form layout (#329)", () => {
  it("keeps the close button full size and puts Add after Notes", () => {
    const markup = renderPanel();
    expect(markup).toMatch(/class="icon-button shrink-0"[^>]*>.*?Close contacts/);
    expect(markup.indexOf("<textarea")).toBeLessThan(markup.indexOf(">Add</button>"));
  });
});
