import { describe, expect, it } from "vitest";

import { checkPassword, hashPassword, verifyPassword } from "./password.ts";

/**
 * SR-02 and SR-03. These run on the value that actually decides, not on the
 * browser's copy of the rules, so a drift between the two shows up here.
 */

const identity = { email: "41200893@mynwu.ac.za", studentNumber: "41200893" };

describe("checkPassword", () => {
  it("accepts a password that breaks no rule", () => {
    expect(checkPassword("correct horse battery", identity)).toBeNull();
  });

  it("rejects anything shorter than eight characters", () => {
    expect(checkPassword("Sh0rt!", identity)?.id).toBe("length");
  });

  it("counts length in characters, so exactly eight passes", () => {
    expect(checkPassword("abcdefgh", identity)).toBeNull();
  });

  it("rejects a password from the breach list", () => {
    expect(checkPassword("password123", identity)?.id).toBe("common");
  });

  it("matches the breach list regardless of case", () => {
    expect(checkPassword("PassWord123", identity)?.id).toBe("common");
  });

  it("rejects a password containing the student number", () => {
    expect(checkPassword("my41200893pass", identity)?.id).toBe("personal");
  });

  it("rejects a password containing the email local part", () => {
    expect(checkPassword("hello41200893", identity)?.id).toBe("personal");
  });

  it("rejects a password containing the whole email address", () => {
    expect(checkPassword("x41200893@mynwu.ac.za", identity)?.id).toBe("personal");
  });

  it("matches the identity regardless of case", () => {
    expect(checkPassword("HELLO41200893", identity)?.id).toBe("personal");
  });

  it("ignores identity fragments shorter than three characters", () => {
    // A two-character student number would otherwise reject almost everything.
    expect(checkPassword("something long", { studentNumber: "41" })).toBeNull();
  });

  it("applies the length rule before the others", () => {
    // "12345678" is on the breach list and is exactly eight characters, so the
    // ordering only shows on something that breaks both.
    expect(checkPassword("admin", { email: "admin@nwu.ac.za" })?.id).toBe("length");
  });

  it("handles an identity with no email and no student number", () => {
    expect(checkPassword("a reasonable one", {})).toBeNull();
  });
});

describe("hashPassword and verifyPassword", () => {
  it("verifies a password against its own hash", async () => {
    const hash = await hashPassword("correct horse battery");
    await expect(verifyPassword("correct horse battery", hash)).resolves.toBe(true);
  }, 15_000);

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("correct horse battery");
    await expect(verifyPassword("correct horse staple", hash)).resolves.toBe(false);
  }, 15_000);

  it("salts, so the same password never produces the same hash twice", async () => {
    const [first, second] = await Promise.all([hashPassword("same one"), hashPassword("same one")]);
    expect(first).not.toBe(second);
  }, 15_000);

  it("never persists the password in its own hash", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).not.toContain("correct");
  }, 15_000);

  it("returns false for an account that has no password yet", async () => {
    // SR-06: an unactivated account must fail like any other, not differently.
    await expect(verifyPassword("anything", null)).resolves.toBe(false);
  }, 15_000);
});
