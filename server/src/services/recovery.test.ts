import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { closePool, query } from "../db/pool.ts";
import * as mail from "../lib/mail.ts";
import { verifyPassword } from "../lib/password.ts";
import { createUser, resetDatabase } from "../test/helpers.ts";
import { attemptSignIn } from "./authentication.ts";
import {
  activateWithToken,
  changePassword,
  describeActivationToken,
  requestPasswordReset,
  resetPassword,
  sendActivationLink,
} from "./recovery.ts";
import { createSession, resolveSession } from "./sessions.ts";

vi.mock("../lib/mail.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/mail.ts")>()),
  queue: vi.fn(),
}));

const queued = () => vi.mocked(mail.queue).mock.calls.map(([message]) => message);

/** The templates put the token in the link; pull it back out the way a click would. */
const tokenFrom = (pattern: RegExp) => {
  for (const message of [...queued()].reverse()) {
    const match = pattern.exec(message.text);
    if (match) return decodeURIComponent(match[1]!);
  }
  return null;
};

const resetToken = () => tokenFrom(/reset-password\?token=([^\s&]+)/);
const activationToken = () => tokenFrom(/activate\?token=([^\s&]+)/);

const PASSWORD = "a decent passphrase";
const NEXT = "another decent phrase";

beforeEach(async () => {
  await resetDatabase();
  vi.mocked(mail.queue).mockClear();
});
afterAll(closePool);

describe("requestPasswordReset", () => {
  it("emails a working link to an active account", async () => {
    const user = await createUser({ password: PASSWORD });
    await requestPasswordReset(user.email);

    expect(resetToken()).toBeTruthy();
  });

  it("says nothing and sends nothing for an unknown address (SR-06)", async () => {
    await expect(requestPasswordReset("nobody@mynwu.ac.za")).resolves.toBeUndefined();
    expect(queued()).toHaveLength(0);
  });

  it("sends nothing to an unverified account, so a reset cannot stand in for verifying", async () => {
    const user = await createUser({ status: "unverified" });
    await requestPasswordReset(user.email);

    expect(queued()).toHaveLength(0);
  });

  it("sends nothing to a deactivated account", async () => {
    const user = await createUser({ status: "inactive" });
    await requestPasswordReset(user.email);

    expect(queued()).toHaveLength(0);
  });

  it("retires the previous link when a second is requested", async () => {
    const user = await createUser({ password: PASSWORD });
    await requestPasswordReset(user.email);
    const first = resetToken()!;
    await requestPasswordReset(user.email);

    expect(await resetPassword(first, NEXT)).toBe(false);
  });
});

describe("resetPassword", () => {
  it("sets the new password", async () => {
    const user = await createUser({ password: PASSWORD });
    await requestPasswordReset(user.email);

    expect(await resetPassword(resetToken()!, NEXT)).toBe(true);
    expect(await attemptSignIn(user.email, NEXT)).not.toBeNull();
    expect(await attemptSignIn(user.email, PASSWORD)).toBeNull();
  });

  it("refuses an unknown token", async () => {
    expect(await resetPassword("never-issued", NEXT)).toBe(false);
  });

  it("refuses a token that has already been used", async () => {
    const user = await createUser({ password: PASSWORD });
    await requestPasswordReset(user.email);
    const token = resetToken()!;

    expect(await resetPassword(token, NEXT)).toBe(true);
    expect(await resetPassword(token, "a third passphrase")).toBe(false);
  });

  it("refuses an expired token", async () => {
    const user = await createUser({ password: PASSWORD });
    await requestPasswordReset(user.email);
    await query("UPDATE auth_tokens SET expires_at = now() - interval '1 minute'");

    expect(await resetPassword(resetToken()!, NEXT)).toBe(false);
  });

  it("applies the password policy (SR-02)", async () => {
    const user = await createUser({ password: PASSWORD });
    await requestPasswordReset(user.email);

    await expect(resetPassword(resetToken()!, "short")).rejects.toMatchObject({
      fields: { password: expect.any(String) },
    });
  });

  it("ends every existing session (SR-05)", async () => {
    const user = await createUser({ password: PASSWORD });
    const open = await createSession(user.id);
    await requestPasswordReset(user.email);

    await resetPassword(resetToken()!, NEXT);

    expect(await resolveSession(open.token)).toBeNull();
  });
});

