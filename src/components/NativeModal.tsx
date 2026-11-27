import { useEffect, useRef, type ReactNode } from "react";

// The first match that is laid out, for focus fallbacks after a layout change
// hid an element.
export function firstVisible(selector: string) {
  return [...document.querySelectorAll<HTMLElement>(selector)].find(
    (item) => item.getClientRects().length > 0,
  );
}

// Open modals, newest last. Only the top one answers an Escape that reaches <body>.
const openModals: HTMLDialogElement[] = [];

export function NativeModal({ children, className, fallbackFocus, labelledBy, onRequestClose, role }: {
  children: ReactNode;
  className: string;
  // Where focus goes on close when the opener is no longer rendered, for
  // example after a layout change hid it or an update removed it.
  fallbackFocus?: () => HTMLElement | null | undefined;
  labelledBy: string;
  onRequestClose: () => void;
  role?: "alertdialog";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const fallbackFocusRef = useRef(fallbackFocus);
  useEffect(() => {
    fallbackFocusRef.current = fallbackFocus;
  });
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // Listen natively: cancel is non-bubbling and must be prevented before the
    // browser closes a dialog whose editor is still busy or unsaved.
    const cancel = (event: Event) => {
      event.preventDefault(); event.stopPropagation(); onRequestClose();
    };
    // If the focused control was removed, focus falls to <body> and the dialog's
    // own onKeyDown never sees Escape, so handle it here for the top modal.
    const escapeFromBody = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.target !== document.body || openModals[openModals.length - 1] !== dialog) return;
      event.preventDefault(); onRequestClose();
    };
    dialog.addEventListener("cancel", cancel);
    document.addEventListener("keydown", escapeFromBody);
    return () => {
      dialog.removeEventListener("cancel", cancel);
      document.removeEventListener("keydown", escapeFromBody);
    };
  }, [onRequestClose]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement;
    // Dismissal belongs to the existing save/discard guard. Native focus and
    // inertness remain, but platform close requests must not bypass that guard.
    dialog.setAttribute("closedby", "none");
    if (!dialog.open) dialog.showModal();
    openModals.push(dialog);
    dialog.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
    return () => {
      openModals.splice(openModals.indexOf(dialog), 1);
      if (dialog.open) dialog.close();
      // React can detach the dialog before passive cleanup; keep opener return.
      if (!(opener instanceof HTMLElement)) return;
      // A removed or hidden opener (archived row, layout change) uses the fallback.
      const fallback = !opener.isConnected || opener.getClientRects().length === 0
        ? fallbackFocusRef.current?.() : null;
      if (fallback) fallback.focus();
      else if (opener.isConnected) opener.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      role={role}
      className={`native-modal m-0 h-dvh max-h-none w-full max-w-none border-0 text-foreground ${className}`}
      onKeyDown={event => {
        if (event.key === "Escape") {
          // Guard before the browser's default close action, including repeated
          // Escape requests that may produce a non-cancelable native event.
          event.preventDefault(); event.stopPropagation(); onRequestClose();
        }
      }}
      onMouseDown={event => {
        if (event.target === event.currentTarget && event.button === 0) onRequestClose();
      }}
    >{children}</dialog>
  );
}
