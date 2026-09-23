import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { closePool, query } from "../db/pool.ts";
import type { SessionUser } from "../domain/types.ts";
import * as mail from "../lib/mail.ts";
import { createUser, resetDatabase } from "../test/helpers.ts";
import { parseClassList } from "./class-list.ts";
import { resolveEnrolmentConflict } from "./enrolments.ts";
import { commitImport } from "./import.ts";
import { registerStudent, verifyEmailCode } from "./registration.ts";

/**
 * FR-04: "Run on account activation and again on every class-list commit, so
 * the order of registration and import does not matter."
 *
 * The case these exist for is the ordinary one: a lecturer imports the list at
 * the start of term and students register over the following week. Before this
 * rule ran on activation, every one of them stayed Unmatched for good.
 */
vi.mock("../lib/mail.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/mail.ts")>()),
  queue: vi.fn(),
}));

beforeEach(async () => {
  await resetDatabase();
  vi.mocked(mail.queue).mockClear();
});
afterAll(closePool);

const MAPPING = { studentNumber: "Student Number", name: "Name", surname: "Surname" };
const CSV = `Student Number,Name,Surname
41200345,Lerato,Mokoena
41200382,Thandi,Nkosi`;

const sheet = (csv = CSV) =>
  parseClassList({ originalname: "class.csv", size: csv.length, buffer: Buffer.from(csv) });

async function lecturerWithClass() {
  const account = await createUser({ role: "lecturer", name: "Anneke", surname: "vd Merwe" });
  const user: SessionUser = {
    id: account.id,
    role: "lecturer",
    name: "Anneke",
    surname: "vd Merwe",
    email: account.email,
    studentNumber: null,
    status: "active",
    createdAt: new Date().toISOString(),
  };
  const { rows } = await query<{ id: string }>(
    `INSERT INTO classes (module_code, name, academic_period, lecturer_id)
     VALUES ('CMPG323', 'Test', '2026 S2', $1) RETURNING id`,
    [account.id],
  );
  return { user, classId: rows[0]!.id };
}

const enrolment = async (studentNumber: string) =>
  (
    await query<{
      id: string;
      match_status: string;
      user_id: string | null;
      match_note: string | null;
    }>("SELECT id, match_status, user_id, match_note FROM enrolments WHERE student_number = $1", [
      studentNumber,
    ])
  ).rows[0]!;

/** Registers and verifies through the real flow, reading the code from the e-mail. */
async function registerAndVerify(details: {
  name: string;
  surname: string;
  studentNumber: string;
}) {
  const email = `${details.studentNumber}@mynwu.ac.za`;
  await registerStudent({ ...details, email, password: "a decent passphrase" });
  const message = vi
    .mocked(mail.queue)
    .mock.calls.map(([m]) => m)
    .reverse()
    .find((m) => m.to === email);
  const code = message!.subject.split(" ")[0]!;
  return verifyEmailCode(email, code);
}

describe("FR-04 on activation", () => {
  it("matches a student who registers after the list was imported", async () => {
    const { user, classId } = await lecturerWithClass();
    await commitImport(classId, await sheet(), MAPPING, "extend", user);
    expect((await enrolment("41200345")).match_status).toBe("unmatched");

    const student = await registerAndVerify({
      name: "Lerato",
      surname: "Mokoena",
      studentNumber: "41200345",
    });

    const row = await enrolment("41200345");
    expect(row.match_status).toBe("matched");
    expect(row.user_id).toBe(student!.id);
    expect(row.match_note).toBeNull();
    // Nobody else on the list is touched.
    expect((await enrolment("41200382")).match_status).toBe("unmatched");
  });

  it("does not match on registration alone - the address must be proved first (SR-01)", async () => {
    const { user, classId } = await lecturerWithClass();
    await commitImport(classId, await sheet(), MAPPING, "extend", user);

    await registerStudent({
      name: "Lerato",
      surname: "Mokoena",
      studentNumber: "41200345",
      email: "41200345@mynwu.ac.za",
      password: "a decent passphrase",
    });

    expect((await enrolment("41200345")).match_status).toBe("unmatched");
  });

  it("sets Conflict, not Matched, when the registered name differs from the list", async () => {
    // Exactly the condition an impersonation attempt produces.
    const { user, classId } = await lecturerWithClass();
    await commitImport(classId, await sheet(), MAPPING, "extend", user);

    await registerAndVerify({ name: "Sipho", surname: "Dlamini", studentNumber: "41200345" });

    const row = await enrolment("41200345");
    expect(row.match_status).toBe("conflict");
    expect(row.user_id).toBeNull();
    expect(row.match_note).toMatch(/name differs/);
  });
});

