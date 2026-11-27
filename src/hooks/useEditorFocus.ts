import { useEffect, useRef } from "react";

// Moves focus into an inline editor when it opens and back to its opener when
// it closes. Without this, removing the focused editor drops focus to <body>.
export function useEditorFocus(isOpen: boolean, fallbackSelector: string) {
  const sectionRef = useRef<HTMLElement>(null);
  const openerRef = useRef<Element | null>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (isOpen && !wasOpen.current) {
      section?.querySelector<HTMLElement>("[data-stage-editor] :is(input, select, textarea):enabled")?.focus();
    } else if (!isOpen && wasOpen.current) {
      const opener = openerRef.current as HTMLElement | null;
      // The Add button is re-created after the editor closes, so fall back to it.
      const target = opener?.isConnected && opener.getClientRects().length > 0
        ? opener
        : section?.querySelector<HTMLElement>(fallbackSelector);
      target?.focus();
    }
    wasOpen.current = isOpen;
  }, [isOpen, fallbackSelector]);

  return {
    sectionRef,
    rememberOpener: () => { openerRef.current = document.activeElement; },
  };
}
