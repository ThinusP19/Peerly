import { env } from "../config/env.ts";
import { query, withTransaction } from "../db/pool.ts";
import type { Role, SessionUser } from "../domain/types.ts";
import * as mail from "../lib/mail.ts";
import { checkPassword, hashPassword, verifyPassword } from "../lib/password.ts";
import { expiresInMinutes, hashSecret, issueToken } from "../lib/tokens.ts";
import { badRequest } from "../middleware/errors.ts";
import { record } from "./audit.ts";
import { revokeAllSessions } from "./sessions.ts";

/**
 * Account recovery, activation and password changes (FR-01, FR-03, FR-06).
 *
 * All three share one rule from SR-05: a password that changes ends every
 * session that was opened with the old one. Whoever held it stops being signed
 * in, wherever they were. The session that performed the change is spared, so
 * changing your own password does not sign you out of the tab you did it in.
 *
 * Unlike registration, these stay non-disclosing: asking to reset a password
 * reports the same success for an address that exists and one that does not.
 * The Sponsor's exception was for the registration form only.
 */

type Purpose = "activation" | "recovery";

interface HolderRow {
  id: string;
  name: string;
  surname: string;
  email: string;
  role: Role;
  student_number: string | null;
  password_hash: string | null;
}

/**
 * Issues a token, retiring any other live one for the same purpose.
 *
 * Without the retirement an account accumulates working reset links every time
 * someone presses the button, and the oldest stays valid for its full hour.
 */
async function issueFor(userId: string, purpose: Purpose): Promise<string> {
  const { secret, hash } = issueToken();
  const minutes =
    purpose === "activation" ? env.tokens.activationMinutes : env.tokens.recoveryMinutes;

  await withTransaction(async (sql) => {
    await sql.query(
      "UPDATE auth_tokens SET consumed_at = now() WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL",
      [userId, purpose],
    );
    await sql.query(
      "INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at) VALUES ($1, $2, $3, $4)",
      [userId, purpose, hash, expiresInMinutes(minutes)],
    );
  });

  return secret;
}

/** Resolves a token to its holder, or null if it is unknown, spent or expired. */
async function holderOf(token: string, purpose: Purpose): Promise<HolderRow | null> {
  const { rows } = await query<HolderRow>(
    `SELECT u.id, u.name, u.surname, u.email, u.role, u.student_number, u.password_hash
       FROM auth_tokens t
       JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = $1
        AND t.purpose = $2
        AND t.consumed_at IS NULL
        AND t.expires_at > now()`,
    [hashSecret(token), purpose],
  );
  return rows[0] ?? null;
}

/** Applies SR-02 against the identity the password belongs to. */
function enforcePolicy(
  password: string,
  identity: { email: string; student_number: string | null },
  field: "password" | "newPassword",
): void {
  const failure = checkPassword(password, {
    email: identity.email,
    ...(identity.student_number ? { studentNumber: identity.student_number } : {}),
  });
  if (failure) throw badRequest(failure.message, { [field]: failure.message });
}

/* ------------------------------------------------------------------ *
 * FR-06 - forgotten password
 * ------------------------------------------------------------------ */

/**
 * Sends a reset link, if there is an active account to send one to.
 *
 * Returns nothing whatever happened (SR-06). An unverified account gets no link
 * either: it has not proved it owns the address, so a reset link would be a way
 * around verification rather than a recovery.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const { rows } = await query<{ id: string; name: string; email: string }>(
    "SELECT id, name, email FROM users WHERE lower(email) = $1 AND status = 'active'",
    [email.trim().toLowerCase()],
  );
  const account = rows[0];
  if (!account) return;

  const token = await issueFor(account.id, "recovery");
  mail.queue(mail.passwordResetMail(account.email, account.name, token));
}

/** Sets a new password from a reset link and ends every existing session. */
export async function resetPassword(token: string, password: string): Promise<boolean> {
  const holder = await holderOf(token, "recovery");
  if (!holder) return false;

  enforcePolicy(password, holder, "password");
  const hash = await hashPassword(password);

  await withTransaction(async (sql) => {
    await sql.query("UPDATE auth_tokens SET consumed_at = now() WHERE token_hash = $1", [
      hashSecret(token),
    ]);
    await sql.query("UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1", [
      holder.id,
      hash,
    ]);

    // SR-15: a credential change is a security event, so it is on the trail.
    // The password itself appears nowhere, here or in the detail (SR-14).
    await record(
      {
        actor: { id: holder.id, name: holder.name, surname: holder.surname, role: holder.role },
        eventType: "password.changed",
        objectDescription: `${holder.name} ${holder.surname} · ${holder.email}`,
        detail: "Password reset from an e-mailed recovery link; all sessions ended.",
      },
      sql,
    );
  });

  // SR-05: a recovery means the old password may be in someone else's hands.
  // Nothing opened with it survives - including, here, the current session,
  // since whoever asked for this has not yet proved they are the holder.
  await revokeAllSessions(holder.id);
  return true;
}

