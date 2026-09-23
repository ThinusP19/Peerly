import type { ReactNode } from "react";

import { BrandLockup, BrandMark } from "@/components/layout/BrandMark";
import { Card } from "@/components/ui/card";
import { FloatingPathsBackground } from "@/components/ui/floating-paths";
import { cn } from "@/lib/utils";

// Mock counts. A live Peerly must not publish these before sign-in - swap for
// static copy (or drop the row) once the backend is wired.
const stats = [
  // Illustrative figures on the sign-in page. Deliberately not live: this
  // screen is shown to anyone who reaches the site, signed in or not, and how
  // many students a university has is not something to publish to them.
  { label: "Students", value: "30+" },
  { label: "Groups", value: "9" },
  { label: "Assessments", value: "2" },
];

/**
 * Field styling for every auth form, applied from outside so FormField and
 * Input look unchanged inside the portals. `input` only matches text inputs
 * here - checkboxes are Radix buttons.
 */
const authFieldStyles = [
  "[&_[data-slot=field-label]]:text-xs [&_[data-slot=field-label]]:font-semibold [&_[data-slot=field-label]]:tracking-wider [&_[data-slot=field-label]]:uppercase",
  "[&_input]:h-11 [&_input]:rounded-lg [&_input]:bg-muted [&_input]:px-4 [&_input]:shadow-none [&_input:focus-visible]:bg-card [&_input::placeholder]:text-muted-foreground/60",
  "[&_button[type=submit]]:h-11 [&_button[type=submit]]:rounded-lg [&_button[type=submit]]:text-base [&_button[type=submit]]:font-semibold",
].join(" ");

/**
 * Layout for the screens that sit outside both portals: login, registration,
 * activation and password reset. Runs under `.auth-theme`, which swaps the
 * indigo primary for plum.
 *
 * Below `lg` the form sits in a centred card under a compact brand lockup.
 * From `lg` a brand panel joins on the left; it gets a larger share until 2xl
 * so the headline and stat tiles don't cramp, and it stays pinned to the
 * viewport while a long form (registration) scrolls.
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
  back,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Optional link above the title, e.g. back to the previous step. */
  back?: ReactNode;
}) {
  return (
    <div className="auth-theme grid min-h-dvh bg-background lg:grid-cols-[2fr_3fr] 2xl:grid-cols-[5fr_9fr]">
      <aside className="relative hidden flex-col overflow-hidden bg-auth-panel p-10 text-auth-panel-foreground lg:sticky lg:top-0 lg:flex lg:h-dvh xl:p-12">
        {/* Two mirrored line fields drifting across the whole panel. `contain`
            keeps their repaints inside the panel instead of the whole page. */}
        <div className="pointer-events-none absolute inset-0 text-auth-panel-heading/70 [contain:strict]">
          <FloatingPathsBackground position={1} className="absolute inset-0" />
          <FloatingPathsBackground position={-1} className="absolute inset-0" />
        </div>

        <div className="relative flex items-center gap-3">
          <BrandMark className="size-9 text-auth-panel-heading" />
          <span className="text-xl font-semibold tracking-tight text-auth-panel-heading">
            Peerly
          </span>
        </div>

        <div className="relative flex flex-1 flex-col justify-center py-10">
          {/* White-on-transparent source (Content/NWU-Logo-SWFooter.png), so it
              only works on a dark ground like this panel. 100px tall source,
              shown at 48px: sharp on 2× screens, and the smallest line of the
              three-language wordmark stays legible. */}
          <img
            src="/nwu-logo-white.png"
            alt="North-West University"
            width={290}
            height={100}
            className="h-12 w-auto self-start"
          />
          <p className="mt-6 max-w-md text-4xl leading-tight font-semibold tracking-tight text-balance text-auth-panel-heading xl:text-5xl">
            Peer assessment made transparent.
          </p>
          <p className="mt-5 max-w-md text-base leading-relaxed">
            Fair group contribution tracking with a qualitative rubric, real-time monitoring and
            automatic mark adjustment.
          </p>
        </div>

        <dl className="relative grid grid-cols-3 gap-3 xl:gap-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex min-w-0 flex-col-reverse rounded-xl border border-auth-panel-border bg-auth-panel-tile px-3 py-3.5 xl:px-4"
            >
              <dt className="mt-1 text-xs xl:text-sm">{stat.label}</dt>
              <dd className="text-2xl font-semibold text-auth-panel-heading tabular-nums">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </aside>

      <div className="flex min-w-0 flex-col items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-lg">
          <BrandLockup subtitle="North-West University" className="mb-6 justify-center lg:hidden" />

          <Card className="rounded-2xl border-0 p-6 shadow-raised sm:p-10">
            {back ? <div className="mb-6">{back}</div> : null}
            <div className="space-y-1.5">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
              {description ? <p className="text-muted-foreground">{description}</p> : null}
            </div>
            <div className={cn("mt-7", authFieldStyles)}>{children}</div>
            {footer ? (
              <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>
            ) : null}
          </Card>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} North-West University · Peerly
          </p>
        </div>
      </div>
    </div>
  );
}
