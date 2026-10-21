import { query, withTransaction, type Sql } from "../db/pool.ts";
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
          -- A student who signs up late joins their group while its assessments
          -- are still running, even once classmates have submitted: the mark
          -- averages whatever ratings each member receives, and anyone who
          -- submitted can amend until the deadline. Only a group in a finished
          -- assessment is left alone, so its results do not gain a member who
          -- never had the chance to take part.
          AND NOT EXISTS (
            SELECT 1 FROM assessment_groups ag
              JOIN assessments a ON a.id = ag.assessment_id
             WHERE ag.group_id = e.imported_group_id
               AND (a.status = 'closed'
                    OR (a.status = 'open' AND a.closes_at <= now())
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

/**
 * Places every matched student who is still waiting outside their imported group.
 *
 * Run when the API starts, so students skipped by an earlier, stricter rule are
 * picked up without anyone re-importing a class list. Safe to repeat: a student
 * already in a group is left where they are, and each placement is audited.
 */
export async function assignAllImportedGroups(): Promise<void> {
  const { rows } = await query<{ class_id: string }>(
    `SELECT DISTINCT e.class_id
       FROM enrolments e
      WHERE e.imported_group_id IS NOT NULL
        AND e.match_status = 'matched' AND e.user_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM group_members gm
                         WHERE gm.class_id = e.class_id AND gm.student_id = e.user_id)`,
  );
  for (const row of rows) {
    await withTransaction((sql) => assignImportedGroups(sql, { classId: row.class_id }, SYSTEM));
  }
}

const SYSTEM: Actor = { name: "System" };
