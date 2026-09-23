import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

/* eslint-disable @typescript-eslint/no-explicit-any -- see Reply below. */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../app.ts";
import { closePool, query } from "../db/pool.ts";
import * as mail from "../lib/mail.ts";
import { SESSION_COOKIE } from "../middleware/auth.ts";
import { createUser, resetDatabase } from "../test/helpers.ts";

/**
 * The authentication surface over real HTTP, through the real app - CORS,
 * helmet, cookie parsing, validation, rate limiting and the error handler all
 * included. Everything below is what a browser would actually get back.
 */

vi.mock("../lib/mail.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/mail.ts")>()),
  queue: vi.fn(),
}));

const queued = () => vi.mocked(mail.queue).mock.calls.map(([message]) => message);

const lastCodeFor = (address: string) => {
  const message = [...queued()].reverse().find((m) => m.to.toLowerCase() === address.toLowerCase());
  return message?.subject.split(" ")[0] ?? "";
};

const resetTokenFrom = () => {
  for (const message of [...queued()].reverse()) {
    const match = /reset-password\?token=([^\s&]+)/.exec(message.text);
    if (match) return decodeURIComponent(match[1]!);
  }
  return "";
};

const activationTokenFrom = () => {
  for (const message of [...queued()].reverse()) {
    const match = /activate\?token=([^\s&]+)/.exec(message.text);
    if (match) return decodeURIComponent(match[1]!);
  }
  return "";
};

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  await resetDatabase();
  vi.mocked(mail.queue).mockClear();
  await new Promise<void>((resolve) => {
    server = createApp().listen(0, "127.0.0.1", () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(
  () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
);
afterAll(closePool);

interface Reply {
  status: number;
  /**
   * Deliberately loose. These tests assert on what the API actually puts on
   * the wire, so typing it would mean describing each response twice and then
   * trusting the description rather than the thing.
   */
  body: Record<string, any>;
  cookie: string | null;
}

async function call(
  method: "GET" | "POST",
  path: string,
  options: { body?: unknown; cookie?: string | null } = {},
): Promise<Reply> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  const setCookie = response.headers.get("set-cookie");
  return {
    status: response.status,
    body: (await response.json().catch(() => null)) as Record<string, any>,
    // Just the name=value part, which is what a browser would send back.
    cookie: setCookie ? (setCookie.split(";")[0] ?? null) : null,
  };
}

const registration = {
  name: "Thandi",
  surname: "Nkosi",
  email: "41200345@mynwu.ac.za",
  studentNumber: "41200345",
  password: "a decent passphrase",
  noticeAccepted: true,
};

/** Registers, verifies, and returns the session cookie a browser would hold. */
async function registerAndVerify() {
  await call("POST", "/api/auth/register", { body: registration });
  const verified = await call("POST", "/api/auth/verify", {
    body: { email: registration.email, code: lastCodeFor(registration.email) },
  });
  return verified;
}

describe("POST /api/auth/register", () => {
  it("accepts a valid registration", async () => {
    const reply = await call("POST", "/api/auth/register", { body: registration });
    expect(reply.status).toBe(202);
  });

  it("does not sign anyone in - the code has to come first (SR-01)", async () => {
    const reply = await call("POST", "/api/auth/register", { body: registration });
    expect(reply.cookie).toBeNull();
  });

  it("refuses a personal email address", async () => {
    const reply = await call("POST", "/api/auth/register", {
      body: { ...registration, email: "thandi@gmail.com" },
    });
    expect(reply.status).toBe(400);
    expect(reply.body.error.fields.email).toContain("mynwu.ac.za");
  });

  it("refuses a student number that is not 8 digits", async () => {
    const reply = await call("POST", "/api/auth/register", {
      body: { ...registration, studentNumber: "412" },
    });
    expect(reply.body.error.fields.studentNumber).toContain("8 digits");
  });

  it("refuses when the POPIA notice was not acknowledged (OR-13)", async () => {
    const reply = await call("POST", "/api/auth/register", {
      body: { ...registration, noticeAccepted: false },
    });
    expect(reply.status).toBe(400);
    expect(reply.body.error.fields.noticeAccepted).toBeTruthy();
  });

  it("names the field when the email address is taken", async () => {
    await createUser({ email: registration.email, status: "active" });
    const reply = await call("POST", "/api/auth/register", { body: registration });

    expect(reply.status).toBe(400);
    expect(reply.body.error.fields.email).toContain("email address");
  });
});

describe("POST /api/auth/verify", () => {
  it("signs the student in once the code is right", async () => {
    const reply = await registerAndVerify();

    expect(reply.status).toBe(200);
    expect(reply.body.user).toMatchObject({ role: "student", status: "active" });
    expect(reply.cookie).toContain(SESSION_COOKIE);
  });

  it("never returns a password hash", async () => {
    const reply = await registerAndVerify();
    expect(JSON.stringify(reply.body)).not.toContain("$2");
  });

  it("refuses a wrong code without signing anyone in", async () => {
    await call("POST", "/api/auth/register", { body: registration });
    const code = lastCodeFor(registration.email);
    const reply = await call("POST", "/api/auth/verify", {
      body: { email: registration.email, code: code === "000000" ? "111111" : "000000" },
    });

    expect(reply.status).toBe(400);
    expect(reply.cookie).toBeNull();
  });

  it("refuses a code that is not six digits", async () => {
    const reply = await call("POST", "/api/auth/verify", {
      body: { email: registration.email, code: "12" },
    });
    expect(reply.body.error.fields.code).toContain("6 digits");
  });
});

describe("POST /api/auth/login", () => {
  const signIn = (body: unknown) => call("POST", "/api/auth/login", { body });

  it("signs in an active account", async () => {
    const user = await createUser({ role: "lecturer", password: "a decent passphrase" });
    const reply = await signIn({ email: user.email, password: "a decent passphrase" });

    expect(reply.status).toBe(200);
    expect(reply.body.user.role).toBe("lecturer");
    expect(reply.cookie).toContain(SESSION_COOKIE);
  });

  it("gives one message for every kind of failure (FR-05, SR-06)", async () => {
    const active = await createUser({ password: "a decent passphrase" });
    const inactive = await createUser({ password: "a decent passphrase", status: "inactive" });

    const wrongPassword = await signIn({ email: active.email, password: "nope" });
    const noSuchAccount = await signIn({ email: "nobody@mynwu.ac.za", password: "nope" });
    const deactivated = await signIn({ email: inactive.email, password: "a decent passphrase" });

    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body).toEqual(noSuchAccount.body);
    expect(wrongPassword.body).toEqual(deactivated.body);
  });

  it("does not say which field was wrong", async () => {
    const reply = await signIn({ email: "nobody@mynwu.ac.za", password: "nope" });
    expect(reply.body.error.fields).toBeUndefined();
  });

  it("locks out after five failures, then refuses the right password (SR-04)", async () => {
    const user = await createUser({ password: "a decent passphrase" });
    for (let i = 0; i < 5; i += 1) await signIn({ email: user.email, password: "wrong" });

    const reply = await signIn({ email: user.email, password: "a decent passphrase" });
    expect(reply.status).toBe(401);
  });
});

describe("GET /api/auth/me", () => {
  it("returns the signed-in account", async () => {
    const session = await registerAndVerify();
    const reply = await call("GET", "/api/auth/me", { cookie: session.cookie });

    expect(reply.status).toBe(200);
    expect(reply.body.user.email).toBe(registration.email);
  });

  it("refuses without a session (FR-07)", async () => {
    expect((await call("GET", "/api/auth/me")).status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("ends the session for good", async () => {
    const session = await registerAndVerify();

    const out = await call("POST", "/api/auth/logout", { cookie: session.cookie });
    expect(out.status).toBe(200);

    const after = await call("GET", "/api/auth/me", { cookie: session.cookie });
    expect(after.status).toBe(401);
  });

  it("works even with no session at all", async () => {
    expect((await call("POST", "/api/auth/logout")).status).toBe(200);
  });
});

describe("password recovery (FR-06)", () => {
  it("acknowledges identically whether or not the address exists (SR-06)", async () => {
    const user = await createUser({ password: "a decent passphrase" });

    const known = await call("POST", "/api/auth/forgot-password", { body: { email: user.email } });
    const unknown = await call("POST", "/api/auth/forgot-password", {
      body: { email: "nobody@mynwu.ac.za" },
    });

    expect(known.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
  });

  it("resets the password from the emailed link and signs the old one out", async () => {
    const user = await createUser({ password: "a decent passphrase" });
    const session = await call("POST", "/api/auth/login", {
      body: { email: user.email, password: "a decent passphrase" },
    });

    await call("POST", "/api/auth/forgot-password", { body: { email: user.email } });
    const reset = await call("POST", "/api/auth/reset-password", {
      body: { token: resetTokenFrom(), password: "a brand new phrase" },
    });
    expect(reset.status).toBe(200);

    // SR-05: the session opened with the old password is gone.
    expect((await call("GET", "/api/auth/me", { cookie: session.cookie })).status).toBe(401);
    const back = await call("POST", "/api/auth/login", {
      body: { email: user.email, password: "a brand new phrase" },
    });
    expect(back.status).toBe(200);
  });

  it("refuses an expired reset link in plain language", async () => {
    const reply = await call("POST", "/api/auth/reset-password", {
      body: { token: "never-issued", password: "a brand new phrase" },
    });
    expect(reply.status).toBe(400);
    expect(reply.body.error.fields.token).toContain("expired");
  });
});

describe("POST /api/auth/change-password", () => {
  it("changes it and keeps the current session alive", async () => {
    const session = await registerAndVerify();

    const reply = await call("POST", "/api/auth/change-password", {
      cookie: session.cookie,
      body: { current: registration.password, newPassword: "a brand new phrase" },
    });

    expect(reply.status).toBe(200);
    expect((await call("GET", "/api/auth/me", { cookie: session.cookie })).status).toBe(200);
  });

  it("refuses the wrong current password", async () => {
    const session = await registerAndVerify();

    const reply = await call("POST", "/api/auth/change-password", {
      cookie: session.cookie,
      body: { current: "not it", newPassword: "a brand new phrase" },
    });
    expect(reply.body.error.fields.current).toBeTruthy();
  });

  it("refuses without a session", async () => {
    const reply = await call("POST", "/api/auth/change-password", {
      body: { current: "x", newPassword: "a brand new phrase" },
    });
    expect(reply.status).toBe(401);
  });
});

describe("staff activation (FR-01, FR-03)", () => {
  it("describes the link, then sets the password and signs in", async () => {
    const staff = await createUser({ role: "lecturer", status: "unverified", password: null });
    const { sendActivationLink } = await import("../services/recovery.ts");
    await sendActivationLink(staff.id);
    const token = activationTokenFrom();

    const described = await call("GET", `/api/auth/activation?token=${encodeURIComponent(token)}`);
    expect(described.body.account).toMatchObject({ email: staff.email, role: "lecturer" });

    const activated = await call("POST", "/api/auth/activate", {
      body: { token, password: "a decent passphrase" },
    });
    expect(activated.status).toBe(200);
    expect(activated.cookie).toContain(SESSION_COOKIE);
  });

  it("reports an unknown link as no account, rather than as an error", async () => {
    const reply = await call("GET", "/api/auth/activation?token=never-issued");
    expect(reply.status).toBe(200);
    expect(reply.body.account).toBeNull();
  });
});

describe("the error handler", () => {
  it("returns a generic body for an unknown endpoint", async () => {
    const reply = await call("GET", "/api/auth/nope");
    expect(reply.status).toBe(404);
    expect(reply.body.error.message).toBe("No such endpoint.");
  });

  it("never leaks a stack trace or a constraint name (OR-04)", async () => {
    await createUser({ email: registration.email, status: "active" });
    const reply = await call("POST", "/api/auth/register", { body: registration });

    const serialised = JSON.stringify(reply.body);
    expect(serialised).not.toContain("users_email_lower_key");
    expect(serialised).not.toContain("at Object");
  });
});
