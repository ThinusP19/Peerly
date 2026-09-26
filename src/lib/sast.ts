/**
 * South African time, whatever the browser's clock says (OR-11).
 *
 * The audit log is filtered by South African calendar day on the server, so it
 * has to be shown in South African time as well: an entry at 01:30 on the 26th
 * must read "26 Sep", on the day it is filed under, even for an auditor whose
 * laptop is set to another zone.
 */
export const SA_TIME_ZONE = "Africa/Johannesburg";

// Spelled out rather than taken from Intl, whose "short" month is "Sept" in
// some locales and "Sep" in others; date-fns, used everywhere else, says "Sep".
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const parts = new Intl.DateTimeFormat("en-GB", {
  timeZone: SA_TIME_ZONE,
  day: "numeric",
  month: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "26 Sep 2026, 01:30", in SAST - the same shape as formatDateTime. */
export function formatDateTimeSast(iso: string): string {
  const found = parts.formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    found.find((entry) => entry.type === type)?.value ?? "";
  const month = MONTHS[Number(part("month")) - 1];
  return `${Number(part("day"))} ${month} ${part("year")}, ${part("hour")}:${part("minute")}`;
}
