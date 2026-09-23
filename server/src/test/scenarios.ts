import { query } from "../db/pool.ts";
import type { SessionUser } from "../domain/types.ts";
import { createUser } from "./helpers.ts";

/**
 * A closed assessment ready to calculate: one lecturer, one group of three who
 * all submitted, every rating "Very good", and a base mark of 70.
 */
export async function closedAssessment() {
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
  const { rows: cls } = await query<{ id: string }>(
    `INSERT INTO classes (module_code, name, academic_period, lecturer_id)
     VALUES ('CMPG323', 'Development of Information Systems III', '2026 Semester 2', $1)
     RETURNING id`,
    [account.id],
  );
  const classId = cls[0]!.id;

  const { rows: grp } = await query<{ id: string }>(
    "INSERT INTO groups (class_id, group_number) VALUES ($1, 1) RETURNING id",
    [classId],
  );
  const groupId = grp[0]!.id;

  const students: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const s = await createUser({ role: "student", studentNumber: String(41200345 + i) });
    await query("INSERT INTO group_members (group_id, class_id, student_id) VALUES ($1,$2,$3)", [
      groupId,
      classId,
      s.id,
    ]);
    students.push(s.id);
  }

  const { rows: asm } = await query<{ id: string }>(
    `INSERT INTO assessments (class_id, name, status, opens_at, closes_at)
     VALUES ($1, 'Project Phase 2', 'closed', now() - interval '9 days', now() - interval '1 day')
     RETURNING id`,
    [classId],
  );
  const assessmentId = asm[0]!.id;
  await query(
    "INSERT INTO assessment_groups (assessment_id, group_id, class_id) VALUES ($1,$2,$3)",
    [assessmentId, groupId, classId],
  );
  await query("INSERT INTO group_marks (assessment_id, group_id, base_mark) VALUES ($1,$2,70)", [
    assessmentId,
    groupId,
  ]);

  const { rows: options } = await query<{ id: string }>(
    "SELECT id FROM rating_options ORDER BY display_order",
  );
  for (const evaluator of students) {
    const { rows: sub } = await query<{ id: string }>(
      `INSERT INTO submissions (assessment_id, evaluator_id, status, submitted_at)
       VALUES ($1,$2,'submitted',now()) RETURNING id`,
      [assessmentId, evaluator],
    );
    for (const evaluated of students.filter((s) => s !== evaluator)) {
      await query(
        `INSERT INTO peer_ratings
           (submission_id, assessment_id, group_id, evaluator_id, evaluated_id, rating_option_id, comment)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          sub[0]!.id,
          assessmentId,
          groupId,
          evaluator,
          evaluated,
          options[1]!.id,
          "Pulled their weight.",
        ],
      );
    }
  }

  return { user, classId, assessmentId, students };
}
