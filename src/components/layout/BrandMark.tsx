import { cn } from "@/lib/utils";

/**
 * Peerly's mark: three peers linked into a tick. Mirrors brand/mark.svg, but
 * transparent - just the glyph, in the surrounding brand colour, no tile.
 *
 * `tone="onDark"` switches it to the light sidebar foreground for the indigo
 * sidebars. Override the colour with a `text-*` class when neither fits.
 */
export function BrandMark({
  className,
  tone = "default",
}: {
  className?: string;
  tone?: "default" | "onDark";
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn(
        "size-7 shrink-0",
        tone === "onDark" ? "text-sidebar-primary" : "text-primary",
        className,
      )}
    >
      <path
        d="M4 12.5l5.75 5.75L20 6.5"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="4" cy="12.5" r="3.25" fill="currentColor" />
      <circle cx="9.75" cy="18.25" r="3.25" fill="currentColor" />
      <circle cx="20" cy="6.5" r="3.25" fill="currentColor" />
    </svg>
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
