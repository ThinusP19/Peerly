import { useEffect, useState } from "react";

/** setTimeout's ceiling; a longer wait fires at once. About 24 days. */
const MAX_TIMEOUT = 2_147_483_647;

/**
 * The current time, refreshed once `until` arrives.
 *
 * A page left open across a deadline has to notice it passing: an evaluation
 * form that stayed editable past the closing time would collect answers the
 * server refuses (BR-05). One timer for the one moment that matters, rather
 * than a clock ticking every second.
 */
export function useNow(until?: string): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!until) return;
    const wait = new Date(until).getTime() - Date.now();
    if (!(wait > 0)) return;
    const id = window.setTimeout(() => setNow(new Date()), Math.min(wait + 50, MAX_TIMEOUT));
    return () => window.clearTimeout(id);
  }, [until, now]);

  return now;
}
