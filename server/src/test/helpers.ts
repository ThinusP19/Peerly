import { query } from "../db/pool.ts";
import type { Role, UserStatus } from "../domain/types.ts";
import { hashPassword } from "../lib/password.ts";

/**
 * Empties everything a test may have written, leaving reference data in place.
 *
 * Built from the catalogue rather than a hand-kept list, so a table added in a
 * later migration is cleared without anyone remembering to come back here.
 * `rating_options` and `schema_migrations` are excluded: the first is seeded by
 * a migration and is configuration rather than test data, and the second is
 * what tells the runner the schema is current.
 *
 * TRUNCATE rather than DELETE matters for one table in particular:
 * `audit_entries` carries a BEFORE DELETE trigger that refuses outright
 * (FR-27). Row-level triggers do not fire on TRUNCATE, so the log can be reset
 * between tests without weakening the rule that protects it in production.
 */
export async function resetDatabase(): Promise<void> {
  const { rows } = await query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT IN ('rating_options', 'schema_migrations')`,
  );
  if (rows.length === 0) return;

  const tables = rows.map((row) => `"${row.tablename}"`).join(", ");
  await query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}

let sequence = 0;

/**
 * One bcrypt hash, computed on first use and reused.
 *
 * Cost 12 is deliberately ~250ms, which is right in production and ruinous in a
 * test that creates a user per case. Almost no test cares what the password is,
 * only that there is one, so they share a hash. A test that actually verifies a
 * password passes its own and pays for it.
 */
let defaultHash: Promise<string> | null = null;
const sharedPasswordHash = () => (defaultHash ??= hashPassword("a good password"));

export interface UserOverrides {
  role?: Role;
  status?: UserStatus;
  name?: string;
  surname?: string;
  email?: string;
  studentNumber?: string | null;
  password?: string | null;
}

/**
 * Inserts an account. Everything has a default so a test states only the part
 * it actually cares about.
 */
export async function createUser(overrides: UserOverrides = {}): Promise<{
  id: string;
  email: string;
  role: Role;
}> {
  sequence += 1;
  const role = overrides.role ?? "student";
  const email = overrides.email ?? `test-${sequence}@${role === "student" ? "mynwu" : "nwu"}.ac.za`;
  // A student must have a student number (students_have_a_student_number).
  const studentNumber =
    overrides.studentNumber !== undefined
      ? overrides.studentNumber
      : role === "student"
        ? String(40_000_000 + sequence)
        : null;

  const passwordHash =
    overrides.password === null
      ? null
      : overrides.password === undefined
        ? await sharedPasswordHash()
        : await hashPassword(overrides.password);

  const { rows } = await query<{ id: string }>(
    `INSERT INTO users (role, name, surname, email, student_number, password_hash, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      role,
      overrides.name ?? "Test",
      overrides.surname ?? `Person${sequence}`,
      email,
      studentNumber,
      passwordHash,
      overrides.status ?? "active",
    ],
  );

  return { id: rows[0]!.id, email, role };
}

/** Moves a session's clocks back, so expiry can be tested without waiting. */
export async function ageSession(
  sessionId: string,
  by: { idleMinutes?: number; absoluteMinutes?: number },
): Promise<void> {
  if (by.idleMinutes !== undefined) {
    await query(
      "UPDATE sessions SET last_seen_at = now() - make_interval(mins => $2) WHERE id = $1",
      [sessionId, by.idleMinutes],
    );
  }
  if (by.absoluteMinutes !== undefined) {
    await query(
      "UPDATE sessions SET expires_at = now() - make_interval(mins => $2) WHERE id = $1",
      [sessionId, by.absoluteMinutes],
    );
  }
}

/** The session row id for a token, so a test can age or revoke it. */
export async function sessionIdForToken(tokenHash: string): Promise<string | null> {
  const { rows } = await query<{ id: string }>("SELECT id FROM sessions WHERE token_hash = $1", [
    tokenHash,
  ]);
  return rows[0]?.id ?? null;
}
