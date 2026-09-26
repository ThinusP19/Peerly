import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

/* eslint-disable @typescript-eslint/no-explicit-any -- the replies are read as they arrive on the wire. */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../app.ts";
import { closePool, query } from "../db/pool.ts";
import type { Role } from "../domain/types.ts";
import { SESSION_COOKIE } from "../middleware/auth.ts";
import { record } from "../services/audit.ts";
import { createSession } from "../services/sessions.ts";
import { createUser, resetDatabase } from "../test/helpers.ts";

/**
 * The account and audit routes over real HTTP: what the admin portal, or
 * anyone calling the API by hand, actually gets back.
 */

vi.mock("../lib/mail.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/mail.ts")>()),
  queue: vi.fn(),
}));

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  await resetDatabase();
  await new Promise<void>((resolve) => {
    server = createApp().listen(0, "127.0.0.1", () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(
  () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
);
afterAll(closePool);

async function signedIn(role: Role) {
  const user = await createUser({ role });
  const { token } = await createSession(user.id);
  return { ...user, cookie: `${SESSION_COOKIE}=${token}` };
}

async function call(
  method: "GET" | "POST" | "PATCH",
  path: string,
  cookie: string,
  body?: unknown,
): Promise<{ status: number; body: Record<string, any> }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { cookie, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

describe("staff names have a maximum length", () => {
  const long = "x".repeat(101);

  it("refuses a first name or surname over 100 characters on create", async () => {
    const admin = await signedIn("admin");
    const reply = await call("POST", "/api/accounts", admin.cookie, {
      role: "lecturer",
      name: long,
      surname: long,
      email: "someone@nwu.ac.za",
    });

    expect(reply.status).toBe(400);
    expect(reply.body.error.fields.name).toMatch(/100 characters/);
    expect(reply.body.error.fields.surname).toMatch(/100 characters/);
  });

  it("refuses one on edit", async () => {
    const admin = await signedIn("admin");
    const lecturer = await createUser({ role: "lecturer" });

    const reply = await call("PATCH", `/api/accounts/${lecturer.id}`, admin.cookie, {
      name: long,
    });

    expect(reply.status).toBe(400);
    expect(reply.body.error.fields.name).toMatch(/100 characters/);
  });

  it("still accepts exactly 100", async () => {
    const admin = await signedIn("admin");
    const lecturer = await createUser({ role: "lecturer" });

    const reply = await call("PATCH", `/api/accounts/${lecturer.id}`, admin.cookie, {
      name: "x".repeat(100),
    });

    expect(reply.status).toBe(200);
  });
});

describe("an address already in use", () => {
  it("is named beside the email field when an account is edited to it", async () => {
    const admin = await signedIn("admin");
    const taken = await createUser({ role: "lecturer", email: "anneke@nwu.ac.za" });
    const other = await createUser({ role: "lecturer", status: "unverified" });

    const reply = await call("PATCH", `/api/accounts/${other.id}`, admin.cookie, {
      email: "Anneke@nwu.ac.za",
    });

    expect(taken.email).toBe("anneke@nwu.ac.za");
    expect(reply.status).toBe(409);
    expect(reply.body.error.message).toBe("An account already uses that email address.");
    expect(reply.body.error.fields.email).toBe("An account already uses that email address.");
  });

  it("is named beside the email field when an account is created with it", async () => {
    const admin = await signedIn("admin");
    await createUser({ role: "lecturer", email: "anneke@nwu.ac.za" });

    const reply = await call("POST", "/api/accounts", admin.cookie, {
      role: "lecturer",
      name: "Anneke",
      surname: "Again",
      email: "anneke@nwu.ac.za",
    });

    expect(reply.status).toBe(409);
    expect(reply.body.error.fields.email).toBe("An account already uses that email address.");
  });
});

describe("GET /api/audit", () => {
  it("filters on the South African day shown beside each entry", async () => {
    const admin = await signedIn("admin");
    await query(
      `INSERT INTO audit_entries (occurred_at, actor_name, event_type, object_description)
       VALUES ('2026-09-25T23:30:00Z', 'A', 'class.created', 'After midnight')`,
    );

    const on26 = await call(
      "GET",
      "/api/audit?fromDate=2026-09-26&toDate=2026-09-26",
      admin.cookie,
    );
    const on25 = await call(
      "GET",
      "/api/audit?fromDate=2026-09-25&toDate=2026-09-25",
      admin.cookie,
    );

    expect(on26.body.entries.map((e: any) => e.objectDescription)).toEqual(["After midnight"]);
    expect(on25.body.total).toBe(0);
  });

  it("says how many entries there are, and hands out the next page", async () => {
    const admin = await signedIn("admin");
    await query(
      `INSERT INTO audit_entries (occurred_at, actor_name, event_type, object_description)
       SELECT now() - n * interval '1 minute', 'A', 'class.created', 'Entry ' || n
         FROM generate_series(1, 3) AS n`,
    );

    const first = await call("GET", "/api/audit?limit=2", admin.cookie);
    expect(first.body.total).toBe(3);
    expect(first.body.entries).toHaveLength(2);

    const second = await call(
      "GET",
      `/api/audit?limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`,
      admin.cookie,
    );
    expect(second.body.entries.map((e: any) => e.objectDescription)).toEqual(["Entry 3"]);
    expect(second.body.nextCursor).toBeUndefined();
  });

  it("refuses a made-up page marker", async () => {
    const admin = await signedIn("admin");
    const reply = await call("GET", "/api/audit?cursor=nonsense", admin.cookie);
    expect(reply.status).toBe(400);
  });

  it("never widens a lecturer's view past their own classes", async () => {
    const lecturer = await signedIn("lecturer");
    const someoneElse = await createUser({ role: "lecturer" });
    const { rows } = await query<{ id: string }>(
      `INSERT INTO classes (module_code, name, academic_period, lecturer_id)
       VALUES ('CMPG323', 'Mine', '2026 S2', $1), ('CMPG315', 'Theirs', '2026 S2', $2)
       RETURNING id`,
      [lecturer.id, someoneElse.id],
    );
    const [mine, theirs] = rows.map((row) => row.id);
    for (const classId of [mine, theirs]) {
      await record({
        actor: { name: "A" },
        eventType: "groups.confirmed",
        objectDescription: classId!,
        classId,
      });
    }

    const own = await call("GET", `/api/audit?classId=${mine}`, lecturer.cookie);
    const other = await call("GET", `/api/audit?classId=${theirs}`, lecturer.cookie);

    expect(own.body.entries.map((e: any) => e.objectDescription)).toEqual([mine]);
    expect(other.body.total).toBe(0);
  });
});
