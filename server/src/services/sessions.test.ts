import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { env } from "../config/env.ts";
import { closePool, query } from "../db/pool.ts";
import { hashSecret } from "../lib/tokens.ts";
import { ageSession, createUser, resetDatabase, sessionIdForToken } from "../test/helpers.ts";
import {
  createSession,
  purgeExpiredSessions,
  resolveSession,
  revokeAllSessions,
  revokeSession,
} from "./sessions.ts";

/**
 * SR-05 in full. Every branch that ends a session is tested here, because the
 * cost of one of them silently not working is an account that stays signed in
 * after the person was told it would not.
 */

beforeEach(resetDatabase);
afterAll(closePool);

describe("createSession", () => {
  it("issues a token that resolves back to the account", async () => {
    const user = await createUser({ role: "lecturer" });
    const { token } = await createSession(user.id);

    const auth = await resolveSession(token);
    expect(auth?.user.id).toBe(user.id);
    expect(auth?.user.role).toBe("lecturer");
  });

  it("never stores the token in the clear", async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);

    const { rows } = await query<{ token_hash: string }>("SELECT token_hash FROM sessions");
    expect(rows[0]!.token_hash).toBe(hashSecret(token));
    expect(rows[0]!.token_hash).not.toBe(token);
  });

  it("sets the absolute expiry from configuration, not from the idle window", async () => {
    const user = await createUser();
    const { expiresAt } = await createSession(user.id);

    const expected = Date.now() + env.session.absoluteMinutes * 60_000;
    expect(Math.abs(expiresAt.getTime() - expected)).toBeLessThan(5_000);
  });

  it("records where the sign-in came from", async () => {
    const user = await createUser();
    await createSession(user.id, { ip: "196.21.0.1", userAgent: "Firefox" });

    const { rows } = await query<{ ip: string; user_agent: string }>(
      "SELECT ip, user_agent FROM sessions",
    );
    expect(rows[0]!.ip).toBe("196.21.0.1");
    expect(rows[0]!.user_agent).toBe("Firefox");
  });

  it("lets one account hold several sessions at once", async () => {
    const user = await createUser();
    const a = await createSession(user.id);
    const b = await createSession(user.id);

    expect(a.token).not.toBe(b.token);
    expect(await resolveSession(a.token)).not.toBeNull();
    expect(await resolveSession(b.token)).not.toBeNull();
  });
});

describe("resolveSession", () => {
  it("refuses a token that was never issued", async () => {
    expect(await resolveSession("not a real token")).toBeNull();
  });

  it("refuses an empty token", async () => {
    expect(await resolveSession("")).toBeNull();
  });

  it("refuses a session past its absolute expiry", async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    const sessionId = await sessionIdForToken(hashSecret(token));

    await ageSession(sessionId!, { absoluteMinutes: 1 });

    expect(await resolveSession(token)).toBeNull();
  });

  it("refuses a session that has been idle too long", async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    const sessionId = await sessionIdForToken(hashSecret(token));

    await ageSession(sessionId!, { idleMinutes: env.session.idleMinutes + 1 });

    expect(await resolveSession(token)).toBeNull();
  });

  it("accepts a session just inside the idle window", async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    const sessionId = await sessionIdForToken(hashSecret(token));

    await ageSession(sessionId!, { idleMinutes: env.session.idleMinutes - 1 });

    expect(await resolveSession(token)).not.toBeNull();
  });

  it("slides the idle window forward as the person works", async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    const sessionId = await sessionIdForToken(hashSecret(token));

    await ageSession(sessionId!, { idleMinutes: 5 });
    await resolveSession(token);

    const { rows } = await query<{ stale_seconds: number }>(
      "SELECT EXTRACT(EPOCH FROM (now() - last_seen_at)) AS stale_seconds FROM sessions WHERE id = $1",
      [sessionId],
    );
    expect(Number(rows[0]!.stale_seconds)).toBeLessThan(5);
  });

  it("does not extend the absolute expiry when it slides the idle window", async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    const sessionId = await sessionIdForToken(hashSecret(token));

    const before = await query<{ expires_at: Date }>(
      "SELECT expires_at FROM sessions WHERE id = $1",
      [sessionId],
    );
    await ageSession(sessionId!, { idleMinutes: 5 });
    await resolveSession(token);
    const after = await query<{ expires_at: Date }>(
      "SELECT expires_at FROM sessions WHERE id = $1",
      [sessionId],
    );

    expect(after.rows[0]!.expires_at.getTime()).toBe(before.rows[0]!.expires_at.getTime());
  });

  it("refuses a session belonging to a deactivated account", async () => {
    const user = await createUser({ status: "active" });
    const { token } = await createSession(user.id);

    await query("UPDATE users SET status = 'inactive' WHERE id = $1", [user.id]);

    expect(await resolveSession(token)).toBeNull();
  });

  it("refuses a session belonging to an unverified account", async () => {
    const user = await createUser({ status: "active" });
    const { token } = await createSession(user.id);

    await query("UPDATE users SET status = 'unverified' WHERE id = $1", [user.id]);

    expect(await resolveSession(token)).toBeNull();
  });
});

describe("revokeSession", () => {
  it("ends the session immediately", async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    const sessionId = await sessionIdForToken(hashSecret(token));

    await revokeSession(sessionId!);

    expect(await resolveSession(token)).toBeNull();
  });

  it("leaves the account's other sessions alone", async () => {
    const user = await createUser();
    const a = await createSession(user.id);
    const b = await createSession(user.id);

    await revokeSession((await sessionIdForToken(hashSecret(a.token)))!);

    expect(await resolveSession(a.token)).toBeNull();
    expect(await resolveSession(b.token)).not.toBeNull();
  });
});

describe("revokeAllSessions", () => {
  it("ends every session the account holds", async () => {
    const user = await createUser();
    const a = await createSession(user.id);
    const b = await createSession(user.id);

    expect(await revokeAllSessions(user.id)).toBe(2);
    expect(await resolveSession(a.token)).toBeNull();
    expect(await resolveSession(b.token)).toBeNull();
  });

  it("can spare the session that asked, so changing your own password does not sign you out", async () => {
    const user = await createUser();
    const mine = await createSession(user.id);
    const other = await createSession(user.id);
    const mineId = await sessionIdForToken(hashSecret(mine.token));

    expect(await revokeAllSessions(user.id, mineId!)).toBe(1);
    expect(await resolveSession(mine.token)).not.toBeNull();
    expect(await resolveSession(other.token)).toBeNull();
  });

  it("does not touch another account's sessions", async () => {
    const mine = await createUser();
    const theirs = await createUser();
    const theirToken = await createSession(theirs.id);
    await createSession(mine.id);

    await revokeAllSessions(mine.id);

    expect(await resolveSession(theirToken.token)).not.toBeNull();
  });
});

describe("purgeExpiredSessions", () => {
  it("leaves a live session in place", async () => {
    const user = await createUser();
    await createSession(user.id);

    expect(await purgeExpiredSessions()).toBe(0);
  });

  it("clears one that expired long ago", async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    const sessionId = await sessionIdForToken(hashSecret(token));

    await ageSession(sessionId!, { absoluteMinutes: 60 * 24 * 8 });

    expect(await purgeExpiredSessions()).toBe(1);
    expect(await sessionIdForToken(hashSecret(token))).toBeNull();
  });
});