/* ------------------------------------------------------------------ *
 * FR-06 - changing a known password
 * ------------------------------------------------------------------ */

/**
 * Changes the password of someone already signed in, current password first.
 *
 * `keepSessionId` is the session making the request, which stays alive.
 */
export async function changePassword(
  userId: string,
  current: string,
  next: string,
  keepSessionId?: string,
): Promise<void> {
  const { rows } = await query<HolderRow>(
    `SELECT id, name, surname, email, role, student_number, password_hash
       FROM users WHERE id = $1`,
    [userId],
  );
  const holder = rows[0];
  if (!holder)
    throw badRequest("Enter your current password.", { current: "Enter your current password." });

  if (!(await verifyPassword(current, holder.password_hash))) {
    throw badRequest("That isn't your current password.", {
      current: "That isn't your current password.",
    });
  }

  if (current === next) {
    throw badRequest("Choose a password different from your current one.", {
      newPassword: "Choose a password different from your current one.",
    });
  }

  enforcePolicy(next, holder, "newPassword");

  await query("UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1", [
    holder.id,
    await hashPassword(next),
  ]);

  await record({
    actor: { id: holder.id, name: holder.name, surname: holder.surname, role: holder.role },
    eventType: "password.changed",
    objectDescription: `${holder.name} ${holder.surname} · ${holder.email}`,
    detail: "Password changed by the account holder; other sessions ended.",
  });

  await revokeAllSessions(holder.id, keepSessionId);
}

/* ------------------------------------------------------------------ *
 * FR-01, FR-03 - staff activation links
 * ------------------------------------------------------------------ */

export interface ActivationAccount {
  name: string;
  email: string;
  role: Role;
}

/** Sends the "set up your account" link an administrator's new staff member needs. */
export async function sendActivationLink(userId: string): Promise<void> {
  const { rows } = await query<{ name: string; email: string }>(
    "SELECT name, email FROM users WHERE id = $1",
    [userId],
  );
  const account = rows[0];
  if (!account) return;

  const token = await issueFor(userId, "activation");
  mail.queue(mail.activationLinkMail(account.email, account.name, token));
}

/**
 * What the activation page needs to know before showing its form, or null if
 * the link is spent or expired - which is the state the page renders as
 * "this link has expired" with a resend.
 */
export async function describeActivationToken(token: string): Promise<ActivationAccount | null> {
  const holder = await holderOf(token, "activation");
  if (!holder) return null;
  return { name: holder.name, email: holder.email, role: holder.role };
}

/** Confirms the address, sets the first password, and activates the account. */
export async function activateWithToken(
  token: string,
  password: string,
): Promise<SessionUser | null> {
  const holder = await holderOf(token, "activation");
  if (!holder) return null;

  enforcePolicy(password, holder, "password");
  const hash = await hashPassword(password);

  return withTransaction(async (sql) => {
    await sql.query("UPDATE auth_tokens SET consumed_at = now() WHERE token_hash = $1", [
      hashSecret(token),
    ]);
    const { rows } = await sql.query<{
      id: string;
      role: Role;
      name: string;
      surname: string;
      email: string;
      student_number: string | null;
      status: SessionUser["status"];
      created_at: Date;
    }>(
      `UPDATE users
          SET password_hash = $2, status = 'active', updated_at = now()
        WHERE id = $1 AND status <> 'inactive'
        RETURNING id, role, name, surname, email, student_number, status, created_at`,
      [holder.id, hash],
    );

    const user = rows[0];
    if (!user) return null;

    await record(
      {
        actor: { id: user.id, name: user.name, surname: user.surname, role: user.role },
        eventType: "account.activated",
        objectDescription: `${user.name} ${user.surname} · ${user.email}`,
        detail: "Account activated from an e-mailed link; first password set.",
      },
      sql,
    );

    return {
      id: user.id,
      role: user.role,
      name: user.name,
      surname: user.surname,
      email: user.email,
      studentNumber: user.student_number,
      status: user.status,
      createdAt: user.created_at.toISOString(),
    };
  });
}
