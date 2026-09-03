import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { APPLICATION_STATUSES } from "../../lib/constants";

interface AddApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddApplicationModal({
  isOpen,
  onClose,
}: AddApplicationModalProps) {
  const [jobTitle, setJobTitle] = useState("");

  if (!isOpen) {
    return null;
  }

  const canSave = jobTitle.trim().length > 0;

  return (
    <div
      aria-labelledby="add-application-title"
      aria-modal="true"
      className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      role="dialog"
    >
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-surface shadow-popover">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
          <h2
            className="text-lg font-semibold text-foreground"
            id="add-application-title"
          >
            Add job
          </h2>
          <button className="icon-button" onClick={onClose} type="button">
            <X aria-hidden="true" size={18} />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <form className="overflow-y-auto px-4 py-5 sm:px-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Job Title" required>
              <input
                className="field-control"
                onChange={(event) => setJobTitle(event.target.value)}
                required
                type="text"
                value={jobTitle}
              />
            </Field>

            <Field label="Company">
              <input className="field-control" type="text" />
            </Field>

            <Field label="Status">
              <select className="field-control">
                <option value="">Blank</option>
                {APPLICATION_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Applied Date">
              <input className="field-control" type="date" />
            </Field>

            <Field label="Deadline">
              <input className="field-control" type="date" />
            </Field>

            <Field label="Follow-up Date">
              <input className="field-control" type="date" />
            </Field>

            <Field label="Interview Date/Time">
              <input className="field-control" type="datetime-local" />
            </Field>

            <Field label="Resume">
              <select className="field-control">
                <option value="">No resume selected</option>
                <option value="frontend">Frontend Internship Resume</option>
                <option value="product">Product Engineering Resume</option>
              </select>
            </Field>

            <label className="flex items-center gap-3 rounded-lg border border-border bg-surface-raised px-3 py-3 text-sm font-medium text-foreground md:col-span-2">
              <input
                className="h-4 w-4 rounded border-border text-primary"
                type="checkbox"
              />
              <span>Follow-up Needed</span>
            </label>

            <Field className="md:col-span-2" label="Job Description">
              <textarea className="field-control min-h-32 resize-y" />
            </Field>

            <Field className="md:col-span-2" label="Notes">
              <textarea className="field-control min-h-28 resize-y" />
            </Field>
          </div>
        </form>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-4 sm:px-6">
          <button
            className="h-10 rounded-lg border border-border px-4 text-sm font-semibold text-foreground hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className={`h-10 rounded-lg px-4 text-sm font-semibold ${
              canSave
                ? "bg-primary text-primary-foreground hover:bg-blue-700"
                : "bg-slate-200 text-slate-500"
            }`}
            disabled={!canSave}
            type="button"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  children,
  className = "",
  label,
  required = false,
}: {
  children: ReactNode;
  className?: string;
  label: string;
  required?: boolean;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 flex items-center gap-1 text-sm font-medium text-foreground">
        {label}
        {required ? <span className="text-destructive">*</span> : null}
      </span>
      {children}
    </label>
  );
}
