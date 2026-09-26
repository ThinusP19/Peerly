/**
 * Which sign-in form someone came through, carried as `?as=` so "Back to sign
 * in" returns to that form rather than to role selection.
 *
 * It only ever picks wording. The portal a person lands in is decided by the
 * account's own role on the server, so choosing the wrong door grants nothing.
 */
export type SignInAudience = "student" | "lecturer" | "admin";

const audiences: readonly SignInAudience[] = ["student", "lecturer", "admin"];

/** Reads `?as=` from a route's search params; anything unrecognised is dropped. */
export function parseSignInAudience(value: unknown): SignInAudience | undefined {
  return audiences.find((audience) => audience === value);
}

/** The sign-in form an account of this role belongs on. */
export function signInAudienceFor(role: string | undefined): SignInAudience {
  if (role === "admin") return "admin";
  if (role === "lecturer") return "lecturer";
  return "student";
}