describe("FR-04 on every class-list commit", () => {
  it("matches an active account whose number is on the list", async () => {
    const { user, classId } = await lecturerWithClass();
    const student = await createUser({
      studentNumber: "41200345",
      name: "Lerato",
      surname: "Mokoena",
    });

    await commitImport(classId, await sheet(), MAPPING, "extend", user);

    expect(await enrolment("41200345")).toMatchObject({
      match_status: "matched",
      user_id: student.id,
    });
  });

  it("picks up a student who registered since the last import when the list is imported again", async () => {
    const { user, classId } = await lecturerWithClass();
    await commitImport(classId, await sheet(), MAPPING, "extend", user);
    // Registered and activated some other way since - e.g. before this rule existed.
    const student = await createUser({
      studentNumber: "41200345",
      name: "Lerato",
      surname: "Mokoena",
    });

    await commitImport(classId, await sheet(), MAPPING, "extend", user);

    expect(await enrolment("41200345")).toMatchObject({
      match_status: "matched",
      user_id: student.id,
    });
  });

  it("does not match an unverified account", async () => {
    const { user, classId } = await lecturerWithClass();
    await createUser({
      studentNumber: "41200345",
      name: "Lerato",
      surname: "Mokoena",
      status: "unverified",
    });

    await commitImport(classId, await sheet(), MAPPING, "extend", user);

    expect((await enrolment("41200345")).match_status).toBe("unmatched");
  });

  it("treats case, spacing, hyphens and a second given name as the same person", async () => {
    const { user, classId } = await lecturerWithClass();
    await createUser({ studentNumber: "41200345", name: "LERATO Grace", surname: "mokoena" });
    await createUser({ studentNumber: "41200382", name: "Thandi", surname: "N-kosi" });

    await commitImport(classId, await sheet(), MAPPING, "extend", user);

    expect((await enrolment("41200345")).match_status).toBe("matched");
    expect((await enrolment("41200382")).match_status).toBe("matched");
  });

  it("sets Conflict when the surname differs", async () => {
    const { user, classId } = await lecturerWithClass();
    await createUser({ studentNumber: "41200345", name: "Lerato", surname: "Mokwena" });

    await commitImport(classId, await sheet(), MAPPING, "extend", user);

    expect((await enrolment("41200345")).match_status).toBe("conflict");
  });

  it("does not re-link an entry the lecturer reviewed and left unmatched", async () => {
    const { user, classId } = await lecturerWithClass();
    await createUser({ studentNumber: "41200345", name: "Sipho", surname: "Dlamini" });
    await commitImport(classId, await sheet(), MAPPING, "extend", user);
    const row = await enrolment("41200345");
    expect(row.match_status).toBe("conflict");

    await resolveEnrolmentConflict(row.id, { kind: "leave-unmatched" }, user);
    await commitImport(classId, await sheet(), MAPPING, "extend", user);

    expect((await enrolment("41200345")).match_status).toBe("unmatched");
  });

  it("leaves an existing match alone when the list is imported again", async () => {
    const { user, classId } = await lecturerWithClass();
    const student = await createUser({
      studentNumber: "41200345",
      name: "Lerato",
      surname: "Mokoena",
    });
    await commitImport(classId, await sheet(), MAPPING, "extend", user);

    await commitImport(classId, await sheet(), MAPPING, "extend", user);

    expect(await enrolment("41200345")).toMatchObject({
      match_status: "matched",
      user_id: student.id,
    });
  });
});

describe("resolving a conflict", () => {
  it("refuses to link an account that doesn't hold the entry's student number", async () => {
    const { user, classId } = await lecturerWithClass();
    await createUser({ studentNumber: "41200345", name: "Sipho", surname: "Dlamini" });
    const stranger = await createUser({
      studentNumber: "49999999",
      name: "Lerato",
      surname: "Mokoena",
    });
    await commitImport(classId, await sheet(), MAPPING, "extend", user);
    const row = await enrolment("41200345");

    await expect(
      resolveEnrolmentConflict(row.id, { kind: "link", userId: stranger.id }, user),
    ).rejects.toThrow(/doesn't hold this student number/);
    expect((await enrolment("41200345")).match_status).toBe("conflict");
  });
});
