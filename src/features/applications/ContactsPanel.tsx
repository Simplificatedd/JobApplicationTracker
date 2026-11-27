import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Fragment, useEffect, useId, useState } from "react";
import { UnsavedChangesDialog } from "../../components/UnsavedChangesDialog";
import { NativeModal } from "../../components/NativeModal";
import { changedDraftFields } from "../../lib/editIntent";
import { getSafeHttpUrl, normalizeApplicationUrl } from "../../lib/urls";
import type { ContactInput, MutationResult } from "../../store/useTrackerStore";
import type { Application, ApplicationContact } from "../../types/application";

interface ContactsPanelProps {
  application: Application;
  contacts: ApplicationContact[];
  displayMode: "side_panel" | "modal";
  // Focus the new contact's Name on open instead of the dialog itself.
  focusNewContact?: boolean;
  onAddContact: (
    input: ContactInput,
  ) => Promise<MutationResult<ApplicationContact>>;
  onClose: () => void;
  onDeleteContact: (id: string) => Promise<MutationResult>;
  onUpdateContact: (
    id: string,
    input: Partial<ContactInput>,
    expectedContact?: ApplicationContact,
  ) => Promise<MutationResult>;
}

interface ContactDraft {
  email: string;
  linkedInUrl: string;
  name: string;
  notes: string;
  phone: string;
  role: string;
}

type ContactErrors = Partial<Record<"email" | "linkedInUrl", string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  focusNewContact = false,
  onAddContact,
  onClose,
  onDeleteContact,
  onUpdateContact,
}: ContactsPanelProps) {
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [isDiscardWarningOpen, setIsDiscardWarningOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newContact, setNewContact] = useState(emptyDraft);
  const [operationError, setOperationError] = useState("");
  const [newContactErrors, setNewContactErrors] = useState<ContactErrors>({});
  const fieldId = useId();


  const panelClass =
    displayMode === "modal"
      ? "mx-auto my-auto h-auto max-h-[88dvh] w-full max-w-2xl rounded-lg"
      : "ml-auto h-full w-full max-w-xl sm:rounded-l-lg";

  async function addContact() {
    const name = newContact.name.trim();

    if (!name) {
      return;
    }

    const errors = getContactErrors(newContact);
    setNewContactErrors(errors);
    if (focusFirstError(errors, fieldId)) {
      return;
    }

    setIsAdding(true);
    setOperationError("");
    const result = await onAddContact({
      applicationId: application.id,
      name,
      email: trimOptional(newContact.email),
      linkedInUrl: normalizeLinkedInUrl(newContact.linkedInUrl),
      notes: trimOptional(newContact.notes),
      phone: trimOptional(newContact.phone),
      role: trimOptional(newContact.role),
    });
    setIsAdding(false);

    if (!result.ok) {
      setOperationError(result.error);
      return;
    }

    setNewContact(emptyDraft);
  }

  function requestClose() {
    if (isAdding || editingContactId) {
      return;
    }

    if (isContactDraftDirty(newContact, emptyDraft)) {
      setIsDiscardWarningOpen(true);
      return;
    }

    onClose();
  }

  function updateNewContact(key: keyof ContactDraft, value: string) {
    setNewContact((current) => ({ ...current, [key]: value }));
    setNewContactErrors((current) => ({ ...current, [key]: undefined }));
  }

  function discardAndClose() {
    setNewContact(emptyDraft);
    setNewContactErrors({});
    setIsDiscardWarningOpen(false);
    onClose();
  }


  return (
    <NativeModal
      labelledBy="contacts-panel-title"
      onRequestClose={requestClose}
      className={`modal-overlay fixed inset-0 z-50 flex p-0 ${
        displayMode === "modal" ? "items-center p-4" : ""
      }`}
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
          <button
            className="icon-button shrink-0"
            disabled={isAdding || Boolean(editingContactId)}
            onClick={requestClose}
            type="button"
          >
            <X aria-hidden="true" size={18} />
            <span className="sr-only">Close contacts</span>
          </button>
        </header>

        {editingContactId ? <p className="px-4 py-2 text-sm text-muted" role="status">Save or cancel the contact edit before closing.</p> : null}
        <div className="space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
          <section className="rounded-lg border border-border bg-surface-raised p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <ContactField
                initialFocus={focusNewContact}
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
                error={newContactErrors.email}
                id={`${fieldId}-email`}
                label="Email"
                onChange={(value) => updateNewContact("email", value)}
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
                error={newContactErrors.linkedInUrl}
                id={`${fieldId}-linkedInUrl`}
                label="LinkedIn URL"
                onChange={(value) => updateNewContact("linkedInUrl", value)}
                type="url"
                value={newContact.linkedInUrl}
              />
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
              <button
                className="inline-flex h-10 items-center justify-center gap-2 justify-self-end rounded-lg sm:col-span-2 bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-500"
                disabled={!newContact.name.trim() || isAdding}
                onClick={addContact}
                type="button"
              >
                <Plus aria-hidden="true" size={16} />
                {isAdding ? "Adding..." : "Add"}
              </button>
            </div>
            {operationError ? (
              <p className="mt-3 text-sm font-medium text-destructive" role="alert">
                {operationError}
              </p>
            ) : null}
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
                  onEditingChange={setEditingContactId}
                  onDeleteContact={onDeleteContact}
                  onUpdateContact={onUpdateContact}
                />
              ))
            )}
          </section>
        </div>
        {isDiscardWarningOpen ? (
          <UnsavedChangesDialog
            body={
              editingContactId
                ? "Discard unsaved contact edits and close contacts?"
                : "Discard the new contact draft and close contacts?"
            }
            confirmLabel="Discard and close"
            onCancel={() => setIsDiscardWarningOpen(false)}
            onConfirm={discardAndClose}
          />
        ) : null}
      </div>
    </NativeModal>
  );
}

