import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { ContactInput } from "../../store/useTrackerStore";
import type { Application, ApplicationContact } from "../../types/application";

interface ContactsPanelProps {
  application: Application;
  contacts: ApplicationContact[];
  displayMode: "side_panel" | "modal";
  onAddContact: (input: ContactInput) => ApplicationContact;
  onClose: () => void;
  onDeleteContact: (id: string) => void;
  onUpdateContact: (id: string, input: Partial<ContactInput>) => void;
}

interface ContactDraft {
  email: string;
  linkedInUrl: string;
  name: string;
  notes: string;
  phone: string;
  role: string;
}

const emptyDraft: ContactDraft = {
  email: "",
  linkedInUrl: "",
  name: "",
  notes: "",
  phone: "",
  role: "",
};

export function ContactsPanel({
  application,
  contacts,
  displayMode,
  onAddContact,
  onClose,
  onDeleteContact,
  onUpdateContact,
}: ContactsPanelProps) {
  const [newContact, setNewContact] = useState(emptyDraft);

  const panelClass =
    displayMode === "modal"
      ? "mx-auto my-auto h-auto max-h-[88vh] w-full max-w-2xl rounded-lg"
      : "ml-auto h-full w-full max-w-xl sm:rounded-l-lg";

  function addContact() {
    const name = newContact.name.trim();

    if (!name) {
      return;
    }

    onAddContact({
      applicationId: application.id,
      name,
      email: trimOptional(newContact.email),
      linkedInUrl: trimOptional(newContact.linkedInUrl),
      notes: trimOptional(newContact.notes),
      phone: trimOptional(newContact.phone),
      role: trimOptional(newContact.role),
    });
    setNewContact(emptyDraft);
  }

  return (
    <aside
      aria-labelledby="contacts-panel-title"
      aria-modal="true"
      className={`modal-overlay fixed inset-0 z-50 flex p-0 ${
        displayMode === "modal" ? "items-center p-4" : ""
      }`}
      role="dialog"
    >
      <div className={`flex flex-col overflow-hidden bg-surface shadow-popover ${panelClass}`}>
        <header className="flex items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted">{application.company}</p>
            <h2
              className="mt-1 truncate text-lg font-semibold text-foreground"
              id="contacts-panel-title"
            >
              Contacts for {application.jobTitle}
            </h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button">
            <X aria-hidden="true" size={18} />
            <span className="sr-only">Close contacts</span>
          </button>
        </header>

        <div className="space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
          <section className="rounded-lg border border-border bg-surface-raised p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <ContactField
                label="Name"
                onChange={(value) =>
                  setNewContact((current) => ({ ...current, name: value }))
                }
                required
                value={newContact.name}
              />
              <ContactField
                label="Role"
                onChange={(value) =>
                  setNewContact((current) => ({ ...current, role: value }))
                }
                value={newContact.role}
              />
              <ContactField
                label="Email"
                onChange={(value) =>
                  setNewContact((current) => ({ ...current, email: value }))
                }
                type="email"
                value={newContact.email}
              />
              <ContactField
                label="Phone"
                onChange={(value) =>
                  setNewContact((current) => ({ ...current, phone: value }))
                }
                value={newContact.phone}
              />
              <ContactField
                label="LinkedIn URL"
                onChange={(value) =>
                  setNewContact((current) => ({ ...current, linkedInUrl: value }))
                }
                type="url"
                value={newContact.linkedInUrl}
              />
              <button
                className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-500"
                disabled={!newContact.name.trim()}
                onClick={addContact}
                type="button"
              >
                <Plus aria-hidden="true" size={16} />
                Add
              </button>
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-sm font-medium text-foreground">
                  Notes
                </span>
                <textarea
                  className="field-control min-h-20 resize-y"
                  onChange={(event) =>
                    setNewContact((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  value={newContact.notes}
                />
              </label>
            </div>
          </section>

          <section className="space-y-3">
            {contacts.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted">
                No contacts linked.
              </p>
            ) : (
              contacts.map((contact) => (
                <ContactCard
                  contact={contact}
                  key={contact.id}
                  onDeleteContact={onDeleteContact}
                  onUpdateContact={onUpdateContact}
                />
              ))
            )}
          </section>
        </div>
      </div>
    </aside>
  );
}

function ContactCard({
  contact,
  onDeleteContact,
  onUpdateContact,
}: {
  contact: ApplicationContact;
  onDeleteContact: (id: string) => void;
  onUpdateContact: (id: string, input: Partial<ContactInput>) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<ContactDraft>(() => toDraft(contact));

  function confirm() {
    onUpdateContact(contact.id, {
      applicationId: contact.applicationId,
      email: trimOptional(draft.email),
      linkedInUrl: trimOptional(draft.linkedInUrl),
      name: draft.name.trim() || contact.name,
      notes: trimOptional(draft.notes),
      phone: trimOptional(draft.phone),
      role: trimOptional(draft.role),
    });
    setIsEditing(false);
  }

  function cancel() {
    setDraft(toDraft(contact));
    setIsEditing(false);
  }

  function remove() {
    if (window.confirm(`Delete contact "${contact.name}"?`)) {
      onDeleteContact(contact.id);
    }
  }

  if (isEditing) {
    return (
      <div className="rounded-lg border border-border p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {(["name", "role", "email", "phone", "linkedInUrl"] as const).map(
            (key) => (
              <ContactField
                key={key}
                label={labelForContactKey(key)}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, [key]: value }))
                }
                value={draft[key]}
              />
            ),
          )}
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-sm font-medium text-foreground">
              Notes
            </span>
            <textarea
              className="field-control min-h-20 resize-y"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              value={draft.notes}
            />
          </label>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button className="icon-button" onClick={confirm} type="button">
            <Check aria-hidden="true" size={18} />
            <span className="sr-only">Confirm contact edit</span>
          </button>
          <button className="icon-button" onClick={cancel} type="button">
            <X aria-hidden="true" size={18} />
            <span className="sr-only">Cancel contact edit</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {contact.name}
          </p>
          <p className="mt-1 text-sm text-muted">
            {[contact.role, contact.email, contact.phone].filter(Boolean).join(" / ") ||
              "Contact details blank"}
          </p>
          {contact.linkedInUrl ? (
            <a
              className="mt-2 block truncate text-sm font-medium text-primary hover:text-blue-700"
              href={contact.linkedInUrl}
              rel="noreferrer"
              target="_blank"
            >
              {contact.linkedInUrl}
            </a>
          ) : null}
          {contact.notes ? (
            <p className="mt-2 text-sm text-foreground">{contact.notes}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            className="icon-button"
            onClick={() => setIsEditing(true)}
            type="button"
          >
            <Pencil aria-hidden="true" size={18} />
            <span className="sr-only">Edit contact</span>
          </button>
          <button
            className="icon-button border-red-200 text-destructive hover:bg-red-50"
            onClick={remove}
            type="button"
          >
            <Trash2 aria-hidden="true" size={18} />
            <span className="sr-only">Delete contact</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function ContactField({
  label,
  onChange,
  required = false,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
        {required ? <span className="text-destructive">*</span> : null}
      </span>
      <input
        className="field-control"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function toDraft(contact: ApplicationContact): ContactDraft {
  return {
    email: contact.email ?? "",
    linkedInUrl: contact.linkedInUrl ?? "",
    name: contact.name,
    notes: contact.notes ?? "",
    phone: contact.phone ?? "",
    role: contact.role ?? "",
  };
}

function trimOptional(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function labelForContactKey(key: keyof Omit<ContactDraft, "notes">) {
  const labels = {
    email: "Email",
    linkedInUrl: "LinkedIn URL",
    name: "Name",
    phone: "Phone",
    role: "Role",
  };

  return labels[key];
}
