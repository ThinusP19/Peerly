import type { Sql } from "../db/pool.ts";
import { record, type Actor } from "./audit.ts";

/** Apply saved CSV allocations when accounts match, without moving existing members. */
export async function assignImportedGroups(
  sql: Sql,
  scope: { classId: string } | { userId: string },
  actor: Actor,
): Promise<void> {
  const byClass = "classId" in scope;
  const { rows } = await sql.query<{
    class_id: string;
    student_id: string;
    group_number: number;
    module_code: string;
    student_number: string;
  }>(
    `WITH added AS (
       INSERT INTO group_members (group_id, class_id, student_id)
       SELECT e.imported_group_id, e.class_id, e.user_id
         FROM enrolments e
        WHERE e.imported_group_id IS NOT NULL
          AND e.match_status = 'matched' AND e.user_id IS NOT NULL
          AND ${byClass ? "e.class_id = $1" : "e.user_id = $1"}
          -- Late registration must not change an assessment's established roster.
          AND NOT EXISTS (
            SELECT 1 FROM assessments a WHERE a.class_id = e.class_id
              AND a.status <> 'draft'
              AND (a.status = 'closed'
                   OR EXISTS (SELECT 1 FROM submissions s WHERE s.assessment_id = a.id)
                   OR EXISTS (SELECT 1 FROM calculated_results r WHERE r.assessment_id = a.id))
          )
       ON CONFLICT (class_id, student_id) DO NOTHING
       RETURNING class_id, student_id, group_id
     )
     SELECT added.class_id, added.student_id, g.group_number, c.module_code, u.student_number
       FROM added JOIN groups g ON g.id = added.group_id
       JOIN classes c ON c.id = added.class_id JOIN users u ON u.id = added.student_id`,
    [byClass ? scope.classId : scope.userId],
  );
  for (const row of rows) {
    await record(
      {
        actor,
        eventType: "groups.confirmed",
        objectDescription: `${row.module_code} · Group ${row.group_number}`,
        detail: `Assigned ${row.student_number} to their imported CSV group after account matching.`,
        classId: row.class_id,
        after: { studentId: row.student_id, groupNumber: row.group_number },
      },
      sql,
    );
  }
}
