import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closePool, query, withTransaction } from "../db/pool.ts";
import { createUser, resetDatabase } from "../test/helpers.ts";
import { assignAllImportedGroups, assignImportedGroups } from "./imported-groups.ts";

/**
 * Students on an imported class list join their CSV group when they sign up,
 * including after the assessment has opened and classmates have started on it.
 */

beforeEach(resetDatabase);
afterAll(closePool);

const SYSTEM = { name: "System" };

/** A class with two imported groups, one assessment over both, and a registered member each. */
async function scenario() {
  const lecturer = await createUser({ role: "lecturer" });
  const { rows: cls } = await query<{ id: string }>(
    `INSERT INTO classes (module_code, name, academic_period, lecturer_id)
     VALUES ('CMPG321', 'Advanced Databases', '2026 S1', $1) RETURNING id`,
    [lecturer.id],
  );
  const classId = cls[0]!.id;

  const { rows: groups } = await query<{ id: string }>(
    `INSERT INTO groups (class_id, group_number) VALUES ($1, 1), ($1, 2) RETURNING id`,
    [classId],
  );
  const [groupOne, groupTwo] = groups.map((g) => g.id) as [string, string];

  const { rows: asm } = await query<{ id: string }>(
    `INSERT INTO assessments (class_id, name, status, opens_at, closes_at)
     VALUES ($1, 'Peer assessment', 'open', now() - interval '1 day', now() + interval '1 day')
     RETURNING id`,
    [classId],
  );
  const assessmentId = asm[0]!.id;
  await query(
    `INSERT INTO assessment_groups (assessment_id, group_id, class_id)
     VALUES ($1, $2, $4), ($1, $3, $4)`,
    [assessmentId, groupOne, groupTwo, classId],
  );

  // The first member of group one registered before the assessment was set up.
  const early = await enrol(classId, groupOne);
  await query(`INSERT INTO group_members (group_id, class_id, student_id) VALUES ($1, $2, $3)`, [
    groupOne,
    classId,
    early,
  ]);

  return { classId, groupOne, groupTwo, assessmentId, early };
}

/** A student on the class list, assigned to a group, whose account has just matched. */
async function enrol(classId: string, groupId: string): Promise<string> {
  const student = await createUser();
  await query(
    `INSERT INTO enrolments (class_id, student_number, imported_name, imported_surname,
                             match_status, user_id, imported_group_id)
     SELECT $1, u.student_number, u.name, u.surname, 'matched', u.id, $3
       FROM users u WHERE u.id = $2`,
    [classId, student.id, groupId],
  );
  return student.id;
}

async function groupOf(studentId: string): Promise<string | null> {
  const { rows } = await query<{ group_id: string }>(
    "SELECT group_id FROM group_members WHERE student_id = $1",
    [studentId],
  );
  return rows[0]?.group_id ?? null;
}

const assign = (classId: string) =>
  withTransaction((sql) => assignImportedGroups(sql, { classId }, SYSTEM));

describe("assignImportedGroups", () => {
  it("adds a late sign-up to their group while the assessment is open", async () => {
    const s = await scenario();
    const late = await enrol(s.classId, s.groupOne);
    await assign(s.classId);
    expect(await groupOf(late)).toBe(s.groupOne);
  });

  it("still adds them once classmates have saved drafts or submitted", async () => {
    // Regression (2026-10-21): any submission row in the class, even an
    // autosaved draft, froze every group, so most of a class never joined.
    const s = await scenario();
    await query(
      `INSERT INTO submissions (assessment_id, evaluator_id, status, submitted_at)
       VALUES ($1, $2, 'submitted', now())`,
      [s.assessmentId, s.early],
    );
    const late = await enrol(s.classId, s.groupOne);
    await assign(s.classId);
    expect(await groupOf(late)).toBe(s.groupOne);
  });

  it("leaves a group alone once its assessment is closed", async () => {
    const s = await scenario();
    await query(`UPDATE assessments SET status = 'closed', closed_at = now() WHERE id = $1`, [
      s.assessmentId,
    ]);
    const late = await enrol(s.classId, s.groupOne);
    await assign(s.classId);
    expect(await groupOf(late)).toBeNull();
  });

  it("leaves a group alone once its assessment's deadline has passed", async () => {
    const s = await scenario();
    await query(
      `UPDATE assessments SET opens_at = now() - interval '2 days',
                              closes_at = now() - interval '1 minute' WHERE id = $1`,
      [s.assessmentId],
    );
    const late = await enrol(s.classId, s.groupOne);
    await assign(s.classId);
    expect(await groupOf(late)).toBeNull();
  });

  it("does not let a finished assessment on one group block another group", async () => {
    const s = await scenario();
    // A second, closed assessment that only group one took part in.
    const { rows } = await query<{ id: string }>(
      `INSERT INTO assessments (class_id, name, status, opens_at, closes_at, closed_at)
       VALUES ($1, 'Earlier', 'closed', now() - interval '9 days', now() - interval '8 days', now())
       RETURNING id`,
      [s.classId],
    );
    await query(
      `INSERT INTO assessment_groups (assessment_id, group_id, class_id) VALUES ($1, $2, $3)`,
      [rows[0]!.id, s.groupOne, s.classId],
    );
    const late = await enrol(s.classId, s.groupTwo);
    await assign(s.classId);
    expect(await groupOf(late)).toBe(s.groupTwo);
  });

  it("audits every placement (FR-27)", async () => {
    const s = await scenario();
    await enrol(s.classId, s.groupOne);
    await assign(s.classId);
    const { rows } = await query<{ count: string }>(
      `SELECT count(*) FROM audit_entries WHERE event_type = 'groups.confirmed' AND class_id = $1`,
      [s.classId],
    );
    expect(Number(rows[0]!.count)).toBe(1);
  });
});

describe("assignAllImportedGroups", () => {
  it("picks up students an earlier rule left waiting, and is safe to repeat", async () => {
    const s = await scenario();
    const waiting = [await enrol(s.classId, s.groupOne), await enrol(s.classId, s.groupTwo)];

    await assignAllImportedGroups();
    await assignAllImportedGroups();

    expect(await groupOf(waiting[0]!)).toBe(s.groupOne);
    expect(await groupOf(waiting[1]!)).toBe(s.groupTwo);
    const { rows } = await query<{ count: string }>(
      `SELECT count(*) FROM audit_entries WHERE event_type = 'groups.confirmed'`,
    );
    expect(Number(rows[0]!.count)).toBe(2);
  });
});
