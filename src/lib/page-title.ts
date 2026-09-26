/**
 * Document titles. Every page names itself first and the product last, so
 * browser tabs, history and screen readers can tell pages apart (WCAG 2.4.2):
 * "Results - Peerly", "Student sign in - Peerly".
 */
export const APP_NAME = "Peerly";

/** "Results - Peerly". Empty parts are dropped, so no part gives "Peerly". */
export function pageTitle(...parts: (string | undefined)[]): string {
  return [...parts.filter((part): part is string => Boolean(part?.trim())), APP_NAME].join(" - ");
}

/**
 * A route's `head` for a page that only needs a title. The deepest matched
 * route's title wins, so this overrides the root's default.
 */
export function titleHead(...parts: (string | undefined)[]) {
  return { meta: [{ title: pageTitle(...parts) }] };
}
