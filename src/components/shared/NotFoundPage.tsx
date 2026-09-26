import { useEffect } from "react";

import { pageTitle } from "@/lib/page-title";

/**
 * The page for any address that doesn't exist. It sits outside both portals,
 * so it carries its own `<main>` landmark, and its heading says what happened
 * rather than only "404".
 *
 * "Go home" is a plain link: a full load from a dead address is fine, and it
 * keeps this page free of router context so it renders anywhere.
 */
export function NotFoundPage() {
  // A miss renders without the matched route's head(), so the tab would keep
  // the generic site title. Name it like every other page (WCAG 2.4.2).
  useEffect(() => {
    document.title = pageTitle("Page not found");
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="text-7xl font-bold text-foreground" aria-hidden="true">
          404
        </p>
        <h1 className="mt-4 text-xl font-semibold text-foreground">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </a>
        </div>
      </div>
    </main>
  );
}
