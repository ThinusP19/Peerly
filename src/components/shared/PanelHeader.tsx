import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** The accent pill that counts what a panel lists. */
export function CountChip({ count, className }: { count: number; className?: string }) {
  return (
    <span
      className={cn(
        "rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground tabular-nums",
        className,
      )}
    >
      {count}
    </span>
  );
}

/**
 * The header row of a panel card, over a hairline: an optional eyebrow, the
 * title, an optional description, and either a count chip or trailing actions
 * on the right. With both, the chip moves beside the title.
 *
 * The page's primary panel (its main table or form) uses `size="lg"`; side and
 * secondary panels keep the default.
 */
export function PanelHeader({
  title,
  eyebrow,
  description,
  count,
  actions,
  size = "base",
  as: Heading = "h2",
  className,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  /** Leave undefined while the count is still loading. */
  count?: number;
  /** Buttons, or a badge or short note, shown at the right. */
  actions?: ReactNode;
  size?: "base" | "lg";
  as?: "h2" | "h3";
  className?: string;
}) {
  const chip = count == null ? null : <CountChip count={count} />;
  const heading = (
    <Heading
      className={cn(
        "font-semibold text-foreground",
        size === "lg" ? "text-lg" : "text-base",
        eyebrow && !(actions && chip) ? "mt-0.5" : null,
      )}
    >
      {title}
    </Heading>
  );

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b px-5 py-4 sm:px-6",
        actions && "flex-wrap",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            {eyebrow}
          </p>
        ) : null}
        {actions && chip ? (
          <div className={cn("flex items-center gap-2", eyebrow && "mt-0.5")}>
            {heading}
            {chip}
          </div>
        ) : (
          heading
        )}
        {description ? (
          <p className="mt-1 max-w-2xl text-sm break-words text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : chip}
    </div>
  );
}
