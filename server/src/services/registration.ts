import { env } from "../config/env.ts";
import { query, withTransaction } from "../db/pool.ts";
import { badRequest } from "../middleware/errors.ts";
import type { SessionUser } from "../domain/types.ts";
import * as mail from "../lib/mail.ts";
import { checkPassword, hashPassword } from "../lib/password.ts";
import { expiresInMinutes, hashSecret, issueNumericCode } from "../lib/tokens.ts";
import { record } from "./audit.ts";
import { matchEnrolments } from "./matching.ts";

/**
 * Student self-registration and e-mail verification (FR-02, FR-03, SR-01).
 *
 * Registration names the field that is already taken, on the Sponsor's
 * instruction - see registerStudent for what that costs and why it is recorded
 * against SR-06 rather than hidden.
 *
 * Verification is unaffected and stays strict, because it is the control SR-01
 * actually leans on: registering under a classmate's student number gets you an
 * unverified row and an e-mail you cannot read, and an unverified row can do
 * nothing at all.
 */

export interface RegisterStudentInput {
  name: string;
  surname: string;
  email: string;
  studentNumber: string;
  password: string;
}

/** After five wrong guesses the code is spent, and a new one must be requested. */
const MAX_CODE_ATTEMPTS = 5;

/** An 8-digit student number, as printed on a student card. */
export const STUDENT_NUMBER_PATTERN = /^\d{8}$/;

export const emailDomain = (email: string) => email.trim().toLowerCase().split("@")[1] ?? "";

export const isStudentEmail = (email: string) =>
  env.studentEmailDomains.includes(emailDomain(email));

interface AccountRow {
  id: string;
  email: string;
  name: string;
  status: "active" | "inactive" | "unverified";
}

/**
 * Replaces any live code with a fresh one and e-mails it.
 *
 * The old code is consumed first: `email_verification_codes_one_live_per_user`
 * permits only one unconsumed row per account, so a double-submitted resend
 * cannot leave two codes working at once (OR-07).
 */
