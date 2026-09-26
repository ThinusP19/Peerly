import { format, formatDistanceToNowStrict, isPast } from "date-fns";

/** "4 Sep 2026" */
export const formatDate = (iso: string) => format(new Date(iso), "d MMM yyyy");

/** "4 Sep 2026, 22:00" */
export const formatDateTime = (iso: string) => format(new Date(iso), "d MMM yyyy, HH:mm");

/** "4 Sep 2026 at 22:00" - for prose, e.g. confirmation copy. */
export const formatDateTimeLong = (iso: string) => format(new Date(iso), "d MMMM yyyy 'at' HH:mm");

/** "in 6 days" / "5 days ago" */
export function formatDeadline(iso: string) {
  const date = new Date(iso);
  return isPast(date)
    ? `${formatDistanceToNowStrict(date)} ago`
    : `in ${formatDistanceToNowStrict(date)}`;
}

export const isOverdue = (iso: string) => isPast(new Date(iso));

/**
 * Rounds half away from zero, to `places` - the calculation's own rule
 * (server/src/lib/felder.ts, `round`), so a figure worked out on screen agrees
 * with the one the server would record.
 *
 * `toFixed` alone is not that rule: it follows the binary value, so a mean of
 * 35.55 - stored as 35.549999... - showed as 35.5. The value is cleaned to
 * twelve significant digits first, which keeps every real digit and drops only
 * floating-point noise.
 */
export function roundMark(value: number, places = 1): number {
  const factor = 10 ** places;
  const scaled = Number((value * factor).toPrecision(12));
  const rounded = Math.round(Math.abs(scaled)) / factor;
  return scaled < 0 ? -rounded || 0 : rounded;
}

/** Marks render to one decimal place everywhere, so columns line up. */
export const formatMark = (mark: number | null | undefined) =>
  mark == null ? "-" : roundMark(mark).toFixed(1);

/** True for 74 and 74.5, false for 74.25: marks are recorded to one decimal (IS-06). */
export const hasAtMostOneDecimal = (value: number) =>
  Number.isFinite(value) && Number.isInteger(Number((value * 10).toPrecision(12)));

/**
 * The name the server gives the results workbook
 * (server/src/lib/export-format.ts, `exportFilename`), so the export screen can
 * name the file before it exists: peerly-<module>-<assessment>-<date>.xlsx,
 * dated in UTC as the server dates it.
 */
export function exportFileName(moduleCode: string, assessmentName: string, when: Date): string {
  const slug = assessmentName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `peerly-${moduleCode.toLowerCase()}-${slug}-${when.toISOString().slice(0, 10)}.xlsx`;
}

/** Adjustment factors render to two decimals. */
export const formatFactor = (factor: number) => factor.toFixed(2);

export const formatPercent = (value: number) => `${Math.round(value)}%`;

export const initials = (name: string, surname: string) =>
  `${name.charAt(0)}${surname.charAt(0)}`.toUpperCase();
