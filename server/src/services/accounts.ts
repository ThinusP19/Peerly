import { env } from "../config/env.ts";
import { query, withTransaction } from "../db/pool.ts";
import type { Role, SessionUser, UserStatus } from "../domain/types.ts";
import { AppError, badRequest, conflict, notFoundOrForbidden } from "../middleware/errors.ts";
import { record } from "./audit.ts";
import { sendActivationLink } from "./recovery.ts";
import { revokeAllSessions } from "./sessions.ts";

/**
 * Staff account administration (FR-01, SR-16).
 *
 * An administrator manages lecturer and administrator accounts and nothing
 * else. SR-16 is explicit that the role carries no automatic access to
 * responses or marks, so there is no function here that touches either, and
 * none that reaches a student's account.
 *
 * Nobody sets a password for anybody. A new account is created unverified with
 * no password at all, and its holder chooses one from an emailed link (FR-03) -
 * so the administrator never knows it.
 */

export interface StaffAccount {
  id: string;
  role: Role;
  name: string;
  surname: string;
  email: string;
  status: UserStatus;
  createdAt: string;
}

interface StaffRow {
  id: string;
  role: Role;
  name: string;
  surname: string;
  email: string;
  status: UserStatus;
  created_at: Date;
}

const toAccount = (row: StaffRow): StaffAccount => ({
  id: row.id,
  role: row.role,
  name: row.name,
  surname: row.surname,
  email: row.email,
  status: row.status,
  createdAt: row.created_at.toISOString(),
});

const SELECT_STAFF = `
  SELECT id, role, name, surname, email, status, created_at
    FROM users WHERE role IN ('admin', 'lecturer')`;

/** Every staff account. Students are not administered here (SR-16). */
export async function listStaffAccounts(): Promise<StaffAccount[]> {
  const { rows } = await query<StaffRow>(`${SELECT_STAFF} ORDER BY surname, name`);
  return rows.map(toAccount);
}

/** How many administrators could still sign in. Used to refuse locking everyone out. */
export async function activeAdminCount(): Promise<number> {
  const { rows } = await query<{ count: string }>(
    "SELECT count(*) AS count FROM users WHERE role = 'admin' AND status = 'active'",
  );
  return Number(rows[0]!.count);
}

function assertStaffEmail(email: string): void {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  if (!env.staffEmailDomains.includes(domain)) {
    throw badRequest(`Use an institutional address ending in @${env.staffEmailDomains[0]}.`, {
      email: `Use an institutional address ending in @${env.staffEmailDomains[0]}.`,
    });
  }
}

export interface CreateStaffInput {
  role: "admin" | "lecturer";
  name: string;
  surname: string;
  email: string;
}

/**
 * Creates a staff account and emails its activation link (FR-01, FR-03).
 *
 * Unverified, with no password. The link is what turns it into a usable
 * account, which is also what proves the address belongs to the person it was
 * meant for.
 */
export async function createStaffAccount(
  input: CreateStaffInput,
  admin: SessionUser,
): Promise<StaffAccount> {
  assertStaffEmail(input.email);

  const account = await withTransaction(async (sql) => {
    let created;
    try {
      created = await sql.query<StaffRow>(
        `INSERT INTO users (role, name, surname, email, status)
         VALUES ($1, $2, $3, $4, 'unverified')
         RETURNING id, role, name, surname, email, status, created_at`,
        [input.role, input.name.trim(), input.surname.trim(), input.email.trim()],
      );
    } catch (error) {
      throw emailTaken(error) ? emailInUse() : error;
    }

    const row = toAccount(created.rows[0]!);
    await record(
      {
        actor: { id: admin.id, name: admin.name, surname: admin.surname, role: admin.role },
        eventType: "account.created",
        objectDescription: `${row.name} ${row.surname} · ${row.email}`,
        detail: `${row.role === "admin" ? "Administrator" : "Lecturer"} account created; activation link sent.`,
      },
      sql,
    );

    return row;
  });

  // After the transaction: an email that cannot be recalled must not be sent
  // for an account that was never created.
  await sendActivationLink(account.id);
  return account;
}

