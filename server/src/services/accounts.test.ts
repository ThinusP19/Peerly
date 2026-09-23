import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { closePool, query } from "../db/pool.ts";
import type { SessionUser } from "../domain/types.ts";
import { createUser, resetDatabase } from "../test/helpers.ts";
import {
  activeAdminCount,
  createStaffAccount,
  listStaffAccounts,
  resendActivationLink,
  setStaffAccountStatus,
  updateStaffAccount,
} from "./accounts.ts";
import { getAuditEntries } from "./audit.ts";
import { createSession, resolveSession } from "./sessions.ts";

vi.mock("../lib/mail.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/mail.ts")>()),
  queue: vi.fn(),
}));

import * as mail from "../lib/mail.ts";

/** FR-01, FR-03, SR-05, SR-16. */

beforeEach(async () => {
  await resetDatabase();
  vi.mocked(mail.queue).mockClear();
});
afterAll(closePool);

async function anAdmin(): Promise<SessionUser> {
  const account = await createUser({ role: "admin", name: "Riaan", surname: "Botha" });
  return {
    id: account.id,
    role: "admin",
    name: "Riaan",
    surname: "Botha",
    email: account.email,
    studentNumber: null,
    status: "active",
    createdAt: new Date().toISOString(),
  };
}

const newLecturer = {
  role: "lecturer" as const,
  name: "Anneke",
  surname: "van der Merwe",
  email: "anneke.vdmerwe@nwu.ac.za",
};

describe("createStaffAccount (FR-01, FR-03)", () => {
  it("creates the account unverified, with no password", async () => {
    const admin = await anAdmin();
    const account = await createStaffAccount(newLecturer, admin);

    expect(account.status).toBe("unverified");
    const { rows } = await query<{ password_hash: string | null }>(
      "SELECT password_hash FROM users WHERE id = $1",
      [account.id],
    );
    // The administrator never knows the password because there is not one yet.
    expect(rows[0]!.password_hash).toBeNull();
  });

  it("emails an activation link", async () => {
    const admin = await anAdmin();
    await createStaffAccount(newLecturer, admin);

    const message = vi
      .mocked(mail.queue)
      .mock.calls.map(([m]) => m)
      .at(-1);
    expect(message?.to).toBe(newLecturer.email);
    expect(message?.text).toContain("/activate?token=");
  });

  it("refuses a personal address", async () => {
    const admin = await anAdmin();

    await expect(
      createStaffAccount({ ...newLecturer, email: "anneke@gmail.com" }, admin),
    ).rejects.toMatchObject({ fields: { email: expect.stringContaining("nwu.ac.za") } });
  });

  it("refuses an address that already has an account", async () => {
    const admin = await anAdmin();
    await createStaffAccount(newLecturer, admin);

    await expect(createStaffAccount(newLecturer, admin)).rejects.toThrow(/already uses/);
  });

  it("sends no email when the account was not created", async () => {
    const admin = await anAdmin();
    await createStaffAccount(newLecturer, admin);
    vi.mocked(mail.queue).mockClear();

    await expect(createStaffAccount(newLecturer, admin)).rejects.toThrow();
    expect(vi.mocked(mail.queue).mock.calls).toHaveLength(0);
  });

  it("records who created it (FR-27)", async () => {
    const admin = await anAdmin();
    await createStaffAccount(newLecturer, admin);

    const [entry] = await getAuditEntries();
    expect(entry).toMatchObject({ eventType: "account.created", actorName: "Riaan Botha" });
  });
});

describe("listStaffAccounts (SR-16)", () => {
  it("lists staff and never students", async () => {
    const admin = await anAdmin();
    await createStaffAccount(newLecturer, admin);
    await createUser({ role: "student", studentNumber: "41200345" });

    const accounts = await listStaffAccounts();
    expect(accounts.map((a) => a.role).sort()).toEqual(["admin", "lecturer"]);
  });

  it("never returns a password hash", async () => {
    const admin = await anAdmin();
    await createStaffAccount(newLecturer, admin);

    expect(JSON.stringify(await listStaffAccounts())).not.toContain("$2");
  });
});

