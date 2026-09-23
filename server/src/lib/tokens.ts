import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Secrets that travel by e-mail or cookie, and the hashes stored in their place.
 *
 * Nothing here is ever persisted in the clear. A leaked database must not hand
 * anyone a working session, activation link or verification code (SR-03, SR-12).
 */

/**
 * SHA-256 rather than bcrypt, on purpose.
 *
 * bcrypt is slow by design, which is what makes it right for passwords: a human
 * picks those from a small space, so an attacker with the hashes can guess. The
 * values below are 256 bits of machine randomness - there is no space to search,
 * so a slow hash buys nothing and costs a quarter-second on every request that
 * carries a session cookie.
 *
 * The six-digit code is the exception worth naming: a million possibilities is
 * small enough to exhaust. It is defended by the attempt counter on
 * email_verification_codes and a ten-minute expiry, not by the hash. That is a
 * deliberate trade - an attacker who already has the database has the user rows
 * too, so making the code expensive to crack protects nothing that is not
 * already lost.
 */
export const hashSecret = (secret: string) => createHash("sha256").update(secret).digest("hex");

/**
 * Compares two hex digests without leaking, through how long the comparison
 * took, how many leading characters matched.
 */
export function secretMatches(secret: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashSecret(secret), "hex");
  let stored: Buffer;
  try {
    stored = Buffer.from(storedHash, "hex");
  } catch {
    return false;
  }
  // timingSafeEqual throws rather than returning false on a length mismatch,
  // which would itself be an observable difference.
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}

export interface IssuedSecret {
  /** Sent to the holder. Never stored. */
  secret: string;
  /** Stored in place of it. */
  hash: string;
}

/**
 * A session token or an activation/recovery link token.
 *
 * 32 bytes, base64url so it survives being pasted into a query string without
 * escaping (FR-03, FR-06). CI-08 keeps session tokens out of URLs entirely -
 * this encoding is for the e-mailed link tokens.
 */
export function issueToken(): IssuedSecret {
  const secret = randomBytes(32).toString("base64url");
  return { secret, hash: hashSecret(secret) };
}

/**
 * The six-digit code a student types to prove the e-mail address is theirs.
 *
 * `randomInt` is uniform over the range. Deriving digits with `%` from raw bytes
 * would bias the low end, and a biased code is a smaller space to guess than it
 * looks. Leading zeros are preserved, so `000042` is a real code - the input is
 * six digits, not a number.
 */
export function issueNumericCode(): IssuedSecret {
  const secret = String(randomInt(0, 1_000_000)).padStart(6, "0");
  return { secret, hash: hashSecret(secret) };
}

/** When a secret issued now should stop working. */
export const expiresInMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000);
