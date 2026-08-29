import { Loader2 } from "lucide-react";
import { forwardRef, type ReactNode } from "react";

import { Button, type ButtonProps } from "@/components/ui/button";

export interface BusyButtonProps extends ButtonProps {
  busy?: boolean;
  /** Shown while busy, e.g. "Calculating…". Falls back to the normal label. */
  busyLabel?: ReactNode;
}

/**
 * A button that cannot be double-clicked: while `busy` it is disabled and shows
 * a spinner, so any action that takes a moment reads as in-progress.
 */
export const BusyButton = forwardRef<HTMLButtonElement, BusyButtonProps>(
  ({ busy = false, busyLabel, children, disabled, ...props }, ref) => (
    <Button ref={ref} disabled={disabled || busy} aria-busy={busy} {...props}>
      {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
      {busy ? (busyLabel ?? children) : children}
    </Button>
  ),
);
BusyButton.displayName = "BusyButton";
