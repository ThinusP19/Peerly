import { cn } from "@/lib/utils";

/**
 * Peerly's mark: three peers around a shared piece of work. Calm and academic —
 * deliberately not a playful startup logo.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground",
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

export function BrandLockup({ subtitle, className }: { subtitle?: string; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      <span className="min-w-0 leading-tight">
        <span className="block font-semibold tracking-tight text-foreground">Peerly</span>
        {subtitle ? (
          <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
        ) : null}
      </span>
    </span>
  );
}
