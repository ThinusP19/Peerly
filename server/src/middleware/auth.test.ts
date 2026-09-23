import type { AddressInfo } from "node:net";

import cookieParser from "cookie-parser";
import express from "express";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { closePool, query } from "../db/pool.ts";
import { hashSecret } from "../lib/tokens.ts";
import { createSession, revokeSession } from "../services/sessions.ts";
import { createUser, resetDatabase, sessionIdForToken } from "../test/helpers.ts";
import {
  SESSION_COOKIE,
  attachSession,
  clearSessionCookie,
  currentUser,
  requireAuth,
  requireRole,
  setSessionCookie,
} from "./auth.ts";
import { errorHandler } from "./errors.ts";

/**
 * FR-07 and SR-07 over real HTTP.
 *
 * FR-07 says hiding a control is never an access control, so these tests ask
 * the questions a hand-written request would: no cookie, someone else's cookie,
 * a revoked one, and the right cookie for the wrong portal.
 */

/** A minimal app exercising the middleware, without the rest of the API. */
function testApp() {
  const app = express();
  app.use(cookieParser());

  app.get("/open", attachSession, (req, res) => {
    res.json({ signedIn: Boolean(req.auth), role: req.auth?.user.role ?? null });
  });

  app.get("/private", requireAuth, (req, res) => {
    const { user, sessionId } = currentUser(req);
    res.json({ id: user.id, role: user.role, sessionId });
  });

  app.get("/lecturer-only", requireAuth, requireRole("lecturer"), (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/staff-only", requireAuth, requireRole("lecturer", "admin"), (_req, res) => {
    res.json({ ok: true });
  });

  // Deliberately missing requireAuth, to prove requireRole refuses rather than
  // assuming a session that was never resolved.
  app.get("/misconfigured", requireRole("admin"), (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/set-cookie", (_req, res) => {
    setSessionCookie(res, "a-token");
    res.json({ ok: true });
  });

  app.get("/clear-cookie", (_req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.use(errorHandler);
  return app;
}

let baseUrl: string;
let server: ReturnType<ReturnType<typeof testApp>["listen"]>;

beforeEach(async () => {
  await resetDatabase();
  await new Promise<void>((resolve) => {
    // Wrapped rather than passing `resolve` straight in: overload resolution
    // otherwise matches a signature whose callback takes an error argument.
    server = testApp().listen(0, "127.0.0.1", () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

afterAll(closePool);

const get = (path: string, token?: string) =>
  fetch(`${baseUrl}${path}`, {
    headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {},
  });

describe("requireAuth", () => {
  it("refuses a request with no cookie", async () => {
    const response = await get("/private");
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "unauthorized" } });
  });

  it("refuses a cookie that was never issued", async () => {
    const response = await get("/private", "not-a-real-token");
    expect(response.status).toBe(401);
  });

  it("refuses an empty cookie value", async () => {
    const response = await get("/private", "");
    expect(response.status).toBe(401);
  });

  it("admits a live session and tells the handler who it is", async () => {
    const user = await createUser({ role: "lecturer" });
    const { token } = await createSession(user.id);

    const response = await get("/private", token);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: user.id, role: "lecturer" });
  });

  it("clears the cookie when the session is no longer good", async () => {
    const response = await get("/private", "a-stale-token");
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(SESSION_COOKIE);
    // An expiry in the past is what tells the browser to drop it.
    expect(setCookie.toLowerCase()).toMatch(/expires=|max-age=0/);
  });

  it("refuses a revoked session", async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    await revokeSession((await sessionIdForToken(hashSecret(token)))!);

    expect((await get("/private", token)).status).toBe(401);
  });

  it("refuses a session whose account was deactivated", async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    await query("UPDATE users SET status = 'inactive' WHERE id = $1", [user.id]);

    expect((await get("/private", token)).status).toBe(401);
  });

  it("does not disclose why it refused", async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    await revokeSession((await sessionIdForToken(hashSecret(token)))!);

    const revoked = await (await get("/private", token)).json();
    const unknown = await (await get("/private", "never-issued")).json();
    expect(revoked).toEqual(unknown);
  });
});

describe("requireRole", () => {
  it("refuses a student the lecturer portal", async () => {
    const student = await createUser({ role: "student" });
    const { token } = await createSession(student.id);

    const response = await get("/lecturer-only", token);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "forbidden" } });
  });

  it("admits the role it names", async () => {
    const lecturer = await createUser({ role: "lecturer" });
    const { token } = await createSession(lecturer.id);

    expect((await get("/lecturer-only", token)).status).toBe(200);
  });

  it("admits any of several named roles", async () => {
    const admin = await createUser({ role: "admin" });
    const { token } = await createSession(admin.id);

    expect((await get("/staff-only", token)).status).toBe(200);
  });

  it("does not treat an administrator as a superuser (SR-16)", async () => {
    const admin = await createUser({ role: "admin" });
    const { token } = await createSession(admin.id);

    expect((await get("/lecturer-only", token)).status).toBe(403);
  });

  it("refuses rather than assuming when requireAuth was not mounted", async () => {
    const admin = await createUser({ role: "admin" });
    const { token } = await createSession(admin.id);

    const response = await get("/misconfigured", token);
    expect(response.status).toBe(401);
  });

  it("refuses an unauthenticated caller before considering the role", async () => {
    expect((await get("/lecturer-only")).status).toBe(401);
  });
});

describe("attachSession", () => {
  it("lets an anonymous request through", async () => {
    const response = await get("/open");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ signedIn: false, role: null });
  });

  it("resolves the session when there is one", async () => {
    const user = await createUser({ role: "student" });
    const { token } = await createSession(user.id);

    expect(await (await get("/open", token)).json()).toEqual({ signedIn: true, role: "student" });
  });

  it("lets a request with a dead cookie through as anonymous", async () => {
    expect(await (await get("/open", "long-gone")).json()).toEqual({
      signedIn: false,
      role: null,
    });
  });
});

describe("the session cookie", () => {
  it("is HttpOnly, SameSite and scoped to the whole site (CI-08)", async () => {
    const setCookie = (await get("/set-cookie")).headers.get("set-cookie") ?? "";
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
    expect(setCookie).toContain("Path=/");
  });

  it("is not marked Secure in development, or the browser would drop it over http", async () => {
    // env.isProduction is false under NODE_ENV=test.
    const setCookie = (await get("/set-cookie")).headers.get("set-cookie") ?? "";
    expect(setCookie.toLowerCase()).not.toContain("secure");
  });

  it("carries no max-age when cleared, so the browser actually drops it", async () => {
    const setCookie = (await get("/clear-cookie")).headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(SESSION_COOKIE);
    expect(setCookie.toLowerCase()).not.toMatch(/max-age=\d{2,}/);
  });
});
