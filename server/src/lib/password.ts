import { randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";

/**
 * The password policy (SR-02) and the hashing behind it (SR-03).
 *
 * The rules are deliberately a copy of `src/lib/password.ts` in the web app
 * rather than a shared import: the two are separate packages, and the browser
 * copy exists only to drive the live checklist as someone types. This copy is
 * the one that decides. A password that passes there and fails here is a
 * cosmetic annoyance; the reverse would be a hole, which is why enforcement
 * lives on this side and `password.test.ts` pins the pair together.
 */

/** A short list of passwords that appear at the top of every breach dump. */
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "passw0rd",
  "12345678",
  "123456789",
  "1234567890",
  "11111111",
  "00000000",
  "qwerty123",
  "qwertyuiop",
  "iloveyou",
  "admin123",
  "administrator",
  "letmein1",
  "welcome1",
  "welcome123",
  "sunshine1",
  "football1",
  "princess1",
  "abc12345",
  "changeme",
  "trustno1",
  "peerly123",
  "student123",
  "nwu12345",
]);

export interface PasswordIdentity {
  email?: string;
  studentNumber?: string;
}

export interface PasswordFailure {
  id: "length" | "common" | "personal";
  /** Written for the person who typed it, not for a log (UI-06, UR-07). */
  message: string;
}

/**
 * Returns the first rule the password breaks, or null if it satisfies all of
 * them. First-failure rather than a full list: the client already renders the
 * live checklist, so the API only has to say why it said no.
 */
export function checkPassword(
  password: string,
  identity: PasswordIdentity,
): PasswordFailure | null {
  if (password.length < 8) {
    return { id: "length", message: "Use at least 8 characters." };
  }

  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) {
    return {
      id: "common",
      message: "That password is too common. Choose something harder to guess.",
    };
  }

  const email = identity.email?.trim().toLowerCase() ?? "";
  const localPart = email.split("@")[0] ?? "";
  // Anything shorter than three characters would reject far too much by accident.
  const personal = [email, localPart, identity.studentNumber?.trim() ?? ""].filter(
    (value) => value.length >= 3,
  );

  if (personal.some((value) => lower.includes(value.toLowerCase()))) {
    return {
      id: "personal",
      message: "Don't use your email address or student number in your password.",
    };
  }

  return null;
}

/**
 * SR-03: a salted adaptive hash. bcrypt generates and embeds its own salt, so
 * two accounts with the same password never share a hash.
 *
 * Cost 12 is roughly a quarter-second on current hardware - slow enough to make
 * offline cracking expensive, fast enough that PR-03's two-second acknowledgement
 * is never at risk.
 */
/**
 * Lowered under test only.
 *
 * The cost is a tuning value, not behaviour: the same code runs either way, and
 * every test here asserts on whether a hash verifies, never on how long it took.
 * At 12 a suite that registers an account per case spends most of its time
 * waiting, which is how a fast suite becomes one nobody runs. Production and
 * development both get the real figure.
 */
const BCRYPT_COST = process.env["NODE_ENV"] === "test" ? 4 : 12;

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_COST);

/**
 * Verifies a password against a stored hash.
 *
 * `hash` is nullable because an account that has not been activated yet has no
 * password (users.password_hash stays null until activation). Such an account
 * must still take the same time to fail as a real one, or the response time
 * alone would reveal that the address exists - which is exactly what SR-06
 * forbids. So we hash against a dummy rather than returning early.
 */
// Generated once at start-up rather than written in as a literal: a
// hand-copied hash that turned out to be malformed would make bcrypt fail
// fast instead of doing the work, quietly removing the very delay this
// exists to produce. Costs one hash at boot and nothing afterwards.
const DUMMY_HASH = bcrypt.hashSync(randomBytes(32).toString("hex"), BCRYPT_COST);

export async function verifyPassword(password: string, hash: string | null): Promise<boolean> {
  if (hash === null) {
    await bcrypt.compare(password, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(password, hash);
}
