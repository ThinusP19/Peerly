import { createContext, useContext, type MouseEvent } from "react";

export interface PageTransitionValue {
  /** Cover the screen with the preloader until the next route has resolved. */
  show: (label: string) => void;
  /**
   * onClick for a <Link>: shows the preloader for a plain click, and leaves
   * new-tab / new-window clicks alone.
   */
  transitionOnClick: (label: string) => (event: MouseEvent) => void;
}

/** Provided by PageTransitionProvider (src/components/shared/PageTransition.tsx). */
export const PageTransitionContext = createContext<PageTransitionValue | null>(null);

/**
 * Put the full-screen preloader over a route change. Lives apart from the
 * provider so that file exports only a component and hot-reloads in place -
 * mixing the two forces a full page reload on every edit.
 */
export function usePageTransition() {
  const ctx = useContext(PageTransitionContext);
  if (!ctx) throw new Error("usePageTransition must be used inside <PageTransitionProvider>");
  return ctx;
}
