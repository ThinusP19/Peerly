import { AlertTriangle, Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Confirmation gate for irreversible actions.
 *
 * Built on Dialog rather than AlertDialog so the dialog stays open (and the
 * confirm button stays busy) while the action runs - Radix's AlertDialogAction
 * closes on click, which would hide the busy state.
 *
 * A refused action keeps the dialog open and says why. Callers throw; this is
 * the one place that turns the throw into a sentence, so no dialog can sit
 * there looking as if nothing happened.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  /** Name the exact object being acted on, e.g. "Group 4 - Phase 2". */
  objectName,
  description,
  consequence,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  confirmDisabled = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  objectName: string;
  description: ReactNode;
  /** Extra warning shown in a highlighted block, for genuinely lossy actions. */
  consequence?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Keeps the confirm button disabled, e.g. until a second acknowledgement is ticked. */
  confirmDisabled?: boolean;
  onConfirm: () => void | Promise<void>;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const handleConfirm = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (error) {
      setFailure(
        error instanceof Error && error.message
          ? error.message
          : "That didn't work. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (busy) return;
    // A reason from the last attempt belongs to that attempt only.
    if (!next) setFailure(null);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">{objectName}</p>
              <div>{description}</div>
            </div>
          </DialogDescription>
        </DialogHeader>

        {consequence ? (
          <div className="flex gap-2.5 rounded-lg border border-warning/30 bg-warning-muted p-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div>{consequence}</div>
          </div>
        ) : null}

        {children}

        {failure ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {failure}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={busy || confirmDisabled}
          >
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {busy ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
