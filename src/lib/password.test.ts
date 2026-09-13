import { describe, expect, it } from "vitest";

import { passwordChecks, passwordIsValid, type PasswordCheck } from "./password";

const staff = { email: "anneke.vdmerwe@nwu.ac.za" };
const student = { email: "41200893@mynwu.ac.za", studentNumber: "41200893" };

/** The pass/fail state of each rule, keyed by rule id. */
const results = (password: string, identity: { email?: string; studentNumber?: string }) =>
  Object.fromEntries(
    passwordChecks(password, identity).map((check) => [check.id, check.ok]),
  ) as Record<PasswordCheck["id"], boolean>;

describe("passwordChecks (SR-02)", () => {
  it("requires at least eight characters", () => {
    expect(results("short1!", staff).length).toBe(false);
    expect(results("eight-ch", staff).length).toBe(true);
  });

  it("rejects common passwords regardless of case", () => {
    expect(results("Password1", staff).common).toBe(false);
    expect(results("QWERTY123", student).common).toBe(false);
  });

  it("rejects a password containing the student number", () => {
    expect(results("my41200893pass", student).personal).toBe(false);
  });

  it("rejects a password containing the email address or its local part", () => {
    expect(results("anneke.vdmerwe2026", staff).personal).toBe(false);
    expect(results("anneke.vdmerwe@nwu.ac.za", staff).personal).toBe(false);
  });

  it("meets nothing but the absence of personal data when empty", () => {
    expect(results("", student)).toEqual({ length: false, common: false, personal: false });
  });

  it("accepts a long, unrelated passphrase", () => {
    expect(passwordIsValid("violet-harbour-lamp", student)).toBe(true);
    expect(passwordIsValid("violet-harbour-lamp", staff)).toBe(true);
  });
});
