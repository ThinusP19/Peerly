import { useCallback, useRef } from "react";

/**
 * Gives focus back to whatever opened a dialog, once it closes (UR-09).
 *
 * Radix returns focus to its own `<Trigger>`, but most dialogs here are
 * controlled - opened by an ordinary button's onClick with `open` state - and
 * have no Trigger, so on close focus fell to <body> and a keyboard user was
 * thrown back to the top of the page. This remembers the element that had
 * focus as the dialog opened and restores it, deferring to Radix only when
 * that element has gone (a menu item whose menu has closed, say).
 *
 * Spread the result onto a Radix Dialog or AlertDialog `Content`; it chains
 * the caller's own handlers.
 */
export function useReturnFocus({
  onOpenAutoFocus,
  onCloseAutoFocus,
}: {
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const opener = useRef<HTMLElement | null>(null);

  const handleOpen = useCallback(
    (event: Event) => {
      // Runs before Radix moves focus into the dialog, so this is the opener.
      const active = document.activeElement;
      opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
      onOpenAutoFocus?.(event);
    },
    [onOpenAutoFocus],
  );

  const handleClose = useCallback(
    (event: Event) => {
      onCloseAutoFocus?.(event);
      const target = opener.current;
      opener.current = null;
      if (event.defaultPrevented || !target?.isConnected) return;
      event.preventDefault();
      target.focus();
    },
    [onCloseAutoFocus],
  );

  return { onOpenAutoFocus: handleOpen, onCloseAutoFocus: handleClose };
}
