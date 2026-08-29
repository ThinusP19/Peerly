import { cn } from "@/lib/utils";

const tones = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
} as const;

/**
 * Progress is always accompanied by a text value — the bar is never the only
 * way to read the number.
 */
export function ProgressBar({
  value,
  max = 100,
  label,
  valueLabel,
  tone = "primary",
  size = "default",
  className,
}: {
  value: number;
  max?: number;
  label?: string;
  valueLabel?: string;
  tone?: keyof typeof tones;
  size?: "sm" | "default";
  className?: string;
}) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  return (
    <div className={cn("space-y-1.5", className)}>
      {label || valueLabel ? (
        <div className="flex items-baseline justify-between gap-2 text-xs">
          {label ? <span className="font-medium text-foreground">{label}</span> : <span />}
          {valueLabel ? (
            <span className="tabular-nums text-muted-foreground">{valueLabel}</span>
          ) : null}
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progress"}
        className={cn(
          "w-full overflow-hidden rounded-full bg-muted",
          size === "sm" ? "h-1.5" : "h-2",
        )}
      >
        <div
          className={cn("h-full rounded-full transition-all duration-500", tones[tone])}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
