/**
 * The precision a mark is recorded at (IS-06).
 *
 * One decimal place, decided 2026-09-23: the calculation's `roundTo` and the
 * group-mark input's precision alike. The rule lives here, on the server, and
 * again in the database (0005), because the API can be called directly - a
 * rule that only the marks screen knew about let 70.25 and 60.255 through, and
 * the numeric(6, 2) columns then rounded them silently to something the audit
 * log did not say.
 */

export const ONE_DECIMAL_MESSAGE = "Use whole numbers or one decimal place, e.g. 74.5.";

/**
 * True for 74, 74.5 and 0.1; false for 74.25 or 0.001.
 *
 * Checked on the value times ten, cleaned of binary noise first: 60.3 * 10 is
 * 603.0000000000001 in floating point, which is still one decimal place.
 */
export function hasAtMostOneDecimal(value: number): boolean {
  if (!Number.isFinite(value)) return false;
  return Number.isInteger(Number((value * 10).toPrecision(12)));
}
