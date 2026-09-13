import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { BusyButton } from "@/components/shared/BusyButton";
import { StatusBadge, accountStatusKind } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import {
  getConflictCandidates,
  resolveEnrolmentConflict,
  type EnrolmentRow,
} from "@/services/peerly";

/**
 * FR-04: settles a Conflict. The lecturer sees the class-list entry beside every
 * registered account using that student number, and either links one - which
 * grants it the class's data - or leaves the entry unmatched.
 */
export function ResolveConflictDialog({
  row,
  onOpenChange,
}: {
  row: EnrolmentRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<"link" | "reject" | null>(null);

  const candidates = useQuery({
    queryKey: ["conflict-candidates", row?.id],
    queryFn: () => getConflictCandidates(row!.id),
    enabled: Boolean(row),
  });

  const close = () => {
    setSelected(null);
    onOpenChange(false);
  };

  const decide = async (kind: "link" | "reject") => {
    if (!row || !user) return;
    setBusy(kind);
    try {
      await resolveEnrolmentConflict(
        row.id,
        kind === "link" ? { kind, userId: selected! } : { kind },
        user,
      );
      await queryClient.invalidateQueries();
      const listed = `${row.importedName} ${row.importedSurname}`;
      toast.success(
        kind === "link"
          ? `${listed} is now matched and can take part in this class.`
          : `${listed} has been left unmatched.`,
      );
      close();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "We couldn't save that decision. Please try again.",
      );
    } finally {
      setBusy(null);
    }
  };

  const surnameDiffers = (surname: string) =>
    Boolean(row) && surname.trim().toLowerCase() !== row!.importedSurname.trim().toLowerCase();

  return (
    <Dialog open={Boolean(row)} onOpenChange={(open) => !busy && !open && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Resolve this conflict</DialogTitle>
          <DialogDescription>
            A registered account uses this student number, but its details don't agree with the
            class list. Linking gives that account access to this class, its groups and its
            assessments.
          </DialogDescription>
        </DialogHeader>

        {row ? (
          <div className="space-y-4">
            <div className="rounded-xl border p-4">
              <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                On the class list
              </p>
              <p className="mt-0.5 font-semibold text-foreground">
                {row.importedName} {row.importedSurname}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
                {row.studentNumber}
              </p>
              {row.matchNote ? (
                <p className="mt-2 text-xs text-muted-foreground">{row.matchNote}</p>
              ) : null}
            </div>

            <fieldset className="space-y-2">
              <legend className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Registered accounts with this number
              </legend>

              {candidates.isPending ? (
                <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Looking up accounts…
                </p>
              ) : (candidates.data ?? []).length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">
                  No registered account uses this number any more. Leave it unmatched until the
                  student registers.
                </p>
              ) : (
                candidates.data!.map((account) => {
                  const checked = selected === account.id;
                  return (
                    <label
                      key={account.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors",
                        checked
                          ? "border-primary bg-accent ring-1 ring-primary"
                          : "hover:bg-muted/50",
                      )}
                    >
                      <input
                        type="radio"
                        name="conflict-account"
                        value={account.id}
                        checked={checked}
                        onChange={() => setSelected(account.id)}
                        className="mt-1 accent-primary"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-foreground">
                            {account.name} {account.surname}
                          </span>
                          <StatusBadge status={accountStatusKind(account.status)} />
                        </span>
                        <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                          {account.email}
                        </span>
                        {surnameDiffers(account.surname) ? (
                          <span className="mt-1 flex items-center gap-1.5 text-xs text-warning">
                            <AlertTriangle className="size-3.5" aria-hidden="true" />
                            Surname differs from the class list
                          </span>
                        ) : null}
                      </span>
                    </label>
                  );
                })
              )}
            </fieldset>

            <p className="text-xs text-muted-foreground">
              Your decision is recorded in the audit log.
            </p>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => void decide("reject")} disabled={Boolean(busy)}>
            {busy === "reject" ? "Saving…" : "Leave unmatched"}
          </Button>
          <BusyButton
            onClick={() => void decide("link")}
            busy={busy === "link"}
            busyLabel="Linking…"
            disabled={!selected || Boolean(busy)}
          >
            Link this account
          </BusyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
