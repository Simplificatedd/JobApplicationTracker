import { AlertTriangle } from "lucide-react";
import { NativeModal } from "./NativeModal";

interface UnsavedChangesDialogProps {
  body?: string;
  cancelLabel?: string;
  confirmLabel?: string;
  // "primary" for a non-destructive choice such as a suggested status change.
  confirmTone?: "danger" | "primary";
  onCancel: () => void;
  onConfirm: () => void;
  title?: string;
}

export function UnsavedChangesDialog({
  body = "You have unsaved changes. Discard them?",
  cancelLabel = "Keep editing",
  confirmLabel = "Discard",
  confirmTone = "danger",
  onCancel,
  onConfirm,
  title = "Discard changes?",
}: UnsavedChangesDialogProps) {
  return (
    <NativeModal
      labelledBy="unsaved-changes-title"
      onRequestClose={onCancel}
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
            className="h-10 rounded-lg border border-border px-3 text-sm font-semibold text-foreground hover:bg-slate-50 max-md:h-11"
            data-initial-focus
            onClick={onCancel}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className={`h-10 rounded-lg px-3 text-sm font-semibold max-md:h-11 ${
              confirmTone === "danger"
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-primary text-primary-foreground hover:bg-blue-700"
            }`}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </footer>
      </div>
    </NativeModal>
  );
}
