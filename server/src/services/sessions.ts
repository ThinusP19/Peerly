import { env } from "../config/env.ts";
import { query } from "../db/pool.ts";
import type { AuthContext, Role, SessionUser, UserStatus } from "../domain/types.ts";
import { expiresInMinutes, hashSecret, issueToken } from "../lib/tokens.ts";

/**
 * Server-side sessions (SR-05, SI-07, CI-08).
 *
 * The token itself exists only in the cookie. The database holds its SHA-256,
 * so a leaked dump yields no usable session. Revocation is therefore real
 * rather than advisory: marking the row ends the session everywhere at once,
 * which a self-contained JWT could not do without a blocklist that amounts to
 * the same table.
 *
 * Two clocks, both required by SR-05:
 *   absolute  expires_at, fixed 12 hours from sign-in and never extended
 *   idle      last_seen_at, 30 minutes, refreshed as the person works
 */

interface SessionRow {
  session_id: string;
  last_seen_at: Date;
  user_id: string;
  role: Role;
  name: string;
  surname: string;
  email: string;
  student_number: string | null;
  status: UserStatus;
  created_at: Date;
}

const toUser = (row: SessionRow): SessionUser => ({
  id: row.user_id,
  role: row.role,
  name: row.name,
  surname: row.surname,
  email: row.email,
  studentNumber: row.student_number,
  status: row.status,
  createdAt: row.created_at.toISOString(),
});

export interface NewSession {
  /** Goes in the cookie. Never stored, never logged (SR-14). */
  token: string;
  expiresAt: Date;
}

export interface SessionOrigin {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

/** Starts a session. The caller is responsible for having verified the password. */
export async function createSession(
  userId: string,
  origin: SessionOrigin = {},
): Promise<NewSession> {
  const { secret, hash } = issueToken();
  const expiresAt = expiresInMinutes(env.session.absoluteMinutes);

  await query(
    `INSERT INTO sessions (token_hash, user_id, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5)`,
    [hash, userId, expiresAt, origin.userAgent ?? null, origin.ip ?? null],
  );

  return { token: secret, expiresAt };
}

/**
 * How stale last_seen_at may get before a request bothers to write it back.
 *
 * Without this, every authenticated request costs an UPDATE - a write per page
 * view, for a column read once per request. Thirty seconds of imprecision on a
 * thirty-minute window is not worth that, and the absolute expiry is unaffected
 * either way.
 */
const TOUCH_AFTER_SECONDS = 30;

/**
 * Resolves a cookie token to the account behind it, or null.
 *
 * Every reason to refuse - unknown token, revoked, past its absolute expiry,
 * idle too long, account no longer active - returns the same null. The caller
 * cannot tell which, and neither can anyone probing it (SR-06, SR-07).
 *
 * The account status check is deliberate belt-and-braces: deactivating an
 * account already revokes its sessions, but if that ever fails to run, a
 * deactivated person must still not be able to act.
 */
export async function resolveSession(token: string): Promise<AuthContext | null> {
  const { rows } = await query<SessionRow>(
    `SELECT s.id AS session_id, s.last_seen_at,
            u.id AS user_id, u.role, u.name, u.surname, u.email,
            u.student_number, u.status, u.created_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND s.last_seen_at > now() - make_interval(mins => $2)
        AND u.status = 'active'`,
    [hashSecret(token), env.session.idleMinutes],
  );

  const row = rows[0];
  if (!row) return null;

  const staleBy = (Date.now() - row.last_seen_at.getTime()) / 1000;
  if (staleBy > TOUCH_AFTER_SECONDS) {
    await query("UPDATE sessions SET last_seen_at = now() WHERE id = $1", [row.session_id]);
  }

  return { user: toUser(row), sessionId: row.session_id };
}

/** Ends one session - sign-out (FR-05). */
export async function revokeSession(sessionId: string): Promise<void> {
  await query("UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL", [
    sessionId,
  ]);
}

/**
 * Ends every session an account has (SR-05).
 *
 * Required after a password change, a recovery, and a deactivation: each of
 * those means the person who held the old credential must stop being signed in,
 * wherever they were.
 *
 * `except` keeps the session that performed the action alive, so changing your
 * own password does not sign you out of the tab you did it in.
 */
export async function revokeAllSessions(userId: string, except?: string): Promise<number> {
  const { rowCount } = await query(
    `UPDATE sessions
        SET revoked_at = now()
      WHERE user_id = $1
        AND revoked_at IS NULL
        AND ($2::uuid IS NULL OR id <> $2::uuid)`,
    [userId, except ?? null],
  );
  return rowCount ?? 0;
}

/**
 * Clears rows whose usefulness has passed. Nothing depends on this running -
 * resolveSession already refuses them - it only keeps the table from growing
 * without bound.
 */
export async function purgeExpiredSessions(): Promise<number> {
  const { rowCount } = await query(
    `DELETE FROM sessions
      WHERE expires_at < now() - interval '7 days'
         OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '7 days')`,
  );
  return rowCount ?? 0;
}