describe("setStaffAccountStatus (FR-01, SR-05)", () => {
  it("deactivates an account", async () => {
    const admin = await anAdmin();
    const target = await createUser({ role: "lecturer" });

    const account = await setStaffAccountStatus(target.id, "inactive", admin);
    expect(account.status).toBe("inactive");
  });

  it("ends every session the account held (SR-05)", async () => {
    const admin = await anAdmin();
    const target = await createUser({ role: "lecturer" });
    const session = await createSession(target.id);

    await setStaffAccountStatus(target.id, "inactive", admin);

    // Revoking must take effect now, not when the token happens to expire.
    expect(await resolveSession(session.token)).toBeNull();
  });

  it("refuses to deactivate the only active administrator", async () => {
    const admin = await anAdmin();

    await expect(setStaffAccountStatus(admin.id, "inactive", admin)).rejects.toThrow(
      /only active administrator/,
    );
  });

  it("allows it once there is a second administrator", async () => {
    const admin = await anAdmin();
    const second = await createUser({ role: "admin" });

    expect(await activeAdminCount()).toBe(2);
    const account = await setStaffAccountStatus(second.id, "inactive", admin);
    expect(account.status).toBe("inactive");
  });

  it("refuses to activate an account that has never been activated by its holder", async () => {
    const admin = await anAdmin();
    const created = await createStaffAccount(newLecturer, admin);

    await expect(setStaffAccountStatus(created.id, "active", admin)).rejects.toThrow(
      /hasn't been activated/,
    );
  });

  it("refuses a student id as though it did not exist (SR-16)", async () => {
    const admin = await anAdmin();
    const student = await createUser({ role: "student", studentNumber: "41200345" });

    await expect(setStaffAccountStatus(student.id, "inactive", admin)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("records the deactivation (FR-27)", async () => {
    const admin = await anAdmin();
    const target = await createUser({ role: "lecturer" });
    await setStaffAccountStatus(target.id, "inactive", admin);

    const [entry] = await getAuditEntries();
    expect(entry!.eventType).toBe("account.deactivated");
    expect(entry!.detail).toContain("all sessions ended");
  });
});

describe("updateStaffAccount", () => {
  it("changes the details", async () => {
    const admin = await anAdmin();
    const target = await createUser({ role: "lecturer", name: "Anneke" });

    const account = await updateStaffAccount(target.id, { name: "Annekie" }, admin);
    expect(account.name).toBe("Annekie");
  });

  it("refuses demoting the last active administrator", async () => {
    // Just as effective at locking everyone out as deactivating them.
    const admin = await anAdmin();

    await expect(updateStaffAccount(admin.id, { role: "lecturer" }, admin)).rejects.toThrow(
      /only active administrator/,
    );
  });

  it("allows a promotion", async () => {
    const admin = await anAdmin();
    const target = await createUser({ role: "lecturer" });

    const account = await updateStaffAccount(target.id, { role: "admin" }, admin);
    expect(account.role).toBe("admin");

    const [entry] = await getAuditEntries();
    expect(entry!.eventType).toBe("account.updated");
    expect(entry!.detail).toContain("lecturer to admin");
  });

  it("refuses a personal address", async () => {
    const admin = await anAdmin();
    const target = await createUser({ role: "lecturer" });

    await expect(
      updateStaffAccount(target.id, { email: "anneke@gmail.com" }, admin),
    ).rejects.toThrow(/institutional address/);
  });
});

/**
 * FR-01, FR-03 - reissuing an activation link.
 *
 * Before this existed, an administrator whose lecturer had lost or outrun their
 * link could only delete the account and make it again, or ask somebody to run
 * SQL against the database.
 */
describe("resendActivationLink", () => {
  const newLecturer = {
    role: "lecturer" as const,
    name: "Thabo",
    surname: "Maseko",
    email: "thabo.maseko@nwu.ac.za",
  };

  it("sends the link again to an account that has never been activated", async () => {
    const admin = await anAdmin();
    const account = await createStaffAccount(newLecturer, admin);
    vi.mocked(mail.queue).mockClear();

    await resendActivationLink(account.id, admin);

    expect(mail.queue).toHaveBeenCalledTimes(1);
    expect(vi.mocked(mail.queue).mock.calls[0]![0].to).toBe(newLecturer.email);
  });

  it("kills the previous link, so only the newest one works", async () => {
    // An older message turning up later must already be useless.
    const admin = await anAdmin();
    const account = await createStaffAccount(newLecturer, admin);

    await resendActivationLink(account.id, admin);

    const { rows } = await query<{ live: string }>(
      `SELECT count(*) AS live FROM auth_tokens
        WHERE user_id = $1 AND purpose = 'activation' AND consumed_at IS NULL`,
      [account.id],
    );
    expect(Number(rows[0]!.live)).toBe(1);
  });

  it("records it on the audit trail (FR-27)", async () => {
    const admin = await anAdmin();
    const account = await createStaffAccount(newLecturer, admin);

    await resendActivationLink(account.id, admin);

    const [entry] = await getAuditEntries({ eventType: "account.activation_resent" });
    expect(entry, "reissuing a link must leave an entry").toBeDefined();
    expect(entry!.objectDescription).toContain(newLecturer.email);
  });

  it("refuses an account that is already active", async () => {
    // Otherwise an administrator could issue themselves a link into somebody
    // else's live account, which SR-16 says the role does not carry.
    const admin = await anAdmin();
    const account = await createStaffAccount(newLecturer, admin);
    await query("UPDATE users SET status = 'active' WHERE id = $1", [account.id]);
    vi.mocked(mail.queue).mockClear();

    await expect(resendActivationLink(account.id, admin)).rejects.toThrow(/already active/);
    expect(mail.queue).not.toHaveBeenCalled();
  });

  it("refuses a deactivated account", async () => {
    const admin = await anAdmin();
    const account = await createStaffAccount(newLecturer, admin);
    await query("UPDATE users SET status = 'inactive' WHERE id = $1", [account.id]);
    vi.mocked(mail.queue).mockClear();

    await expect(resendActivationLink(account.id, admin)).rejects.toThrow(/deactivated/);
    expect(mail.queue).not.toHaveBeenCalled();
  });
});
