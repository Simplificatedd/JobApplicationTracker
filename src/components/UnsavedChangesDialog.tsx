import { AlertTriangle } from "lucide-react";
import { useEscapeKey } from "../hooks/useEscapeKey";

interface UnsavedChangesDialogProps {
  body?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
  title?: string;
}

export function UnsavedChangesDialog({
  body = "You have unsaved changes. Discard them?",
  confirmLabel = "Discard",
  onCancel,
  onConfirm,
  title = "Discard changes?",
}: UnsavedChangesDialogProps) {
  useEscapeKey(true, onCancel);

  return (
    <div
      aria-labelledby="unsaved-changes-title"
      aria-modal="true"
      className="modal-overlay fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4"
      role="alertdialog"
    >
      <div className="w-full max-w-md rounded-lg bg-surface shadow-popover">
        <header className="flex items-start gap-3 border-b border-border px-4 py-4 sm:px-5">
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-warning"
            size={20}
          />
          <div className="min-w-0">
            <h2
              className="text-base font-semibold text-foreground"
              id="unsaved-changes-title"
            >
              {title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted">{body}</p>
          </div>
        </header>

        <footer className="flex flex-wrap justify-end gap-2 px-4 py-4 sm:px-5">
          <button
            className="h-10 rounded-lg border border-border px-3 text-sm font-semibold text-foreground hover:bg-slate-50"
            onClick={onCancel}
            type="button"
          >
            Keep editing
          </button>
          <button
            className="h-10 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700"
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
