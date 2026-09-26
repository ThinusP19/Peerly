import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closePool, query } from "../db/pool.ts";
import type { Role } from "../domain/types.ts";
import { createUser, resetDatabase } from "../test/helpers.ts";
import { createClass, getClass, getClassSummaries, getEnrolments, getGroups } from "./classes.ts";

/**
 * SR-07 above all: a class the caller does not own is refused exactly as one
 * that does not exist. These tests are mostly about who is refused, because
 * that is the half a screen cannot demonstrate.
 */

beforeEach(resetDatabase);
afterAll(closePool);

const asker = (id: string, role: Role = "lecturer") => ({ id, role });

async function aClass(lecturerId: string, moduleCode = "CMPG323") {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO classes (module_code, name, academic_period, lecturer_id)
     VALUES ($1, 'Test Module', '2026 Semester 2', $2) RETURNING id`,
    [moduleCode, lecturerId],
  );
  return rows[0]!.id;
}

async function enrol(
  classId: string,
  studentNumber: string,
  matchStatus: "matched" | "unmatched" | "conflict",
  userId: string | null = null,
) {
  await query(
    `INSERT INTO enrolments (class_id, student_number, imported_name, imported_surname, match_status, user_id)
     VALUES ($1, $2, 'Test', 'Person', $3, $4)`,
    [classId, studentNumber, matchStatus, userId],
  );
}

async function group(classId: string, groupNumber: number, memberIds: string[]) {
  const { rows } = await query<{ id: string }>(
    "INSERT INTO groups (class_id, group_number) VALUES ($1, $2) RETURNING id",
    [classId, groupNumber],
  );
  for (const studentId of memberIds) {
    await query("INSERT INTO group_members (group_id, class_id, student_id) VALUES ($1, $2, $3)", [
      rows[0]!.id,
      classId,
      studentId,
    ]);
  }
  return rows[0]!.id;
}

describe("getClass (SR-07)", () => {
  it("returns a class its owner asks for", async () => {
    const lecturer = await createUser({ role: "lecturer" });
    const id = await aClass(lecturer.id);

    expect(await getClass(id, asker(lecturer.id))).toMatchObject({ moduleCode: "CMPG323" });
  });

  it("refuses another lecturer's class", async () => {
    const owner = await createUser({ role: "lecturer" });
    const other = await createUser({ role: "lecturer" });
    const id = await aClass(owner.id);

    await expect(getClass(id, asker(other.id))).rejects.toMatchObject({ status: 404 });
  });

  it("refuses an administrator, who has no automatic access to class data (SR-16)", async () => {
    const lecturer = await createUser({ role: "lecturer" });
    const admin = await createUser({ role: "admin" });
    const id = await aClass(lecturer.id);

    await expect(getClass(id, asker(admin.id, "admin"))).rejects.toMatchObject({ status: 404 });
  });

  it("refuses a student", async () => {
    const lecturer = await createUser({ role: "lecturer" });
    const student = await createUser({ role: "student" });
    const id = await aClass(lecturer.id);

    await expect(getClass(id, asker(student.id, "student"))).rejects.toMatchObject({ status: 404 });
  });

  it("refuses a class that does not exist identically to one that is not yours", async () => {
    const owner = await createUser({ role: "lecturer" });
    const other = await createUser({ role: "lecturer" });
    const id = await aClass(owner.id);

    const notYours = await getClass(id, asker(other.id)).catch((e: unknown) => e);
    const notReal = await getClass("00000000-0000-0000-0000-000000000000", asker(other.id)).catch(
      (e: unknown) => e,
    );

    expect((notYours as Error).message).toBe((notReal as Error).message);
  });
});

describe("getClassSummaries", () => {
  it("counts the students in groups separately from the matched students", async () => {
    // The dashboard's "per group" average divides this by the group count.
    // Matched students not yet in a group used to be counted too.
    const lecturer = await createUser({ role: "lecturer" });
    const id = await aClass(lecturer.id);
    const members = [];
    for (let i = 0; i < 5; i += 1) {
      const student = await createUser({ role: "student", studentNumber: String(41200345 + i) });
      await enrol(id, String(41200345 + i), "matched", student.id);
      members.push(student.id);
    }
    await group(id, 1, members.slice(0, 2));

    const [summary] = await getClassSummaries(asker(lecturer.id));
    expect(summary).toMatchObject({ matchedCount: 5, groupCount: 1, groupedCount: 2 });
  });

  it("counts the class list by match status", async () => {
    const lecturer = await createUser({ role: "lecturer" });
    const id = await aClass(lecturer.id);
    const student = await createUser({ role: "student", studentNumber: "41200345" });
    await enrol(id, "41200345", "matched", student.id);
    await enrol(id, "41200382", "unmatched");
    await enrol(id, "41200419", "conflict");

    const [summary] = await getClassSummaries(asker(lecturer.id));
    expect(summary).toMatchObject({
      studentCount: 3,
      matchedCount: 1,
      unmatchedCount: 1,
      conflictCount: 1,
    });
  });

  it("counts groups and enrolments independently of each other", async () => {
    // A join across both would multiply the rows and inflate each total - the
    // kind of wrong answer that still looks like a number.
    const lecturer = await createUser({ role: "lecturer" });
    const id = await aClass(lecturer.id);
    const students = [await createUser({ role: "student" }), await createUser({ role: "student" })];
    await enrol(id, "41200345", "unmatched");
    await enrol(id, "41200382", "unmatched");
    await enrol(id, "41200419", "unmatched");
    await group(id, 1, [students[0]!.id]);
    await group(id, 2, [students[1]!.id]);

    const [summary] = await getClassSummaries(asker(lecturer.id));
    expect(summary!.studentCount).toBe(3);
    expect(summary!.groupCount).toBe(2);
  });

  it("shows only the lecturer's own classes", async () => {
    const mine = await createUser({ role: "lecturer" });
    const theirs = await createUser({ role: "lecturer" });
    await aClass(mine.id, "CMPG323");
    await aClass(theirs.id, "CMPG315");

    const summaries = await getClassSummaries(asker(mine.id));
    expect(summaries.map((s) => s.klass.moduleCode)).toEqual(["CMPG323"]);
  });

  it("gives an administrator nothing (SR-16)", async () => {
    const lecturer = await createUser({ role: "lecturer" });
    const admin = await createUser({ role: "admin" });
    await aClass(lecturer.id);

    expect(await getClassSummaries(asker(admin.id, "admin"))).toEqual([]);
  });

  it("highlights the open assessment over a draft", async () => {
    const lecturer = await createUser({ role: "lecturer" });
    const id = await aClass(lecturer.id);
    await query(
      `INSERT INTO assessments (class_id, name, status, opens_at, closes_at)
       VALUES ($1, 'A draft', 'draft', now(), now() + interval '1 day'),
              ($1, 'The open one', 'open', now(), now() + interval '9 days')`,
      [id],
    );

    const [summary] = await getClassSummaries(asker(lecturer.id));
    expect(summary!.activeAssessment?.name).toBe("The open one");
    expect(summary!.assessmentCount).toBe(2);
  });

  it("leaves the highlight out when there is nothing open or drafted", async () => {
    const lecturer = await createUser({ role: "lecturer" });
    const id = await aClass(lecturer.id);
    await query(
      `INSERT INTO assessments (class_id, name, status, opens_at, closes_at)
       VALUES ($1, 'Finished', 'closed', now() - interval '9 days', now() - interval '1 day')`,
      [id],
    );

    const [summary] = await getClassSummaries(asker(lecturer.id));
    expect(summary!.activeAssessment).toBeUndefined();
  });
});

describe("getEnrolments", () => {
  it("joins each matched row to its account and group", async () => {
    const lecturer = await createUser({ role: "lecturer" });
    const id = await aClass(lecturer.id);
    const student = await createUser({ role: "student", studentNumber: "41200345" });
    await enrol(id, "41200345", "matched", student.id);
    await group(id, 4, [student.id]);

    const [row] = await getEnrolments(id, asker(lecturer.id));
    expect(row).toMatchObject({
      studentNumber: "41200345",
      matchStatus: "matched",
      groupNumber: 4,
    });
    expect(row!.account?.email).toBe(student.email);
  });

  it("returns an unmatched row with no account at all", async () => {
    const lecturer = await createUser({ role: "lecturer" });
    const id = await aClass(lecturer.id);
    await enrol(id, "41200382", "unmatched");

    const [row] = await getEnrolments(id, asker(lecturer.id));
    expect(row!.account).toBeUndefined();
    expect(row!.userId).toBeUndefined();
  });

  it("refuses another lecturer's class list", async () => {
    const owner = await createUser({ role: "lecturer" });
    const other = await createUser({ role: "lecturer" });
    const id = await aClass(owner.id);

    await expect(getEnrolments(id, asker(other.id))).rejects.toMatchObject({ status: 404 });
  });
});

describe("getGroups", () => {
  it("returns each group with its members", async () => {
    const lecturer = await createUser({ role: "lecturer" });
    const id = await aClass(lecturer.id);
    const students = [await createUser({ role: "student" }), await createUser({ role: "student" })];
    await group(
      id,
      1,
      students.map((s) => s.id),
    );

    const [record] = await getGroups(id, asker(lecturer.id));
    expect(record!.groupNumber).toBe(1);
    expect(record!.memberStudentIds).toHaveLength(2);
  });

  it("returns an empty group as empty rather than as one containing nothing", async () => {
    const lecturer = await createUser({ role: "lecturer" });
    const id = await aClass(lecturer.id);
    await group(id, 1, []);

    const [record] = await getGroups(id, asker(lecturer.id));
    expect(record!.memberStudentIds).toEqual([]);
  });

  it("refuses another lecturer's groups", async () => {
    const owner = await createUser({ role: "lecturer" });
    const other = await createUser({ role: "lecturer" });
    const id = await aClass(owner.id);

    await expect(getGroups(id, asker(other.id))).rejects.toMatchObject({ status: 404 });
  });
});

describe("createClass (FR-08)", () => {
  // The New class dialog enforces these, but a request can skip the dialog.
  async function lecturer() {
    const account = await createUser({ role: "lecturer" });
    return {
      id: account.id,
      role: "lecturer" as const,
      name: "Anneke",
      surname: "vd Merwe",
      email: account.email,
      studentNumber: null,
      status: "active" as const,
      createdAt: new Date().toISOString(),
    };
  }
  const valid = {
    moduleCode: "cmpg315",
    name: "Software Engineering",
    academicPeriod: "2026 Semester 2",
  };

  it("creates a class, normalising the module code and period", async () => {
    const klass = await createClass(
      { ...valid, academicPeriod: " 2026   Semester 2 " },
      await lecturer(),
    );
    expect(klass).toMatchObject({ moduleCode: "CMPG315", academicPeriod: "2026 Semester 2" });
  });

  it("refuses a module code that is not 4 letters and 3 digits", async () => {
    await expect(
      createClass({ ...valid, moduleCode: "CMPG3155" }, await lecturer()),
    ).rejects.toMatchObject({
      status: 400,
      fields: { moduleCode: expect.stringContaining("4 letters and 3 digits") },
    });
  });

  it("refuses a period that is not a semester", async () => {
    await expect(
      createClass({ ...valid, academicPeriod: "whenever" }, await lecturer()),
    ).rejects.toMatchObject({ status: 400, fields: { academicPeriod: expect.any(String) } });
  });

  it("refuses a name longer than a table row can show", async () => {
    await expect(
      createClass({ ...valid, name: "x".repeat(121) }, await lecturer()),
    ).rejects.toMatchObject({ status: 400, fields: { name: expect.stringContaining("120") } });
  });

  it("treats extra spaces in the period as the same period", async () => {
    const user = await lecturer();
    await createClass(valid, user);
    await expect(
      createClass({ ...valid, academicPeriod: "2026  Semester 2" }, user),
    ).rejects.toMatchObject({ status: 409 });
  });
});
