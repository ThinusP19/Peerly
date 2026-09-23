import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closePool, query } from "../db/pool.ts";
import type { Role } from "../domain/types.ts";
import { createUser, resetDatabase } from "../test/helpers.ts";
import { getGroupMarks, getGroupProgress, getPeerRatings } from "./monitoring.ts";

/** FR-18, FR-19, OR-16 - and who is refused. */

beforeEach(resetDatabase);
afterAll(closePool);

const asker = (id: string, role: Role = "lecturer") => ({ id, role });

async function scenario() {
  const lecturer = await createUser({ role: "lecturer" });
  const { rows: cls } = await query<{ id: string }>(
    `INSERT INTO classes (module_code, name, academic_period, lecturer_id)
     VALUES ('CMPG323', 'Test', '2026 S2', $1) RETURNING id`,
    [lecturer.id],
  );
  const classId = cls[0]!.id;

  const students = [];
  for (let i = 0; i < 4; i += 1) students.push(await createUser({ role: "student" }));

  const { rows: grp } = await query<{ id: string }>(
    "INSERT INTO groups (class_id, group_number) VALUES ($1, 1) RETURNING id",
    [classId],
  );
  const groupId = grp[0]!.id;
  for (const s of students) {
    await query("INSERT INTO group_members (group_id, class_id, student_id) VALUES ($1, $2, $3)", [
      groupId,
      classId,
      s.id,
    ]);
  }

  const { rows: asm } = await query<{ id: string }>(
    `INSERT INTO assessments (class_id, name, status, opens_at, closes_at)
     VALUES ($1, 'Phase 2', 'open', now() - interval '1 day', now() + interval '7 days') RETURNING id`,
    [classId],
  );
  await query(
    "INSERT INTO assessment_groups (assessment_id, group_id, class_id) VALUES ($1,$2,$3)",
    [asm[0]!.id, groupId, classId],
  );

  return { lecturer, classId, groupId, assessmentId: asm[0]!.id, students };
}

const submit = (assessmentId: string, evaluatorId: string, status: "draft" | "submitted") =>
  query<{ id: string }>(
    // submitted_at is passed rather than derived in SQL: using $3 as both an
    // enum and a text comparison leaves its type ambiguous, and Postgres
    // refuses rather than guessing.
    `INSERT INTO submissions (assessment_id, evaluator_id, status, submitted_at)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [assessmentId, evaluatorId, status, status === "submitted" ? new Date() : null],
  ).then((r) => r.rows[0]!.id);

describe("getGroupProgress", () => {
  it("lists every member of a participating group", async () => {
    const { assessmentId, lecturer } = await scenario();

    const [row] = await getGroupProgress(assessmentId, asker(lecturer.id));
    expect(row!.members).toHaveLength(4);
    expect(row!.group.groupNumber).toBe(1);
  });

  it("counts a submitted evaluator as submitted", async () => {
    const { assessmentId, lecturer, students } = await scenario();
    await submit(assessmentId, students[0]!.id, "submitted");

    const [row] = await getGroupProgress(assessmentId, asker(lecturer.id));
    expect(row!.submittedIds).toEqual([students[0]!.id]);
    expect(row!.outstanding).toHaveLength(3);
  });

  it("treats a draft as outstanding, not as done", async () => {
    // A monitor that counted drafts would tell a lecturer everyone had finished
    // when nobody had.
    const { assessmentId, lecturer, students } = await scenario();
    await submit(assessmentId, students[0]!.id, "draft");

    const [row] = await getGroupProgress(assessmentId, asker(lecturer.id));
    expect(row!.draftIds).toEqual([students[0]!.id]);
    expect(row!.submittedIds).toEqual([]);
    expect(row!.outstanding.map((p) => p.id)).toContain(students[0]!.id);
  });

  it("names the outstanding students, which is what the reminder needs", async () => {
    const { assessmentId, lecturer, students } = await scenario();
    for (const s of students.slice(0, 3)) await submit(assessmentId, s.id, "submitted");

    const [row] = await getGroupProgress(assessmentId, asker(lecturer.id));
    expect(row!.outstanding).toHaveLength(1);
    expect(row!.outstanding[0]).toMatchObject({ id: students[3]!.id });
    expect(row!.outstanding[0]!.surname).toBeTruthy();
  });

  it("refuses another lecturer", async () => {
    const { assessmentId } = await scenario();
    const other = await createUser({ role: "lecturer" });

    await expect(getGroupProgress(assessmentId, asker(other.id))).rejects.toMatchObject({
      status: 404,
    });
  });

  it("refuses a student (OR-16)", async () => {
    const { assessmentId, students } = await scenario();

    await expect(
      getGroupProgress(assessmentId, asker(students[0]!.id, "student")),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("getPeerRatings", () => {
  it("returns the ratings behind the matrix", async () => {
    const { assessmentId, groupId, lecturer, students } = await scenario();
    const submissionId = await submit(assessmentId, students[0]!.id, "submitted");
    const { rows: options } = await query<{ id: string }>(
      "SELECT id FROM rating_options ORDER BY display_order LIMIT 1",
    );
    await query(
      `INSERT INTO peer_ratings
         (submission_id, assessment_id, group_id, evaluator_id, evaluated_id, rating_option_id, comment)
       VALUES ($1, $2, $3, $4, $5, $6, 'Carried the group.')`,
      [submissionId, assessmentId, groupId, students[0]!.id, students[1]!.id, options[0]!.id],
    );

    const [rating] = await getPeerRatings(assessmentId, asker(lecturer.id));
    expect(rating).toMatchObject({
      evaluatedStudentId: students[1]!.id,
      comment: "Carried the group.",
    });
  });

  it("refuses a student, since a rating option leads to the hidden value (SR-08)", async () => {
    const { assessmentId, students } = await scenario();

    await expect(
      getPeerRatings(assessmentId, asker(students[0]!.id, "student")),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("getGroupMarks", () => {
  it("reports a group with no mark as null rather than omitting it", async () => {
    // The marks screen has to show "No mark yet" for that group, and cannot if
    // the row simply is not there.
    const { assessmentId, lecturer } = await scenario();

    const marks = await getGroupMarks(assessmentId, asker(lecturer.id));
    expect(marks).toHaveLength(1);
    expect(marks[0]!.baseMark).toBeNull();
  });

  it("returns an entered mark as a number, not a string", async () => {
    const { assessmentId, groupId, lecturer } = await scenario();
    await query(
      "INSERT INTO group_marks (assessment_id, group_id, base_mark) VALUES ($1, $2, 72.5)",
      [assessmentId, groupId],
    );

    const marks = await getGroupMarks(assessmentId, asker(lecturer.id));
    expect(marks[0]!.baseMark).toBe(72.5);
  });
});
