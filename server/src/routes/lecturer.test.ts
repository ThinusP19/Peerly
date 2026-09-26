import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

/* eslint-disable @typescript-eslint/no-explicit-any -- replies are asserted on as they arrive. */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app.ts";
import { closePool, query } from "../db/pool.ts";
import { SESSION_COOKIE } from "../middleware/auth.ts";
import { createSession } from "../services/sessions.ts";
import { createUser, resetDatabase } from "../test/helpers.ts";

/**
 * The lecturer's class and assessment routes over real HTTP. The rules checked
 * here live in the route's validation, so calling the service directly would
 * step straight past them - and the API can be called without the web app.
 */

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

async function call(
  method: "GET" | "POST" | "PATCH",
  path: string,
  cookie: string,
  body?: unknown,
): Promise<{ status: number; body: Record<string, any> }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      cookie,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY).toISOString();

/** A signed-in lecturer who owns one class with one group. */
async function lecturer() {
  const account = await createUser({ role: "lecturer" });
  const { token } = await createSession(account.id);
  const cookie = `${SESSION_COOKIE}=${token}`;

  const { rows: cls } = await query<{ id: string }>(
    `INSERT INTO classes (module_code, name, academic_period, lecturer_id)
     VALUES ('CMPG323', 'Test', '2026 S2', $1) RETURNING id`,
    [account.id],
  );
  const classId = cls[0]!.id;
  const { rows: grp } = await query<{ id: string }>(
    "INSERT INTO groups (class_id, group_number) VALUES ($1, 1) RETURNING id",
    [classId],
  );
  return { cookie, classId, groupId: grp[0]!.id };
}

const newAssessment = (
  classId: string,
  groupId: string,
  overrides: Record<string, unknown> = {},
) => ({
  classId,
  name: "Phase 2",
  groupIds: [groupId],
  opensAt: daysFromNow(1),
  closesAt: daysFromNow(14),
  ...overrides,
});

describe("POST /api/assessments", () => {
  it("refuses a name longer than 120 characters, naming the field", async () => {
    const { cookie, classId, groupId } = await lecturer();

    const reply = await call(
      "POST",
      "/api/assessments",
      cookie,
      newAssessment(classId, groupId, { name: "N".repeat(121) }),
    );

    expect(reply.status).toBe(400);
    expect(reply.body.error.fields.name).toMatch(/120 characters/);
  });

  it("accepts a name of exactly 120 characters", async () => {
    const { cookie, classId, groupId } = await lecturer();

    const reply = await call(
      "POST",
      "/api/assessments",
      cookie,
      newAssessment(classId, groupId, { name: "N".repeat(120) }),
    );

    expect(reply.status).toBe(201);
  });

  it("refuses a maximum mark with more than two decimals, rather than rounding it", async () => {
    // max_mark is numeric(6,2): 99.999 used to be stored as 100.00 without a word.
    const { cookie, classId, groupId } = await lecturer();

    const reply = await call(
      "POST",
      "/api/assessments",
      cookie,
      newAssessment(classId, groupId, { maxMark: 99.999 }),
    );

    expect(reply.status).toBe(400);
    expect(reply.body.error.fields.maxMark).toMatch(/two decimal places/);
  });

  it("still accepts a maximum mark with two decimals", async () => {
    const { cookie, classId, groupId } = await lecturer();

    const reply = await call(
      "POST",
      "/api/assessments",
      cookie,
      newAssessment(classId, groupId, { maxMark: 72.35 }),
    );

    expect(reply.status).toBe(201);
    expect(reply.body.assessment.maxMark).toBe(72.35);
  });
});

describe("POST /api/assessments/:id/status", () => {
  it("opens an assessment whose closing time has passed only with a new one", async () => {
    const { cookie, classId, groupId } = await lecturer();
    const created = await call(
      "POST",
      "/api/assessments",
      cookie,
      newAssessment(classId, groupId, { opensAt: daysFromNow(-3), closesAt: daysFromNow(-1) }),
    );
    const id = created.body.assessment.id as string;

    const refused = await call("POST", `/api/assessments/${id}/status`, cookie, {
      transition: "open",
    });
    expect(refused.status).toBe(400);
    expect(refused.body.error.fields.closesAt).toMatch(/already passed/);

    const later = daysFromNow(3);
    const opened = await call("POST", `/api/assessments/${id}/status`, cookie, {
      transition: "open",
      closesAt: later,
    });
    expect(opened.status).toBe(200);
    expect(opened.body.assessment).toMatchObject({ status: "open", closesAt: later });
  });
});

describe("PATCH /api/assessments/:id", () => {
  it("saves a rename of an open assessment that sends its unchanged groups back", async () => {
    const { cookie, classId, groupId } = await lecturer();
    const created = await call("POST", "/api/assessments", cookie, newAssessment(classId, groupId));
    const id = created.body.assessment.id as string;
    await call("POST", `/api/assessments/${id}/status`, cookie, { transition: "open" });

    const reply = await call("PATCH", `/api/assessments/${id}`, cookie, {
      name: "Phase 2 - final",
      groupIds: [groupId],
    });

    expect(reply.status).toBe(200);
    expect(reply.body.assessment.name).toBe("Phase 2 - final");
  });
});

describe("POST /api/classes", () => {
  it("refuses a class name longer than 120 characters", async () => {
    const { cookie } = await lecturer();

    const reply = await call("POST", "/api/classes", cookie, {
      moduleCode: "CMPG999",
      name: "A".repeat(121),
      academicPeriod: "2026 S2",
    });

    expect(reply.status).toBe(400);
    expect(reply.body.error.fields.name).toMatch(/120 characters/);
  });
});

describe("POST /api/classes/enrolments/:id/resolve", () => {
  it("accepts the Leave unmatched decision exactly as the web app sends it (FR-04)", async () => {
    const { cookie, classId } = await lecturer();
    await createUser({ studentNumber: "41200826", name: "Werner", surname: "Steyn" });
    const { rows } = await query<{ id: string }>(
      `INSERT INTO enrolments (class_id, student_number, imported_name, imported_surname, match_status)
       VALUES ($1, '41200826', 'Willem', 'Steyn', 'conflict') RETURNING id`,
      [classId],
    );

    const reply = await call("POST", `/api/classes/enrolments/${rows[0]!.id}/resolve`, cookie, {
      kind: "leave-unmatched",
    });

    expect(reply.status).toBe(200);
    const { rows: after } = await query<{ match_status: string }>(
      "SELECT match_status FROM enrolments WHERE id = $1",
      [rows[0]!.id],
    );
    expect(after[0]!.match_status).toBe("unmatched");
  });
});
