import { cn } from "@/lib/utils";

/**
 * Peerly's mark: three peers around a shared piece of work.
 *
 * `tone="onDark"` inverts it for the indigo sidebar, where an indigo tile would
 * disappear into the background.
 */
export function BrandMark({
  className,
  tone = "default",
}: {
  className?: string;
  tone?: "default" | "onDark";
}) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md",
        tone === "onDark"
          ? "bg-sidebar-primary text-sidebar-primary-foreground"
          : "bg-primary text-primary-foreground",
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-5">
        <circle cx="12" cy="6.5" r="2.6" fill="currentColor" />
        <circle cx="6" cy="16.5" r="2.6" fill="currentColor" />
        <circle cx="18" cy="16.5" r="2.6" fill="currentColor" />
        <path
          d="M12 9.6v2.2m0 0-4.2 2.4M12 11.8l4.2 2.4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.7"
        />
      </svg>
    </span>
  );
}

export function BrandLockup({
  subtitle,
  tone = "default",
  className,
}: {
  subtitle?: string;
  tone?: "default" | "onDark";
  className?: string;
}) {
  const onDark = tone === "onDark";
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark tone={tone} />
      <span className="min-w-0 leading-tight">
        <span
          className={cn(
            "block font-semibold tracking-tight",
            onDark ? "text-sidebar-primary" : "text-foreground",
          )}
        >
          Peerly
        </span>
        {subtitle ? (
          <span
            className={cn(
              "block truncate text-xs",
              onDark ? "text-sidebar-foreground/70" : "text-muted-foreground",
            )}
          >
            {subtitle}
          </span>
        ) : null}
      </span>
    </span>
  );
}
