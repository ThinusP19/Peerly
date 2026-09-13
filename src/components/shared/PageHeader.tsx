import { Link, type LinkProps } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The page title as a header tile, matching the Settings header card. Action
 * buttons should use `className="h-10 px-4"`, primary action last.
 */
export function PageHeader({
  title,
  description,
  actions,
  backTo,
  backLabel,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  backTo?: LinkProps["to"];
  backLabel?: string;
  className?: string;
}) {
  return (
    <Card className={cn("rounded-2xl border-0 px-5 py-5 shadow-card sm:px-6", className)}>
      {backTo ? (
        <Link
          to={backTo}
          className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {backLabel ?? "Back"}
        </Link>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
    </Card>
  );
}
