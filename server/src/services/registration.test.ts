import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { closePool, query } from "../db/pool.ts";
import * as mail from "../lib/mail.ts";
import { verifyPassword } from "../lib/password.ts";
import { createUser, resetDatabase } from "../test/helpers.ts";
import { registerStudent, resendVerificationCode, verifyEmailCode } from "./registration.ts";

/**
 * FR-02, FR-03 and - most of all - SR-06.
 *
 * Only `queue` is replaced, so the real templates still run. That means the
 * code these tests read is the code the student would actually receive: if the
 * template ever stopped including it, these would fail rather than pass against
 * a stub.
 */
vi.mock("../lib/mail.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/mail.ts")>()),
  queue: vi.fn(),
}));

const queued = () => vi.mocked(mail.queue).mock.calls.map(([message]) => message);

/** The template puts the code first in the subject, where a mail client shows it. */
const lastCodeFor = (email: string) => {
  const message = [...queued()].reverse().find((m) => m.to.toLowerCase() === email.toLowerCase());
  const code = message?.subject.split(" ")[0] ?? "";
  return /^\d{6}$/.test(code) ? code : null;
};

const validRegistration = {
  name: "Thandi",
  surname: "Nkosi",
  email: "41200345@mynwu.ac.za",
  studentNumber: "41200345",
  password: "a decent passphrase",
};

beforeEach(async () => {
  await resetDatabase();
  vi.mocked(mail.queue).mockClear();
});
afterAll(closePool);

const accounts = async () =>
  (
    await query<{ id: string; email: string; status: string; student_number: string }>(
      "SELECT id, email, status, student_number FROM users ORDER BY created_at",
    )
  ).rows;

describe("registerStudent", () => {
  it("enforces the password policy on the server, not just in the form (SR-02)", async () => {
    await expect(registerStudent({ ...validRegistration, password: "x" })).rejects.toThrow(
      /at least 8 characters/,
    );
    await expect(
      registerStudent({ ...validRegistration, password: "password123" }),
    ).rejects.toThrow();
    expect(await accounts()).toHaveLength(0);
  });

  it("creates an unverified account", async () => {
    await registerStudent(validRegistration);

    const [account] = await accounts();
    expect(account).toMatchObject({
      email: "41200345@mynwu.ac.za",
      status: "unverified",
      student_number: "41200345",
    });
  });

  it("emails a six-digit code to the address given", async () => {
    await registerStudent(validRegistration);

    expect(lastCodeFor(validRegistration.email)).toMatch(/^\d{6}$/);
  });

  it("stores the password as a hash, never in the clear", async () => {
    await registerStudent(validRegistration);

    const { rows } = await query<{ password_hash: string }>("SELECT password_hash FROM users");
    expect(rows[0]!.password_hash).not.toContain(validRegistration.password);
    await expect(verifyPassword(validRegistration.password, rows[0]!.password_hash)).resolves.toBe(
      true,
    );
  });

  it("stores the code as a hash, never in the clear", async () => {
    await registerStudent(validRegistration);
    const code = lastCodeFor(validRegistration.email)!;

    const { rows } = await query<{ code_hash: string }>(
      "SELECT code_hash FROM email_verification_codes",
    );
    expect(rows[0]!.code_hash).not.toBe(code);
  });

  it("updates the pending registration when someone goes back to fix a typo", async () => {
    await registerStudent(validRegistration);
    await registerStudent({ ...validRegistration, email: "41200345.fixed@mynwu.ac.za" });

    const all = await accounts();
    expect(all).toHaveLength(1);
    expect(all[0]!.email).toBe("41200345.fixed@mynwu.ac.za");
    expect(lastCodeFor("41200345.fixed@mynwu.ac.za")).toMatch(/^\d{6}$/);
  });

  it("supersedes the old code when the registration is updated", async () => {
    await registerStudent(validRegistration);
    const first = lastCodeFor(validRegistration.email)!;
    await registerStudent({ ...validRegistration, name: "Thandiwe" });

    const { rows } = await query<{ live: string }>(
      "SELECT count(*) AS live FROM email_verification_codes WHERE consumed_at IS NULL",
    );
    expect(Number(rows[0]!.live)).toBe(1);
    expect(await verifyEmailCode(validRegistration.email, first)).toBeNull();
  });

  it("names the email address when it is already taken", async () => {
    await createUser({ email: validRegistration.email, status: "active" });

    await expect(registerStudent(validRegistration)).rejects.toMatchObject({
      status: 400,
      fields: { email: expect.stringContaining("email address") },
    });
    expect(await accounts()).toHaveLength(1);
  });

  it("names the student number when it is already taken", async () => {
    await createUser({ studentNumber: validRegistration.studentNumber, status: "active" });

    await expect(registerStudent(validRegistration)).rejects.toMatchObject({
      status: 400,
      fields: { studentNumber: expect.stringContaining("student number") },
    });
    expect(await accounts()).toHaveLength(1);
  });

  it("sends no code when it refuses", async () => {
    await createUser({ email: validRegistration.email, status: "active" });
    await expect(registerStudent(validRegistration)).rejects.toThrow();

    expect(queued()).toHaveLength(0);
  });

  it("reports the email before the student number when both are taken", async () => {
    // The form collects the student number first, so the email is the field the
    // person is looking at when they submit.
    await createUser({
      email: validRegistration.email,
      studentNumber: validRegistration.studentNumber,
      status: "active",
    });

    await expect(registerStudent(validRegistration)).rejects.toMatchObject({
      fields: { email: expect.any(String) },
    });
  });

  it("refuses against a deactivated account rather than resurrecting it", async () => {
    await createUser({ email: validRegistration.email, status: "inactive" });

    await expect(registerStudent(validRegistration)).rejects.toThrow();
    expect((await accounts())[0]!.status).toBe("inactive");
  });

  it("is not blocked by someone else's unfinished registration", async () => {
    // An unverified row is a registration in progress, not an account - nobody
    // has proved they own it, so it must not hold an identifier hostage.
    await registerStudent(validRegistration);
    await expect(
      registerStudent({ ...validRegistration, name: "Someone Else" }),
    ).resolves.toBeUndefined();
  });
});