describe("changePassword", () => {
  it("changes it when the current password is right", async () => {
    const user = await createUser({ password: PASSWORD });
    await changePassword(user.id, PASSWORD, NEXT);

    expect(await attemptSignIn(user.email, NEXT)).not.toBeNull();
  });

  it("refuses the wrong current password", async () => {
    const user = await createUser({ password: PASSWORD });

    await expect(changePassword(user.id, "not it", NEXT)).rejects.toMatchObject({
      fields: { current: expect.any(String) },
    });
    expect(await attemptSignIn(user.email, PASSWORD)).not.toBeNull();
  });

  it("refuses reusing the same password", async () => {
    const user = await createUser({ password: PASSWORD });

    await expect(changePassword(user.id, PASSWORD, PASSWORD)).rejects.toMatchObject({
      fields: { newPassword: expect.any(String) },
    });
  });

  it("applies the password policy to the new one", async () => {
    const user = await createUser({ password: PASSWORD });

    await expect(changePassword(user.id, PASSWORD, "short")).rejects.toMatchObject({
      fields: { newPassword: expect.any(String) },
    });
  });

  it("will not let a password contain the student number", async () => {
    const user = await createUser({
      role: "student",
      studentNumber: "41200345",
      password: PASSWORD,
    });

    await expect(changePassword(user.id, PASSWORD, "my41200345phrase")).rejects.toMatchObject({
      fields: { newPassword: expect.any(String) },
    });
  });

  it("ends the account's other sessions but keeps the one that asked (SR-05)", async () => {
    const user = await createUser({ password: PASSWORD });
    const mine = await createSession(user.id);
    const elsewhere = await createSession(user.id);
    const auth = await resolveSession(mine.token);

    await changePassword(user.id, PASSWORD, NEXT, auth!.sessionId);

    expect(await resolveSession(mine.token)).not.toBeNull();
    expect(await resolveSession(elsewhere.token)).toBeNull();
  });

  it("stores a hash, never the password", async () => {
    const user = await createUser({ password: PASSWORD });
    await changePassword(user.id, PASSWORD, NEXT);

    const { rows } = await query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = $1",
      [user.id],
    );
    expect(rows[0]!.password_hash).not.toContain(NEXT);
    await expect(verifyPassword(NEXT, rows[0]!.password_hash)).resolves.toBe(true);
  });
});

describe("staff activation (FR-01, FR-03)", () => {
  const newStaff = () => createUser({ role: "lecturer", status: "unverified", password: null });

  it("emails a link that describes the account it belongs to", async () => {
    const user = await newStaff();
    await sendActivationLink(user.id);

    expect(await describeActivationToken(activationToken()!)).toMatchObject({
      email: user.email,
      role: "lecturer",
    });
  });

  it("describes an unknown token as nothing, which is the expired-link state", async () => {
    expect(await describeActivationToken("never-issued")).toBeNull();
  });

  it("treats the link of a deactivated account as unusable, without spending it", async () => {
    // Found in the 26 September re-test: the form was offered, the password
    // refused as "expired", and the refusal burned the link - so it no longer
    // worked once the administrator re-activated the account.
    const user = await newStaff();
    await sendActivationLink(user.id);
    const token = activationToken()!;
    await query("UPDATE users SET status = 'inactive' WHERE id = $1", [user.id]);

    expect(await describeActivationToken(token)).toBeNull();
    expect(await activateWithToken(token, PASSWORD)).toBeNull();

    await query("UPDATE users SET status = 'unverified' WHERE id = $1", [user.id]);
    expect(await activateWithToken(token, PASSWORD)).toMatchObject({ status: "active" });
  });

  it("sets the first password and activates the account", async () => {
    const user = await newStaff();
    await sendActivationLink(user.id);

    const activated = await activateWithToken(activationToken()!, PASSWORD);
    expect(activated).toMatchObject({ status: "active", role: "lecturer" });
    expect(await attemptSignIn(user.email, PASSWORD)).not.toBeNull();
  });

  it("will not accept the same link twice", async () => {
    const user = await newStaff();
    await sendActivationLink(user.id);
    const token = activationToken()!;

    expect(await activateWithToken(token, PASSWORD)).not.toBeNull();
    expect(await activateWithToken(token, NEXT)).toBeNull();
  });

  it("refuses an expired link", async () => {
    const user = await newStaff();
    await sendActivationLink(user.id);
    await query("UPDATE auth_tokens SET expires_at = now() - interval '1 minute'");

    expect(await activateWithToken(activationToken()!, PASSWORD)).toBeNull();
  });

  it("applies the password policy", async () => {
    const user = await newStaff();
    await sendActivationLink(user.id);

    await expect(activateWithToken(activationToken()!, "short")).rejects.toMatchObject({
      fields: { password: expect.any(String) },
    });
  });

  it("will not reactivate an account an administrator deactivated", async () => {
    const user = await newStaff();
    await sendActivationLink(user.id);
    const token = activationToken()!;
    await query("UPDATE users SET status = 'inactive' WHERE id = $1", [user.id]);

    expect(await activateWithToken(token, PASSWORD)).toBeNull();
  });
});
