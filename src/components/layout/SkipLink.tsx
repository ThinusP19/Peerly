import type { MouseEvent } from "react";

/** The id the portal shells give their `<main>`, and the skip link's target. */
export const MAIN_CONTENT_ID = "main-content";

/**
 * "Skip to main content" (WCAG 2.4.1, UR-09).
 *
 * The first tab stop in each portal. Hidden until focused, then shown over
 * the top-left corner, so a keyboard user can pass the sidebar's ten links and
 * the header's controls in one keystroke instead of tabbing through them on
 * every page.
 *
 * Focus is moved by hand rather than left to the `#hash`: the router owns the
 * URL, and a stray fragment in it would outlive the jump. The `<main>` it
 * targets carries `tabIndex={-1}` so it can take focus.
 */
export function SkipLink() {
  const skip = (event: MouseEvent<HTMLAnchorElement>) => {
    const main = document.getElementById(MAIN_CONTENT_ID);
    if (!main) return;
    event.preventDefault();
    main.focus();
    main.scrollIntoView();
  };

  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      onClick={skip}
      className="sr-only rounded-lg bg-card px-4 py-2.5 text-sm font-semibold text-primary shadow-raised focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50"
    >
      Skip to main content
    </a>
  );
}
