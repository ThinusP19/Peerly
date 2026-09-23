import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closePool, query } from "../db/pool.ts";
import type { Role } from "../domain/types.ts";
import { createUser, resetDatabase } from "../test/helpers.ts";
import { getClass, getClassSummaries, getEnrolments, getGroups } from "./classes.ts";

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