/**
 * The database is what refuses a second account on an address, case-blind
 * (users_email_lower_key) - checking first would race. This only recognises
 * that refusal so it can be put into words.
 */
const emailTaken = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  (error as { code?: string }).code === "23505" &&
  (error as { constraint?: string }).constraint === "users_email_lower_key";

const EMAIL_IN_USE = "An account already uses that email address.";
const emailInUse = () => new AppError(409, EMAIL_IN_USE, "conflict", { email: EMAIL_IN_USE });

export interface StaffChanges {
  name?: string;
  surname?: string;
  email?: string;
  role?: "admin" | "lecturer";
}

async function loadStaff(userId: string): Promise<StaffAccount> {
  const { rows } = await query<StaffRow>(`${SELECT_STAFF} AND id = $1`, [userId]);
  const row = rows[0];
  // A student id here is refused as though it did not exist: the admin portal
  // has no business confirming which student accounts are real (SR-16).
  if (!row) throw notFoundOrForbidden();
  return toAccount(row);
}

export async function updateStaffAccount(
  userId: string,
  changes: StaffChanges,
  admin: SessionUser,
): Promise<StaffAccount> {
  const before = await loadStaff(userId);
  if (changes.email) assertStaffEmail(changes.email);

  const next = {
    name: changes.name?.trim() ?? before.name,
    surname: changes.surname?.trim() ?? before.surname,
    email: changes.email?.trim() ?? before.email,
    role: changes.role ?? before.role,
  };
  const emailChanged = next.email.toLowerCase() !== before.email.toLowerCase();

  // SR-16: once an account is activated, its address is how its holder proves
  // who they are - every password reset goes there. If an administrator could
  // point it at an address they hold, "Forgot password" would hand them the
  // lecturer's account, ratings and marks. So only an address that has never
  // been used to sign in can be corrected.
  if (emailChanged && before.status !== "unverified") {
    throw conflict(
      "The email address of an account that has been activated can't be changed, because whoever holds the new address could reset the password and take the account over. Create a new account for the new address, then deactivate this one.",
    );
  }

  // Demoting the last active administrator locks everyone out just as surely as
  // deactivating them does.
  if (
    changes.role === "lecturer" &&
    before.role === "admin" &&
    before.status === "active" &&
    (await activeAdminCount()) <= 1
  ) {
    throw conflict(
      "This is the only active administrator. Make someone else an administrator first.",
    );
  }

  const changed = (["name", "surname", "email", "role"] as const).filter((field) =>
    field === "email" ? emailChanged : next[field] !== before[field],
  );

  const after = await withTransaction(async (sql) => {
    let updated;
    try {
      updated = await sql.query<StaffRow>(
        `UPDATE users SET name = $2, surname = $3, email = $4, role = $5, updated_at = now()
          WHERE id = $1
          RETURNING id, role, name, surname, email, status, created_at`,
        [userId, next.name, next.surname, next.email, next.role],
      );
    } catch (error) {
      // The same sentence create gives, beside the field, rather than the
      // generic "that would break one of Peerly's rules".
      throw emailTaken(error) ? emailInUse() : error;
    }
    const row = toAccount(updated.rows[0]!);

    // FR-27: every change to who an account belongs to or what it may do.
    if (changed.length) {
      await record(
        {
          actor: { id: admin.id, name: admin.name, surname: admin.surname, role: admin.role },
          eventType: "account.updated",
          objectDescription: `${row.name} ${row.surname} · ${row.email}`,
          detail: changed
            .map((field) => `${label[field]} changed from ${before[field]} to ${row[field]}.`)
            .join(" "),
          before: Object.fromEntries(changed.map((field) => [field, before[field]])),
          after: Object.fromEntries(changed.map((field) => [field, row[field]])),
        },
        sql,
      );
    }
    return row;
  });

  // The link already sent went to the wrong address. Reissuing kills it - so
  // whoever received the mistyped one can no longer activate this account - and
  // sends a working one to the address that is now on it.
  if (emailChanged) await sendActivationLink(userId);

  return after;
}