async function issueCode(userId: string, email: string, name: string): Promise<void> {
  const { secret, hash } = issueNumericCode();

  await withTransaction(async (sql) => {
    await sql.query(
      "UPDATE email_verification_codes SET consumed_at = now() WHERE user_id = $1 AND consumed_at IS NULL",
      [userId],
    );
    await sql.query(
      `INSERT INTO email_verification_codes (user_id, email, code_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [userId, email.toLowerCase(), hash, expiresInMinutes(env.tokens.emailCodeMinutes)],
    );
  });

  // CI-05: dispatched without blocking the response. OR-03 means a failure here
  // does not fail the registration - which is why a resend always exists.
  mail.queue(mail.verificationCodeMail(email, name, secret));
}

/**
 * Registers a student.
 *
 * Reports a taken e-mail address or student number to the person filling the
 * form, naming the field so it can be shown beside the offending input.
 *
 * This is a deliberate departure from SR-06, taken on the Sponsor's
 * instruction, and it is worth being clear about the cost. Student numbers run
 * in blocks, so a form that confirms which ones exist can be worked through
 * mechanically to learn who holds a Peerly account - no password and no
 * enrolment required. The trade buys a student who mistypes their number an
 * immediate correction instead of a code that never arrives. Recorded against
 * SR-06 in scope.md rather than left as an undocumented gap.
 */
export async function registerStudent(input: RegisterStudentInput): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const studentNumber = input.studentNumber.trim();
  const name = input.name.trim();
  const surname = input.surname.trim();

  // SR-01: the verification code proves the mailbox, so the mailbox has to be
  // the one that belongs to the student number. An NWU student address is the
  // student number itself; without this, anyone could register a classmate's
  // number with their own address and be matched into the classmate's place on
  // the class list.
  if (email.split("@")[0] !== studentNumber) {
    const message = `Your student number and student email don't match. Your student email is your student number followed by @${email.split("@")[1] ?? "mynwu.ac.za"} - for example ${studentNumber}@${email.split("@")[1] ?? "mynwu.ac.za"}.`;
    throw badRequest(message, { studentNumber: message });
  }

  // SR-02 on the server, where it cannot be skipped: the form checks the same
  // policy as the student types, but a request sent straight to the API does
  // not go through the form.
  const weak = checkPassword(input.password, { email, studentNumber });
  if (weak) throw badRequest(weak.message, { password: weak.message });

  const { rows } = await query<AccountRow & { student_number: string | null }>(
    `SELECT id, email, name, status, student_number FROM users
      WHERE student_number = $1 OR lower(email) = $2`,
    [studentNumber, email],
  );

  // An unverified row is a registration in progress, not an account. Nobody has
  // proved they own it, so it never blocks - it gets updated instead, which is
  // what makes going back to fix a typo work (FR-02).
  const claimed = rows.filter((row) => row.status !== "unverified");

  const emailTaken = claimed.find((row) => row.email.toLowerCase() === email);
  if (emailTaken) {
    throw badRequest("An account already uses that email address.", {
      email: "An account already uses that email address.",
    });
  }

  const numberTaken = claimed.find((row) => row.student_number === studentNumber);
  if (numberTaken) {
    throw badRequest("An account already uses that student number.", {
      studentNumber: "An account already uses that student number.",
    });
  }

  const passwordHash = await hashPassword(input.password);

  // Prefer the row matching the student number: that is the identity the class
  // list matches on, so it decides which registration we are continuing.
  const pending =
    rows.find((row) => row.status === "unverified" && row.student_number === studentNumber) ??
    rows.find((row) => row.status === "unverified");

  if (pending) {
    try {
      await query(
        `UPDATE users
            SET name = $2, surname = $3, email = $4, student_number = $5, password_hash = $6
          WHERE id = $1 AND status = 'unverified'`,
        [pending.id, name, surname, input.email.trim(), studentNumber, passwordHash],
      );
    } catch {
      // The address is held by a different registration already in progress.
      throw badRequest("An account already uses that email address.", {
        email: "An account already uses that email address.",
      });
    }
    await issueCode(pending.id, email, name);
    return;
  }

  let inserted;
  try {
    inserted = await query<{ id: string }>(
      `INSERT INTO users (role, name, surname, email, student_number, password_hash, status)
       VALUES ('student', $1, $2, $3, $4, $5, 'unverified')
       RETURNING id`,
      [name, surname, input.email.trim(), studentNumber, passwordHash],
    );
  } catch {
    // Lost a race against a simultaneous registration for the same identifiers.
    throw badRequest("An account already uses that email address or student number.", {
      email: "An account already uses that email address or student number.",
    });
  }

  // FR-27. The actor is the person registering, who at this point is the
  // account itself - nobody else acted.
  await record({
    actor: { id: inserted.rows[0]!.id, name, surname, role: "student" },
    eventType: "account.created",
    objectDescription: `${name} ${surname} · ${input.email.trim()}`,
    detail: `Student self-registration, student number ${studentNumber}. Awaiting e-mail verification.`,
  });

  await issueCode(inserted.rows[0]!.id, email, name);
}

/** Sends a fresh code, if there is an unverified account to send one for. */
export async function resendVerificationCode(email: string): Promise<void> {
  const { rows } = await query<AccountRow>(
    "SELECT id, email, name, status FROM users WHERE lower(email) = $1 AND status = 'unverified'",
    [email.trim().toLowerCase()],
  );
  const account = rows[0];
  if (!account) return;

  await issueCode(account.id, account.email, account.name);
}

interface CodeRow {
  id: string;
  user_id: string;
  code_hash: string;
  attempts: number;
  expired: boolean;
}

/**
 * Confirms the address and activates the account (FR-03).
 *
 * Returns null for every failure - no such registration, wrong code, expired
 * code, too many attempts - so a wrong guess and an unknown address are
 * indistinguishable (SR-06).
 */
export async function verifyEmailCode(email: string, code: string): Promise<SessionUser | null> {
  const normalised = email.trim().toLowerCase();

  const { rows } = await query<CodeRow>(
    `SELECT c.id, c.user_id, c.code_hash, c.attempts,
            (c.expires_at <= now()) AS expired
       FROM email_verification_codes c
       JOIN users u ON u.id = c.user_id
      WHERE c.consumed_at IS NULL
        AND c.email = $1
        AND u.status = 'unverified'`,
    [normalised],
  );
  const row = rows[0];
  if (!row) return null;

  if (row.expired || row.attempts >= MAX_CODE_ATTEMPTS) {
    await query("UPDATE email_verification_codes SET consumed_at = now() WHERE id = $1", [row.id]);
    return null;
  }

  if (row.code_hash !== hashSecret(code.trim())) {
    // Counted even though the code was wrong - that is the whole point, since
    // six digits is a small enough space to guess without a ceiling.
    await query("UPDATE email_verification_codes SET attempts = attempts + 1 WHERE id = $1", [
      row.id,
    ]);
    return null;
  }

  // One transaction: an account that is active with its code still live, or a
  // code consumed against an account that never activated, are both wrong (OR-05).
  return withTransaction(async (sql) => {
    await sql.query("UPDATE email_verification_codes SET consumed_at = now() WHERE id = $1", [
      row.id,
    ]);
    const activated = await sql.query<{
      id: string;
      role: SessionUser["role"];
      name: string;
      surname: string;
      email: string;
      student_number: string | null;
      status: SessionUser["status"];
      created_at: Date;
    }>(
      `UPDATE users SET status = 'active', updated_at = now()
        WHERE id = $1 AND status = 'unverified'
        RETURNING id, role, name, surname, email, student_number, status, created_at`,
      [row.user_id],
    );

    const user = activated.rows[0];
    if (!user) return null;

    // FR-04 on activation: a list imported before this student registered now
    // reaches them, in the same transaction that makes the account usable.
    if (user.role === "student") {
      await matchEnrolments(
        sql,
        { userId: user.id },
        { id: user.id, name: user.name, surname: user.surname, role: user.role },
      );
    }

    // In the same transaction as the activation, so the log cannot record an
    // activation that was rolled back (FR-27).
    await record(
      {
        actor: { id: user.id, name: user.name, surname: user.surname, role: user.role },
        eventType: "account.activated",
        objectDescription: `${user.name} ${user.surname} · ${user.email}`,
        detail: "E-mail address confirmed with a verification code.",
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
