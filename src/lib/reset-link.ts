/**
 * What the reset-password page should show for the link it was opened with.
 *
 * - `missing`: no token at all - a truncated or hand-typed link. Said at once,
 *   before anyone types a new password the server could only refuse.
 * - `expired`: a token the server refused, or the prototype's `token=expired`.
 * - `form`: a token worth trying.
 */
export type ResetLinkState = "missing" | "expired" | "form";

export function resetLinkState(token: string | undefined, refused: boolean): ResetLinkState {
  if (!token?.trim()) return "missing";
  if (refused || token === "expired") return "expired";
  return "form";
}
