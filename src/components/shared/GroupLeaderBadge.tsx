import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** A designation only; it does not grant permissions or change a rating. */
export function GroupLeaderBadge({
  leader,
  className,
}: {
  leader: boolean | undefined;
  className?: string;
}) {
  return leader ? (
    <>
      {" "}
      <span className={cn(badgeVariants({ variant: "secondary" }), "whitespace-nowrap", className)}>
        Group leader
      </span>
    </>
  ) : null;
}
