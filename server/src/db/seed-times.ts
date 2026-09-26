/**
 * When a seeded submission was made.
 *
 * Stamping every submission with the seed's own `now()` put the closed
 * assessment's submissions two months after its closing time, which is exactly
 * what the deadline rule (BR-05) forbids - so the demo data contradicted the
 * rule it exists to show, on screen and in the export.
 *
 * Each submission instead lands inside the window it could really have been
 * made in: after the assessment opened, and before it closed or before now,
 * whichever is earlier. The `n`th submission always gets the same point in
 * that window, so a re-seed spreads them the same way; only the clock the
 * window hangs off moves, as with every other seeded date.
 */
export function seededSubmittedAt(
  window: { opensAt: string; closesAt: string },
  n: number,
  now: Date = new Date(),
): string {
  const from = new Date(window.opensAt).getTime();
  const to = Math.min(new Date(window.closesAt).getTime(), now.getTime());
  if (!(to > from)) {
    throw new Error("A seeded submission needs a window that has already opened.");
  }
  // A fixed stride through 97 slots, kept clear of both ends: varied enough to
  // look like people submitting over days, and never on the deadline itself.
  const slot = ((n * 37) % 97) + 1;
  return new Date(from + ((to - from) * slot) / 98).toISOString();
}
