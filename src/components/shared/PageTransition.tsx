import { useRouter } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

import { Preloader } from "@/components/shared/Preloader";
import { PageTransitionContext } from "@/hooks/use-page-transition";

/** Shortest time the boot preloader stays up, counted from navigation start. */
const BOOT_MIN_MS = 4000;
/**
 * Shortest time a route-transition preloader stays up. The draw sequence itself
 * finishes in ~1.25s; the rest lets the halo and bar breathe.
 */
const TRANSITION_MIN_MS = 3800;
/** Never hold a transition longer than this, even if the route never resolves. */
const TRANSITION_MAX_MS = 10000;
/** Matches `.preloader-leaving` in styles.css. */
const FADE_MS = 400;

interface Overlay {
  label: string;
  leaving: boolean;
  boot: boolean;
}

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Owns the full-screen preloader.
 *
 * - Hard reload: the overlay is part of the server render, so it is on screen
 *   from first paint and covers the page until the app has hydrated, fonts are
 *   ready and at least BOOT_MIN_MS has passed since navigation began.
 * - Route transitions: `show()` puts it back up, and it stays until both the
 *   minimum hold has passed and the router has resolved the new route - so it
 *   never lifts onto a half-loaded page.
 *
 * The overlay appears at full opacity, with no fade-in. It goes up in the same
 * commit as the navigation it covers, so any fade-in lets the destination page
 * show through first - which reads as the page flashing before the preloader.
 * It only fades on the way out.
 *
 * It sits above <Outlet />, so it survives the navigation it is covering.
 */
export function PageTransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [overlay, setOverlay] = useState<Overlay | null>({
    label: "Loading Peerly",
    leaving: false,
    boot: true,
  });
  const timers = useRef<number[]>([]);
  const unsubscribe = useRef<(() => void) | null>(null);

  const cancelPending = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
    unsubscribe.current?.();
    unsubscribe.current = null;
  }, []);

  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  const lift = useCallback(() => {
    cancelPending();
    setOverlay((current) => (current ? { ...current, leaving: true } : null));
    after(FADE_MS, () => setOverlay(null));
  }, [after, cancelPending]);

  // Boot. This effect running at all means the app has hydrated; wait for fonts
  // too so the page underneath doesn't reflow as the overlay lifts.
  useEffect(() => {
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (cancelled) return;
      const remaining = prefersReducedMotion() ? 0 : Math.max(0, BOOT_MIN_MS - performance.now());
      after(remaining, lift);
    });
    return () => {
      cancelled = true;
      cancelPending();
    };
  }, [after, cancelPending, lift]);

  const show = useCallback(
    (label: string) => {
      cancelPending();
      setOverlay({ label, leaving: false, boot: false });

      let held = false;
      let resolved = false;
      const liftWhenReady = () => {
        if (held && resolved) lift();
      };

      // Subscribed before the <Link> navigates (onClick runs first), so the
      // resolution of the route being covered is never missed.
      unsubscribe.current = router.subscribe("onResolved", () => {
        resolved = true;
        liftWhenReady();
      });
      after(prefersReducedMotion() ? 150 : TRANSITION_MIN_MS, () => {
        held = true;
        liftWhenReady();
      });
      after(TRANSITION_MAX_MS, lift);
    },
    [after, cancelPending, lift, router],
  );

  const transitionOnClick = useCallback(
    (label: string) => (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      show(label);
    },
    [show],
  );

  const value = useMemo(() => ({ show, transitionOnClick }), [show, transitionOnClick]);

  return (
    <PageTransitionContext.Provider value={value}>
      {children}
      {overlay ? (
        <Preloader label={overlay.label} leaving={overlay.leaving} boot={overlay.boot} />
      ) : null}
    </PageTransitionContext.Provider>
  );
}
