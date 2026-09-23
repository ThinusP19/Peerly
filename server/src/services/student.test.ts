import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closePool, query } from "../db/pool.ts";
import { createUser, resetDatabase } from "../test/helpers.ts";
import { getRatingOptions } from "./assessments.ts";
import { getStudentAssessments, getStudentEnrolment } from "./student.ts";

/**
 * SR-08 is the point of this file: a student's browser must never receive a
 * rating, a mark, an adjustment factor or a hidden scale value - not merely
 * avoid drawing them.
 */

beforeEach(resetDatabase);
afterAll(closePool);

async function scenario() {
  const lecturer = await createUser({ role: "lecturer" });
  const { rows: cls } = await query<{ id: string }>(
    `INSERT INTO classes (module_code, name, academic_period, lecturer_id)
     VALUES ('CMPG323', 'Development of Information Systems III', '2026 S2', $1) RETURNING id`,
    [lecturer.id],
  );
  const classId = cls[0]!.id;

  const students = [];
  for (let i = 0; i < 3; i += 1) {
    students.push(await createUser({ role: "student", studentNumber: String(41200345 + i) }));
  }

  const { rows: grp } = await query<{ id: string }>(
    "INSERT INTO groups (class_id, group_number) VALUES ($1, 3) RETURNING id",
    [classId],
  );
  const groupId = grp[0]!.id;
  for (const s of students) {
    await query("INSERT INTO group_members (group_id, class_id, student_id) VALUES ($1, $2, $3)", [
      groupId,
      classId,
      s.id,
    ]);
    await query(
      `INSERT INTO enrolments (class_id, student_number, imported_name, imported_surname, match_status, user_id)
       VALUES ($1, $2, 'Test', 'Person', 'matched', $3)`,
      [classId, String(41200345 + students.indexOf(s)), s.id],
    );
  }

  const { rows: asm } = await query<{ id: string }>(
    `INSERT INTO assessments (class_id, name, description, status, opens_at, closes_at)
     VALUES ($1, 'Phase 2', 'Rate your group', 'open', now() - interval '1 day', now() + interval '7 days')
     RETURNING id`,
    [classId],
  );
  await query(
    "INSERT INTO assessment_groups (assessment_id, group_id, class_id) VALUES ($1, $2, $3)",
    [asm[0]!.id, groupId, classId],
  );

  return { classId, groupId, assessmentId: asm[0]!.id, students, lecturer };
}

