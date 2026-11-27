import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { application } from "../../test/assessmentFixtures";
import { ContactsPanel, contactDraftToUpdate, getContactErrors } from "./ContactsPanel";

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

describe("contact email and LinkedIn checks (#310)", () => {
  const draft = { name: "Sam", role: "", email: "", phone: "", linkedInUrl: "", notes: "" };

  it("rejects an invalid email or LinkedIn URL and accepts valid ones", () => {
    expect(getContactErrors({ ...draft, email: "not-an-email", linkedInUrl: "not a url" })).toEqual({
      email: expect.stringContaining("Enter an email address"),
      linkedInUrl: expect.stringContaining("Enter a web address"),
    });
    expect(getContactErrors({ ...draft, email: " sam@example.com ", linkedInUrl: "linkedin.com/in/sam" })).toEqual({});
  });

  it("skips unchanged saved values and saves LinkedIn with https://", () => {
    const saved = { ...draft, email: "old-invalid" };
    expect(getContactErrors(saved, saved)).toEqual({});
    const original = { id: "c1", applicationId: "a1", name: "Sam", createdAt: "", updatedAt: "" };
    expect(contactDraftToUpdate({ ...draft, linkedInUrl: "linkedin.com/in/sam" }, original as never)).toEqual({
      linkedInUrl: "https://linkedin.com/in/sam",
    });
  });
});
