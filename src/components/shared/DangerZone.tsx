import { Trash2 } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

/**
 * A visually separate block for an irreversible action (UR-11), so deleting a
 * class or assessment never sits among routine controls.
 */
export function DangerZone({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <Card className="flex flex-col gap-4 rounded-2xl border border-danger/25 p-5 shadow-card sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-danger-muted text-danger">
          <Trash2 className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <Button variant="destructive" onClick={onAction} className="h-10 shrink-0 px-4">
        <Trash2 aria-hidden="true" />
        {actionLabel}
      </Button>
    </Card>
  );
}

/**
 * The second confirmation FR-28 requires before deleting data that was never
 * exported. The confirm button stays disabled until this is ticked.
 */
export function UnexportedAcknowledgement({
  subject,
  checked,
  onCheckedChange,
}: {
  /** e.g. "This assessment's" */
  subject: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex gap-2.5 rounded-lg border border-danger/30 bg-danger-muted/60 p-3">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        className="mt-0.5"
      />
      <Label htmlFor={id} className="text-sm leading-snug font-normal text-foreground">
        {subject} ratings and marks were never exported. I understand they can't be recovered once
        deleted.
      </Label>
    </div>
  );
}
