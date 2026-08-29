import { format, formatDistanceToNowStrict, isPast } from "date-fns";

/** "4 Sep 2026" */
export const formatDate = (iso: string) => format(new Date(iso), "d MMM yyyy");

/** "4 Sep 2026, 22:00" */
export const formatDateTime = (iso: string) => format(new Date(iso), "d MMM yyyy, HH:mm");

/** "4 Sep 2026 at 22:00" — for prose, e.g. confirmation copy. */
export const formatDateTimeLong = (iso: string) => format(new Date(iso), "d MMMM yyyy 'at' HH:mm");

/** "in 6 days" / "5 days ago" */
export function formatDeadline(iso: string) {
  const date = new Date(iso);
  return isPast(date)
    ? `${formatDistanceToNowStrict(date)} ago`
    : `in ${formatDistanceToNowStrict(date)}`;
}

export const isOverdue = (iso: string) => isPast(new Date(iso));

/** Marks render to one decimal place everywhere, so columns line up. */
export const formatMark = (mark: number | null | undefined) =>
  mark == null ? "—" : mark.toFixed(1);

/** Adjustment factors render to two decimals. */
export const formatFactor = (factor: number) => factor.toFixed(2);

export const formatPercent = (value: number) => `${Math.round(value)}%`;

export const initials = (name: string, surname: string) =>
  `${name.charAt(0)}${surname.charAt(0)}`.toUpperCase();
