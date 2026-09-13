import { AlertTriangle, Flag, Info } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { resultFlagMeta } from "@/lib/domain";
import { cn } from "@/lib/utils";
import type { ResultFlag } from "@/mocks/types";

const tones = {
  warning: "bg-warning-muted text-warning border-warning/30 hover:bg-warning-muted/70",
  danger: "bg-danger-muted text-danger border-danger/30 hover:bg-danger-muted/70",
  neutral: "bg-neutral-status-muted text-neutral-status border-border hover:bg-muted",
} as const;

const icons = { warning: AlertTriangle, danger: Flag, neutral: Info } as const;

/**
 * A result flag. Colour is never the only signal - every flag carries an icon
 * and its label, and the popover explains in plain language why it fired.
 */
export function FlagBadge({ flag, className }: { flag: ResultFlag; className?: string }) {
  const meta = resultFlagMeta[flag];
  const Icon = icons[meta.tone];

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors",
          tones[meta.tone],
          className,
        )}
        aria-label={`${meta.label} - why was this flagged?`}
      >
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        {meta.label}
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm" align="start">
        <p className="font-medium text-foreground">{meta.label}</p>
        <p className="mt-1 text-muted-foreground">{meta.description}</p>
      </PopoverContent>
    </Popover>
  );
}

export function FlagList({ flags, className }: { flags: ResultFlag[]; className?: string }) {
  if (!flags.length) {
    return <span className="text-sm text-muted-foreground">None</span>;
  }
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {flags.map((flag) => (
        <FlagBadge key={flag} flag={flag} />
      ))}
    </div>
  );
}
