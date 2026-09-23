import { env } from "../config/env.ts";
import { query, withTransaction } from "../db/pool.ts";
import type { Role, SessionUser, UserStatus } from "../domain/types.ts";
import { badRequest, conflict, notFoundOrForbidden } from "../middleware/errors.ts";
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
    } catch {
      throw conflict("An account already uses that email address.");
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

  const updated = await query<StaffRow>(
    `UPDATE users SET name = $2, surname = $3, email = $4, role = $5, updated_at = now()
      WHERE id = $1
      RETURNING id, role, name, surname, email, status, created_at`,
    [
      userId,
      changes.name?.trim() ?? before.name,
      changes.surname?.trim() ?? before.surname,
      changes.email?.trim() ?? before.email,
      changes.role ?? before.role,
    ],
  );

  const after = toAccount(updated.rows[0]!);
  if (after.role !== before.role) {
    await record({
      actor: { id: admin.id, name: admin.name, surname: admin.surname, role: admin.role },
      eventType: "account.updated",
      objectDescription: `${after.name} ${after.surname} · ${after.email}`,
      detail: `Role changed from ${before.role} to ${after.role}.`,
      before: { role: before.role },
      after: { role: after.role },
    });
  }
  return after;
}

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

  const account = await withTransaction(async (sql) => {
    const { rows } = await sql.query<StaffRow>(
      `UPDATE users SET status = $2, updated_at = now() WHERE id = $1
       RETURNING id, role, name, surname, email, status, created_at`,
      [userId, status],
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
            : "Account re-activated.",
        before: { status: before.status },
        after: { status },
      },
      sql,
    );

    return row;
  });

  if (status === "inactive") await revokeAllSessions(userId);
  return account;
}