describe("verifyEmailCode", () => {
  it("activates the account on the right code", async () => {
    await registerStudent(validRegistration);
    const code = lastCodeFor(validRegistration.email)!;

    const user = await verifyEmailCode(validRegistration.email, code);
    expect(user).toMatchObject({ status: "active", role: "student", name: "Thandi" });
  });

  it("refuses the wrong code", async () => {
    await registerStudent(validRegistration);
    const code = lastCodeFor(validRegistration.email)!;
    const wrong = code === "000000" ? "111111" : "000000";

    expect(await verifyEmailCode(validRegistration.email, wrong)).toBeNull();
    expect((await accounts())[0]!.status).toBe("unverified");
  });

  it("counts wrong guesses", async () => {
    await registerStudent(validRegistration);
    await verifyEmailCode(validRegistration.email, "000000");
    await verifyEmailCode(validRegistration.email, "111111");

    const { rows } = await query<{ attempts: number }>(
      "SELECT attempts FROM email_verification_codes WHERE consumed_at IS NULL",
    );
    expect(rows[0]!.attempts).toBe(2);
  });

  it("spends the code after five wrong guesses, even if the sixth is right", async () => {
    await registerStudent(validRegistration);
    const code = lastCodeFor(validRegistration.email)!;
    const wrong = code === "000000" ? "111111" : "000000";

    for (let i = 0; i < 5; i += 1) await verifyEmailCode(validRegistration.email, wrong);

    expect(await verifyEmailCode(validRegistration.email, code)).toBeNull();
    expect((await accounts())[0]!.status).toBe("unverified");
  });

  it("refuses a code that has expired", async () => {
    await registerStudent(validRegistration);
    const code = lastCodeFor(validRegistration.email)!;
    await query("UPDATE email_verification_codes SET expires_at = now() - interval '1 minute'");

    expect(await verifyEmailCode(validRegistration.email, code)).toBeNull();
  });

  it("will not accept the same code twice", async () => {
    await registerStudent(validRegistration);
    const code = lastCodeFor(validRegistration.email)!;

    expect(await verifyEmailCode(validRegistration.email, code)).not.toBeNull();
    expect(await verifyEmailCode(validRegistration.email, code)).toBeNull();
  });

  it("refuses an address that never registered", async () => {
    expect(await verifyEmailCode("nobody@mynwu.ac.za", "123456")).toBeNull();
  });

  it("refuses a code sent to an address that has since been corrected", async () => {
    await registerStudent(validRegistration);
    const original = lastCodeFor(validRegistration.email)!;
    await registerStudent({ ...validRegistration, email: "41200345.fixed@mynwu.ac.za" });

    expect(await verifyEmailCode(validRegistration.email, original)).toBeNull();
  });

  it("is case-insensitive about the address", async () => {
    await registerStudent(validRegistration);
    const code = lastCodeFor(validRegistration.email)!;

    expect(await verifyEmailCode("41200345@MYNWU.AC.ZA", code)).not.toBeNull();
  });
});

describe("resendVerificationCode", () => {
  it("sends a new code that works", async () => {
    await registerStudent(validRegistration);
    await resendVerificationCode(validRegistration.email);

    const code = lastCodeFor(validRegistration.email)!;
    expect(await verifyEmailCode(validRegistration.email, code)).not.toBeNull();
  });

  it("kills the previous code", async () => {
    await registerStudent(validRegistration);
    const first = lastCodeFor(validRegistration.email)!;
    await resendVerificationCode(validRegistration.email);

    expect(await verifyEmailCode(validRegistration.email, first)).toBeNull();
  });

  it("does nothing for an address that never registered", async () => {
    await resendVerificationCode("nobody@mynwu.ac.za");
    expect(queued()).toHaveLength(0);
  });

  it("does nothing for an account that is already active", async () => {
    await createUser({ email: validRegistration.email, status: "active" });
    await resendVerificationCode(validRegistration.email);

    expect(queued()).toHaveLength(0);
  });
});
