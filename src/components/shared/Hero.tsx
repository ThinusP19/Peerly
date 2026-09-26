import type { ReactNode } from "react";

import { BrandMark } from "@/components/layout/BrandMark";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface HeroStat {
  label: string;
  value: ReactNode;
  detail: string;
}

/**
 * The plum banner that opens each portal's dashboard: an eyebrow, the page
 * title, a one-line subtitle and up to four stat tiles. Three stats sit in a
 * single row (stacked below 360px, where three tiles leave no room for a
 * word); four become a 2x2 grid on phones.
 *
 * Labels wrap rather than truncate: the detail line is hidden on phones, so
 * a label cut to "AWAITING ACTIVATI..." would leave nothing to read.
 */
export function Hero({
  eyebrow,
  title,
  subtitle,
  stats,
  loading = false,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
  stats?: HeroStat[];
  /** Shows a skeleton in place of each stat value. */
  loading?: boolean;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-primary px-6 py-6 text-primary-foreground shadow-raised sm:px-8 sm:py-7">
      {/* Oversized, faint brand mark: texture, not information. */}
      <BrandMark className="pointer-events-none absolute -right-8 -bottom-12 size-64 text-primary-foreground opacity-[0.07]" />

      {/* Four stats need more room than three, so they only move beside the title at 2xl. */}
      <div
        className={cn(
          "relative flex flex-col gap-6",
          (stats?.length ?? 0) > 3
            ? "2xl:flex-row 2xl:items-end 2xl:justify-between"
            : "xl:flex-row xl:items-end xl:justify-between",
        )}
      >
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.16em] uppercase opacity-80">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm opacity-85 sm:text-base">{subtitle}</p>
        </div>

        {stats?.length ? (
          <dl
            className={cn(
              "grid gap-2 sm:gap-3",
              stats.length > 3
                ? "grid-cols-2 sm:grid-cols-4 2xl:w-[42rem] 2xl:shrink-0"
                : "grid-cols-1 min-[360px]:grid-cols-3 xl:w-[30rem] xl:shrink-0",
            )}
          >
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="min-w-0 rounded-xl border border-primary-foreground/15 bg-primary-foreground/10 px-3 py-3 sm:px-4"
              >
                <dt className="text-[11px] leading-tight font-semibold tracking-wider break-words uppercase opacity-80">
                  {stat.label}
                </dt>
                {loading ? (
                  <dd className="mt-1">
                    <Skeleton className="h-8 w-12 bg-primary-foreground/20 sm:h-9" />
                    <span className="sr-only">Loading</span>
                  </dd>
                ) : (
                  <dd className="mt-1 text-2xl font-semibold tabular-nums sm:text-3xl">
                    {stat.value}
                  </dd>
                )}
                <dd
                  className="mt-0.5 hidden truncate text-xs opacity-75 sm:block"
                  title={stat.detail}
                >
                  {stat.detail}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </section>
  );
}