function ContactCard({
  contact,
  onEditingChange,
  onDeleteContact,
  onUpdateContact,
}: {
  contact: ApplicationContact;
  onEditingChange: (contactId: string | null) => void;
  onDeleteContact: (id: string) => Promise<MutationResult>;
  onUpdateContact: (
    id: string,
    input: Partial<ContactInput>,
    expectedContact?: ApplicationContact,
  ) => Promise<MutationResult>;
}) {
  const safeLinkedInUrl = getSafeHttpUrl(contact.linkedInUrl);
  const [isEditing, setIsEditing] = useState(false);
  const [isDiscardWarningOpen, setIsDiscardWarningOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [operationError, setOperationError] = useState("");
  const [draft, setDraft] = useState<ContactDraft>(() => toDraft(contact));
  const [editBase, setEditBase] = useState(() => structuredClone(contact));
  const [errors, setErrors] = useState<ContactErrors>({});
  const fieldId = useId();


  useEffect(() => {
    onEditingChange(isEditing ? contact.id : null);

    return () => {
      if (isEditing) {
        onEditingChange(null);
      }
    };
  }, [contact.id, isEditing, onEditingChange]);

  async function confirm() {
    const draftErrors = getContactErrors(draft, toDraft(editBase));
    setErrors(draftErrors);
    if (focusFirstError(draftErrors, fieldId)) {
      return;
    }

    setIsSaving(true);
    setOperationError("");
    const result = await onUpdateContact(
      contact.id, contactDraftToUpdate(draft, editBase), editBase,
    );
    setIsSaving(false);

    if (!result.ok) {
      setOperationError(result.error);
      return;
    }

    setIsEditing(false);
  }

  function cancel() {
    setDraft(toDraft(contact));
    setErrors({});
    setIsEditing(false);
  }

  function requestCancel() {
    if (isSaving) {
      return;
    }

    if (isContactDraftDirty(draft, toDraft(editBase))) {
      setIsDiscardWarningOpen(true);
      return;
    }

    cancel();
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
                error={key === "email" || key === "linkedInUrl" ? errors[key] : undefined}
                id={`${fieldId}-${key}`}
                key={key}
                label={labelForContactKey(key)}
                onChange={(value) => {
                  setDraft((current) => ({ ...current, [key]: value }));
                  setErrors((current) => ({ ...current, [key]: undefined }));
                }}
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
          <button
            className="icon-button"
            disabled={isSaving}
            onClick={confirm}
            type="button"
          >
            <Check aria-hidden="true" size={18} />
            <span className="sr-only">Confirm contact edit</span>
          </button>
          <button
            className="icon-button"
            disabled={isSaving}
            onClick={requestCancel}
            type="button"
          >
            <X aria-hidden="true" size={18} />
            <span className="sr-only">Cancel contact edit</span>
          </button>
        </div>
        {operationError ? (
          <p className="mt-3 text-sm font-medium text-destructive" role="alert">
            {operationError}
          </p>
        ) : null}
        {isDiscardWarningOpen ? (
          <UnsavedChangesDialog
            body="Discard unsaved contact edits?"
            onCancel={() => setIsDiscardWarningOpen(false)}
            onConfirm={() => {
              setIsDiscardWarningOpen(false);
              cancel();
            }}
          />
        ) : null}
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
          {[contact.role, contact.email, contact.phone].some(Boolean) ? (
            <p className="mt-1 break-words text-sm text-muted">
              {[
                contact.role,
                contact.email && EMAIL_PATTERN.test(contact.email) ? (
                  <a className="font-medium text-primary hover:text-blue-700" href={`mailto:${contact.email}`}>
                    {contact.email}
                  </a>
                ) : contact.email,
                contact.phone && isDialable(contact.phone) ? (
                  <a className="font-medium text-primary hover:text-blue-700" href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}>
                    {contact.phone}
                  </a>
                ) : contact.phone,
              ]
                .filter(Boolean)
                .map((part, index) => (
                  <Fragment key={index}>
                    {index > 0 ? " / " : null}
                    {part}
                  </Fragment>
                ))}
            </p>
          ) : null}
          {safeLinkedInUrl ? (
            <a
              className="mt-2 block truncate text-sm font-medium text-primary hover:text-blue-700"
              href={safeLinkedInUrl}
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
            onClick={() => {
              setEditBase(structuredClone(contact));
              setDraft(toDraft(contact));
              setIsEditing(true);
            }}
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
  error,
  id,
  initialFocus = false,
  label,
  onChange,
  required = false,
  type = "text",
  value,
}: {
  error?: string;
  id?: string;
  initialFocus?: boolean;
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
        aria-describedby={error ? `${id}-error` : undefined}
        aria-invalid={error ? "true" : "false"}
        className="field-control"
        data-initial-focus={initialFocus || undefined}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
      {error ? (
        <span className="mt-1 block text-xs font-medium text-destructive" id={`${id}-error`}>
          {error}
        </span>
      ) : null}
    </label>
  );
}

export function contactDraftToUpdate(draft: ContactDraft, original: ApplicationContact): Partial<ContactInput> {
  return changedDraftFields(draft, toDraft(original), {
    email: trimOptional(draft.email), linkedInUrl: normalizeLinkedInUrl(draft.linkedInUrl),
    name: draft.name.trim() || original.name, notes: trimOptional(draft.notes),
    phone: trimOptional(draft.phone), role: trimOptional(draft.role),
  });
}

// Only plain phone characters, so "ext 12" or letters never get glued onto the dialled number.
function isDialable(phone: string) {
  return /^\+?[\d\s().-]+$/.test(phone) && /\d/.test(phone);
}

// Only changed fields are checked, so an older saved value never blocks other edits.
export function getContactErrors(draft: ContactDraft, original: ContactDraft = emptyDraft): ContactErrors {
  const errors: ContactErrors = {};
  const email = draft.email.trim();
  if (email && draft.email !== original.email && !EMAIL_PATTERN.test(email)) {
    errors.email = "Enter an email address, for example name@example.com.";
  }
  if (draft.linkedInUrl !== original.linkedInUrl && normalizeApplicationUrl(draft.linkedInUrl).error) {
    errors.linkedInUrl = "Enter a web address, for example linkedin.com/in/your-name.";
  }
  return errors;
}

function focusFirstError(errors: ContactErrors, fieldId: string) {
  const key = (["email", "linkedInUrl"] as const).find((field) => errors[field]);
  if (key) document.getElementById(`${fieldId}-${key}`)?.focus();
  return Boolean(key);
}

function normalizeLinkedInUrl(value: string) {
  return normalizeApplicationUrl(value).url ?? trimOptional(value);
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

function isContactDraftDirty(
  draft: ContactDraft,
  initialDraft: ContactDraft,
) {
  return Object.entries(draft).some(([key, value]) => {
    const initialValue = initialDraft[key as keyof ContactDraft];

    return value !== initialValue;
  });
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
