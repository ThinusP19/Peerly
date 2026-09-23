import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closePool, query } from "../db/pool.ts";
import { createUser, resetDatabase } from "../test/helpers.ts";
import { attemptSignIn, consecutiveFailures, isLockedOut } from "./authentication.ts";

/** FR-05, SR-04 and SR-06. */

const PASSWORD = "a decent passphrase";

beforeEach(resetDatabase);
afterAll(closePool);

const signedInAs = async (email: string, password = PASSWORD, ip?: string) =>
  attemptSignIn(email, password, ip ? { ip } : {});

/** Burns through n failed attempts for an address. */
const failTimes = async (email: string, n: number, ip?: string) => {
  for (let i = 0; i < n; i += 1) await signedInAs(email, "wrong password", ip);
};

describe("attemptSignIn", () => {
  it("admits the right password", async () => {
    const user = await createUser({ role: "lecturer", password: PASSWORD });

    const result = await signedInAs(user.email);
    expect(result).toMatchObject({ id: user.id, role: "lecturer" });
  });

  it("refuses the wrong password", async () => {
    const user = await createUser({ password: PASSWORD });
    expect(await signedInAs(user.email, "not it")).toBeNull();
  });

  it("refuses an address with no account", async () => {
    expect(await signedInAs("nobody@mynwu.ac.za")).toBeNull();
  });

  it("refuses a deactivated account even with the right password", async () => {
    const user = await createUser({ password: PASSWORD, status: "inactive" });
    expect(await signedInAs(user.email)).toBeNull();
  });

  it("refuses an unverified account even with the right password", async () => {
    const user = await createUser({ password: PASSWORD, status: "unverified" });
    expect(await signedInAs(user.email)).toBeNull();
  });

  it("refuses an account that has no password yet", async () => {
    const user = await createUser({ password: null });
    expect(await signedInAs(user.email, "anything")).toBeNull();
  });

  it("is case-insensitive about the address", async () => {
    const user = await createUser({ email: "Anneke@nwu.ac.za", password: PASSWORD });
    expect(await signedInAs("anneke@NWU.ac.za")).not.toBeNull();
  });

  it("gives the same answer for every kind of failure (SR-06)", async () => {
    const inactive = await createUser({ password: PASSWORD, status: "inactive" });
    const active = await createUser({ password: PASSWORD });

    expect(await signedInAs("nobody@mynwu.ac.za")).toBeNull();
    expect(await signedInAs(inactive.email)).toBeNull();
    expect(await signedInAs(active.email, "wrong")).toBeNull();
  });

  it("records every attempt, successful or not", async () => {
    const user = await createUser({ password: PASSWORD });
    await signedInAs(user.email, "wrong");
    await signedInAs(user.email);

    const { rows } = await query<{ succeeded: boolean; user_id: string | null }>(
      "SELECT succeeded, user_id FROM login_attempts ORDER BY attempted_at",
    );
    expect(rows.map((r) => r.succeeded)).toEqual([false, true]);
    expect(rows[1]!.user_id).toBe(user.id);
  });

  it("records an attempt against an unknown address without inventing a user", async () => {
    await signedInAs("nobody@mynwu.ac.za");

    const { rows } = await query<{ email: string; user_id: string | null }>(
      "SELECT email, user_id FROM login_attempts",
    );
    expect(rows[0]).toMatchObject({ email: "nobody@mynwu.ac.za", user_id: null });
  });

  it("never returns the password hash to the caller", async () => {
    const user = await createUser({ password: PASSWORD });
    const result = await signedInAs(user.email);

    expect(JSON.stringify(result)).not.toContain("$2");
  });
});

describe("lock-out (SR-04)", () => {
  it("counts consecutive failures", async () => {
    const user = await createUser({ password: PASSWORD });
    await failTimes(user.email, 3);

    expect(await consecutiveFailures(user.email)).toBe(3);
  });

  it("does not lock before the fifth failure", async () => {
    const user = await createUser({ password: PASSWORD });
    await failTimes(user.email, 4);

    expect(await isLockedOut(user.email)).toBe(false);
    expect(await signedInAs(user.email)).not.toBeNull();
  });

  it("locks on the fifth, and then refuses the right password", async () => {
    const user = await createUser({ password: PASSWORD });
    await failTimes(user.email, 5);

    expect(await isLockedOut(user.email)).toBe(true);
    expect(await signedInAs(user.email)).toBeNull();
  });

  it("clears the count on a success, so failures must be consecutive", async () => {
    const user = await createUser({ password: PASSWORD });
    await failTimes(user.email, 4);
    await signedInAs(user.email);
    await failTimes(user.email, 2);

    expect(await consecutiveFailures(user.email)).toBe(2);
    expect(await isLockedOut(user.email)).toBe(false);
  });

  it("ages out, so a lock is not permanent", async () => {
    const user = await createUser({ password: PASSWORD });
    await failTimes(user.email, 5);
    expect(await isLockedOut(user.email)).toBe(true);

    await query("UPDATE login_attempts SET attempted_at = now() - interval '16 minutes'");

    expect(await isLockedOut(user.email)).toBe(false);
    expect(await signedInAs(user.email)).not.toBeNull();
  });

  it("keeps someone who keeps hammering locked", async () => {
    const user = await createUser({ password: PASSWORD });
    await failTimes(user.email, 5);
    // Each further try is recorded, so the window never empties.
    await failTimes(user.email, 3);

    expect(await consecutiveFailures(user.email)).toBe(8);
    expect(await signedInAs(user.email)).toBeNull();
  });

  it("locks the account, not everyone", async () => {
    const target = await createUser({ password: PASSWORD });
    const bystander = await createUser({ password: PASSWORD });
    await failTimes(target.email, 5);

    expect(await signedInAs(bystander.email)).not.toBeNull();
  });

  it("locks an address that has no account, so probing is no cheaper", async () => {
    await failTimes("nobody@mynwu.ac.za", 5);
    expect(await isLockedOut("nobody@mynwu.ac.za")).toBe(true);
  });

  it("refuses a source address working through a list", async () => {
    const attacker = "196.21.0.99";
    for (let i = 0; i < 30; i += 1) {
      await signedInAs(`victim-${i}@mynwu.ac.za`, "guess", attacker);
    }

    // A real account, the right password, from that address: still refused.
    const user = await createUser({ password: PASSWORD });
    expect(await signedInAs(user.email, PASSWORD, attacker)).toBeNull();
  });

  it("lets the same person in from a different address", async () => {
    const attacker = "196.21.0.99";
    for (let i = 0; i < 30; i += 1) {
      await signedInAs(`victim-${i}@mynwu.ac.za`, "guess", attacker);
    }

    const user = await createUser({ password: PASSWORD });
    expect(await signedInAs(user.email, PASSWORD, "196.21.0.1")).not.toBeNull();
  });
});
