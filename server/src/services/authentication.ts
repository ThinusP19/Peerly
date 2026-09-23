import { query } from "../db/pool.ts";
import type { SessionUser, UserStatus } from "../domain/types.ts";
import { verifyPassword } from "../lib/password.ts";

/**
 * Signing in (FR-05), and the lock-out that protects it (SR-04).
 *
 * SR-06 governs the shape: an unknown address, a wrong password and a
 * deactivated account all produce exactly the same null. The caller cannot tell
 * them apart, so neither can anyone working through a list of addresses.
 *
 * That equivalence has to hold in time as well as in content, which is why the
 * password is verified even when no account was found - see verifyPassword.
 * Returning early on a missing account would make "no such address" measurably
 * faster than "wrong password", and the difference is easy to measure.
 */

/** SR-04: five consecutive failures locks the account. */
const MAX_ACCOUNT_FAILURES = 5;

/**
 * How far back failures count.
 *
 * A lock that never lifts turns a nuisance into a denial of service against a
 * real student, so it ages out. Fifteen minutes is long enough to make guessing
 * pointless and short enough that someone who simply forgot their password is
 * not stuck waiting for an administrator.
 */
const LOCKOUT_MINUTES = 15;

/**
 * SR-04's second half: rate limiting by source address.
 *
 * Deliberately far looser than the per-account limit. A whole residence or
 * campus can sit behind one address, so this is set to catch a machine working
 * through a list, not a lecture hall signing in at once.
 */
const MAX_SOURCE_FAILURES = 30;

interface CandidateRow {
  id: string;
  role: SessionUser["role"];
  name: string;
  surname: string;
  email: string;
  student_number: string | null;
  status: UserStatus;
  password_hash: string | null;
  created_at: Date;
}

export interface SignInOrigin {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

async function recordAttempt(
  email: string,
  userId: string | null,
  succeeded: boolean,
  origin: SignInOrigin,
): Promise<void> {
  await query(
    `INSERT INTO login_attempts (email, user_id, succeeded, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [email, userId, succeeded, origin.ip ?? null, origin.userAgent ?? null],
  );
}

/**
 * Consecutive failures for an address: those since its most recent success, and
 * within the window.
 *
 * Derived rather than stored. A counter column would need resetting in every
 * path that ends in a success, and the one path somebody forgets is the one
 * that leaves an account locked or a lock that never engages.
 */
export async function consecutiveFailures(email: string): Promise<number> {
  const { rows } = await query<{ failures: string }>(
    `SELECT count(*) AS failures
       FROM login_attempts
      WHERE email = $1
        AND succeeded = false
        AND attempted_at > now() - make_interval(mins => $2)
        AND attempted_at > COALESCE(
              (SELECT max(attempted_at) FROM login_attempts
                WHERE email = $1 AND succeeded = true),
              '-infinity'::timestamptz)`,
    [email.trim().toLowerCase(), LOCKOUT_MINUTES],
  );
  return Number(rows[0]?.failures ?? 0);
}

export const isLockedOut = async (email: string) =>
  (await consecutiveFailures(email)) >= MAX_ACCOUNT_FAILURES;

/** Recent failures from one source address, for the looser per-source ceiling. */
async function sourceFailures(ip: string | undefined): Promise<number> {
  if (!ip) return 0;
  const { rows } = await query<{ failures: string }>(
    `SELECT count(*) AS failures
       FROM login_attempts
      WHERE ip = $1
        AND succeeded = false
        AND attempted_at > now() - make_interval(mins => $2)`,
    [ip, LOCKOUT_MINUTES],
  );
  return Number(rows[0]?.failures ?? 0);
}

/**
 * Verifies an address and password, or returns null.
 *
 * Null covers: no such account, wrong password, account not active, and locked
 * out. The route turns all of them into one message (FR-05, SR-06).
 *
 * A locked-out attempt is still recorded as a failure, so someone hammering the
 * form stays locked rather than getting a fresh allowance every fifteen
 * minutes. The cost is that a legitimate person who keeps guessing extends
 * their own wait, which is what account recovery is for.
 */
export async function attemptSignIn(
  email: string,
  password: string,
  origin: SignInOrigin = {},
): Promise<SessionUser | null> {
  const normalised = email.trim().toLowerCase();

  const [accountFailures, fromSource] = await Promise.all([
    consecutiveFailures(normalised),
    sourceFailures(origin.ip),
  ]);

  if (accountFailures >= MAX_ACCOUNT_FAILURES || fromSource >= MAX_SOURCE_FAILURES) {
    await recordAttempt(normalised, null, false, origin);
    return null;
  }

  const { rows } = await query<CandidateRow>(
    `SELECT id, role, name, surname, email, student_number, status, password_hash, created_at
       FROM users WHERE lower(email) = $1`,
    [normalised],
  );
  const candidate = rows[0];

  // Runs even with no candidate, against a dummy hash, so the two cases cost
  // the same amount of time.
  const passwordMatches = await verifyPassword(password, candidate?.password_hash ?? null);

  if (!candidate || !passwordMatches || candidate.status !== "active") {
    await recordAttempt(normalised, candidate?.id ?? null, false, origin);
    return null;
  }

  await recordAttempt(normalised, candidate.id, true, origin);

  return {
    id: candidate.id,
    role: candidate.role,
    name: candidate.name,
    surname: candidate.surname,
    email: candidate.email,
    studentNumber: candidate.student_number,
    status: candidate.status,
    createdAt: candidate.created_at.toISOString(),
  };
}