describe("getStudentAssessments", () => {
  it("returns the assessment with its class and group", async () => {
    const { students } = await scenario();

    const [view] = await getStudentAssessments(students[0]!.id);
    expect(view!.assessment.name).toBe("Phase 2");
    expect(view!.klass.moduleCode).toBe("CMPG323");
    expect(view!.group.groupNumber).toBe(3);
  });

  it("lists the peers to rate, never the student themselves (BR-02)", async () => {
    const { students } = await scenario();

    const [view] = await getStudentAssessments(students[0]!.id);
    expect(view!.members).toHaveLength(2);
    expect(view!.members.map((m) => m.id)).not.toContain(students[0]!.id);
  });

  it("returns nothing for a student in no group", async () => {
    await scenario();
    const outsider = await createUser({ role: "student" });

    expect(await getStudentAssessments(outsider.id)).toEqual([]);
  });

  it("does not leak another group's assessment", async () => {
    const { classId, students, lecturer } = await scenario();
    const otherStudent = await createUser({ role: "student" });
    const { rows: grp } = await query<{ id: string }>(
      "INSERT INTO groups (class_id, group_number) VALUES ($1, 9) RETURNING id",
      [classId],
    );
    await query("INSERT INTO group_members (group_id, class_id, student_id) VALUES ($1, $2, $3)", [
      grp[0]!.id,
      classId,
      otherStudent.id,
    ]);
    expect(lecturer).toBeTruthy();

    // Group 9 is in no assessment, so its member sees none.
    expect(await getStudentAssessments(otherStudent.id)).toEqual([]);
    expect(await getStudentAssessments(students[0]!.id)).toHaveLength(1);
  });

  it("reports the student's own submission state", async () => {
    const { assessmentId, students } = await scenario();
    await query(
      `INSERT INTO submissions (assessment_id, evaluator_id, status, submitted_at)
       VALUES ($1, $2, 'submitted', now())`,
      [assessmentId, students[0]!.id],
    );

    const [mine] = await getStudentAssessments(students[0]!.id);
    const [theirs] = await getStudentAssessments(students[1]!.id);
    expect(mine!.submission?.status).toBe("submitted");
    expect(theirs!.submission).toBeUndefined();
  });

  it("never returns a rating, a mark or a hidden value (SR-08)", async () => {
    const { assessmentId, groupId, students } = await scenario();
    const { rows: options } = await query<{ id: string }>(
      "SELECT id FROM rating_options ORDER BY display_order LIMIT 1",
    );
    const { rows: sub } = await query<{ id: string }>(
      `INSERT INTO submissions (assessment_id, evaluator_id, status, submitted_at)
       VALUES ($1, $2, 'submitted', now()) RETURNING id`,
      [assessmentId, students[1]!.id],
    );
    // Somebody has rated student 0 at the top of the scale.
    await query(
      `INSERT INTO peer_ratings
         (submission_id, assessment_id, group_id, evaluator_id, evaluated_id, rating_option_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [sub[0]!.id, assessmentId, groupId, students[1]!.id, students[0]!.id, options[0]!.id],
    );

    const serialised = JSON.stringify(await getStudentAssessments(students[0]!.id));
    for (const forbidden of [
      "hiddenValue",
      "hidden_value",
      "ratingOptionId",
      "finalMark",
      "adjustmentFactor",
      "baseMark",
    ]) {
      expect(serialised).not.toContain(forbidden);
    }
  });
});

describe("getStudentEnrolment", () => {
  it("finds the row by student number", async () => {
    const { students } = await scenario();

    const enrolment = await getStudentEnrolment(students[0]!.id);
    expect(enrolment).toMatchObject({ matchStatus: "matched", moduleCode: "CMPG323" });
  });

  it("returns an unmatched row, which is what the explanation page needs", async () => {
    const { classId } = await scenario();
    const newcomer = await createUser({ role: "student", studentNumber: "41209999" });
    await query(
      `INSERT INTO enrolments (class_id, student_number, imported_name, imported_surname, match_status, match_note)
       VALUES ($1, '41209999', 'New', 'Comer', 'unmatched', 'No account yet.')`,
      [classId],
    );

    const enrolment = await getStudentEnrolment(newcomer.id);
    expect(enrolment).toMatchObject({ matchStatus: "unmatched", matchNote: "No account yet." });
  });

  it("returns null for a student on no class list", async () => {
    await scenario();
    const outsider = await createUser({ role: "student" });

    expect(await getStudentEnrolment(outsider.id)).toBeNull();
  });
});

describe("getRatingOptions (SR-08)", () => {
  it("gives a lecturer the numeric scale", async () => {
    const options = await getRatingOptions("lecturer");
    expect(options).toHaveLength(9);
    expect(options[0]).toMatchObject({ label: "Excellent", hiddenValue: 100 });
  });

  it("strips the value from a student's copy entirely", async () => {
    const options = await getRatingOptions("student");

    expect(options[0]!.label).toBe("Excellent");
    expect(options[0]).not.toHaveProperty("hiddenValue");
    expect(JSON.stringify(options)).not.toContain("hiddenValue");
  });

  it("keeps the labels and order a student needs to rate anyone", async () => {
    const options = await getRatingOptions("student");
    expect(options.map((o) => o.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(options.at(-1)!.label).toBe("No contribution");
  });
});