const label = { name: "First name", surname: "Surname", email: "Email", role: "Role" } as const;

/**
 * Activates or deactivates a staff account (FR-01).
 *
 * Deactivating ends every session the account holds (SR-05): an administrator
 * who revokes access expects it to take effect now, not in twelve hours when
 * the token happens to expire.
 */
export async function setStaffAccountStatus(
  userId: string,
  status: "active" | "inactive",
  admin: SessionUser,
): Promise<StaffAccount> {
  const before = await loadStaff(userId);

  if (status === "inactive" && before.role === "admin" && before.status === "active") {
    if ((await activeAdminCount()) <= 1) {
      throw conflict(
        "This is the only active administrator. Peerly would have nobody who could manage accounts.",
      );
    }
  }

  if (status === "active" && before.status === "unverified") {
    throw conflict(
      "This account hasn't been activated yet. Its holder needs to use the link they were emailed.",
    );
  }

  // Nothing to do, and nothing to record: an entry saying an active account was
  // "re-activated" would be false.
  if (before.status === status) return before;

  // An account deactivated before its holder ever activated it has no password.
  // Re-activating returns it to where it was - waiting for its holder - rather
  // than making it active without anyone having confirmed the address.
  const { rows: passwords } = await query<{ has_password: boolean }>(
    "SELECT password_hash IS NOT NULL AS has_password FROM users WHERE id = $1",
    [userId],
  );
  const target = status === "active" && !passwords[0]?.has_password ? "unverified" : status;

  const account = await withTransaction(async (sql) => {
    const { rows } = await sql.query<StaffRow>(
      `UPDATE users SET status = $2, updated_at = now() WHERE id = $1
       RETURNING id, role, name, surname, email, status, created_at`,
      [userId, target],
    );
    const row = toAccount(rows[0]!);

    await record(
      {
        actor: { id: admin.id, name: admin.name, surname: admin.surname, role: admin.role },
        eventType: status === "inactive" ? "account.deactivated" : "account.activated",
        objectDescription: `${row.name} ${row.surname} · ${row.email}`,
        detail:
          status === "inactive"
            ? "Account deactivated; all sessions ended."
            : target === "unverified"
              ? "Account re-activated. It was never activated by its holder, so it is waiting for them to use their link."
              : "Account re-activated.",
        before: { status: before.status },
        after: { status: target },
      },
      sql,
    );

    return row;
  });

  if (status === "inactive") await revokeAllSessions(userId);
  return account;
}

/**
 * Sends the activation link again (FR-01, FR-03).
 *
 * A link expires after a day, lands in a spam folder, or is deleted. Without
 * this the administrator's only options were to delete the account and create
 * it again - losing the audit trail that it ever existed - or to have somebody
 * run SQL against the database.
 *
 * Only for an account that has never been activated. An active one needs a
 * password reset, which its holder asks for themselves; issuing an activation
 * link for it would be a way to take over somebody's account from the
 * administrator's screen, and SR-16 is explicit that the role does not carry
 * that. `issueFor` invalidates the account's earlier unused activation tokens,
 * so only the newest link works and an intercepted older one is already dead.
 */
export async function resendActivationLink(
  userId: string,
  admin: SessionUser,
): Promise<StaffAccount> {
  const account = await loadStaff(userId);

  if (account.status !== "unverified") {
    throw conflict(
      account.status === "active"
        ? 'This account is already active. Ask its holder to use "Forgot password" instead.'
        : "This account is deactivated. Reactivate it first.",
    );
  }

  await record({
    actor: { id: admin.id, name: admin.name, surname: admin.surname, role: admin.role },
    eventType: "account.activation_resent",
    objectDescription: `${account.name} ${account.surname} · ${account.email}`,
    detail: "Activation link sent again; any earlier link stopped working.",
  });

  await sendActivationLink(userId);
  return account;
}
