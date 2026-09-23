import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closePool, query } from "../db/pool.ts";
import type { Role } from "../domain/types.ts";
import { createUser, resetDatabase } from "../test/helpers.ts";
import { getAssessment, getAssessmentRows } from "./assessments.ts";

beforeEach(resetDatabase);
afterAll(closePool);

const asker = (id: string, role: Role = "lecturer") => ({ id, role });

async function scenario(groupCount = 2, membersPerGroup = 3) {
  const lecturer = await createUser({ role: "lecturer" });
  const { rows: cls } = await query<{ id: string }>(
    `INSERT INTO classes (module_code, name, academic_period, lecturer_id)
     VALUES ('CMPG323', 'Test', '2026 S2', $1) RETURNING id`,
    [lecturer.id],
  );
  const classId = cls[0]!.id;

  const { rows: asm } = await query<{ id: string }>(
    `INSERT INTO assessments (class_id, name, status, opens_at, closes_at)
     VALUES ($1, 'Phase 2', 'open', now() - interval '1 day', now() + interval '7 days')
     RETURNING id`,
    [classId],
  );
  const assessmentId = asm[0]!.id;

  const students: string[] = [];
  for (let g = 1; g <= groupCount; g += 1) {
    const { rows: grp } = await query<{ id: string }>(
      "INSERT INTO groups (class_id, group_number) VALUES ($1, $2) RETURNING id",
      [classId, g],
    );
    await query(
      "INSERT INTO assessment_groups (assessment_id, group_id, class_id) VALUES ($1, $2, $3)",
      [assessmentId, grp[0]!.id, classId],
    );
    for (let m = 0; m < membersPerGroup; m += 1) {
      const student = await createUser({ role: "student" });
      await query(
        "INSERT INTO group_members (group_id, class_id, student_id) VALUES ($1, $2, $3)",
        [grp[0]!.id, classId, student.id],
      );
      students.push(student.id);
    }
  }

  return { lecturer, classId, assessmentId, students };
}

const submit = (assessmentId: string, evaluatorId: string, status: "draft" | "submitted") =>
  query(
    `INSERT INTO submissions (assessment_id, evaluator_id, status, submitted_at)
     VALUES ($1, $2, $3, $4)`,
    [assessmentId, evaluatorId, status, status === "submitted" ? new Date() : null],
  );

describe("getAssessmentRows", () => {
  it("counts the participating groups", async () => {
    // Regression: the progress columns were joined but never selected, so every
    // assessment reported nought groups while the SQL behind it was correct.
    const { classId, lecturer } = await scenario(3, 2);

    const [row] = await getAssessmentRows(classId, asker(lecturer.id));
    expect(row!.groupCount).toBe(3);
  });

  it("expects every member of a participating group to submit", async () => {
    const { classId, lecturer } = await scenario(2, 4);

    const [row] = await getAssessmentRows(classId, asker(lecturer.id));
    expect(row!.expected).toBe(8);
    expect(row!.submitted).toBe(0);
  });

  it("counts submissions as they come in", async () => {
    const { classId, assessmentId, lecturer, students } = await scenario(2, 3);
    await submit(assessmentId, students[0]!, "submitted");
    await submit(assessmentId, students[1]!, "submitted");

    const [row] = await getAssessmentRows(classId, asker(lecturer.id));
    expect(row!.submitted).toBe(2);
    expect(row!.expected).toBe(6);
  });

  it("does not count a draft as submitted", async () => {
    const { classId, assessmentId, lecturer, students } = await scenario(1, 3);
    await submit(assessmentId, students[0]!, "draft");

    const [row] = await getAssessmentRows(classId, asker(lecturer.id));
    expect(row!.submitted).toBe(0);
  });

  it("does not expect a student whose group was left out of the assessment", async () => {
    const { classId, lecturer } = await scenario(1, 3);
    // A second group exists in the class but takes no part.
    const { rows: grp } = await query<{ id: string }>(
      "INSERT INTO groups (class_id, group_number) VALUES ($1, 99) RETURNING id",
      [classId],
    );
    const outsider = await createUser({ role: "student" });
    await query("INSERT INTO group_members (group_id, class_id, student_id) VALUES ($1, $2, $3)", [
      grp[0]!.id,
      classId,
      outsider.id,
    ]);

    const [row] = await getAssessmentRows(classId, asker(lecturer.id));
    expect(row!.expected).toBe(3);
  });

  it("carries the assessment itself, with its group ids", async () => {
    const { classId, lecturer } = await scenario(2, 2);

    const [row] = await getAssessmentRows(classId, asker(lecturer.id));
    expect(row!.assessment.name).toBe("Phase 2");
    expect(row!.assessment.groupIds).toHaveLength(2);
    expect(row!.assessment.maxMark).toBe(100);
  });

  it("refuses another lecturer's class", async () => {
    const { classId } = await scenario();
    const other = await createUser({ role: "lecturer" });

    await expect(getAssessmentRows(classId, asker(other.id))).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("getAssessment", () => {
  it("returns an assessment to the lecturer who owns its class", async () => {
    const { assessmentId, lecturer } = await scenario();

    expect(await getAssessment(assessmentId, asker(lecturer.id))).toMatchObject({
      name: "Phase 2",
      status: "open",
    });
  });

  it("returns maxMark as a number, not the string numeric arrives as", async () => {
    const { assessmentId, lecturer } = await scenario();
    const assessment = await getAssessment(assessmentId, asker(lecturer.id));

    expect(typeof assessment.maxMark).toBe("number");
  });

  it("refuses another lecturer", async () => {
    const { assessmentId } = await scenario();
    const other = await createUser({ role: "lecturer" });

    await expect(getAssessment(assessmentId, asker(other.id))).rejects.toMatchObject({
      status: 404,
    });
  });

  it("refuses a student", async () => {
    const { assessmentId, students } = await scenario();

    await expect(getAssessment(assessmentId, asker(students[0]!, "student"))).rejects.toMatchObject(
      { status: 404 },
    );
  });
});
