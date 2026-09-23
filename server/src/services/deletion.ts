import { query, withTransaction } from "../db/pool.ts";
import type { SessionUser } from "../domain/types.ts";
import { record } from "./audit.ts";
import { getAssessment } from "./assessments.ts";
import { getClass } from "./classes.ts";

/**
 * Deleting an assessment or a class (FR-28).
 *
 * Deletion is permanent and cascades: an assessment takes its submissions and
 * ratings with it, a class takes its enrolments, groups and assessments. The
 * audit entry does not go, which is the point of `audit_entries` having no
 * foreign keys - the record that something was deleted has to outlive it.
 *
 * Nothing here decides whether to ask twice. It reports what would be lost, and
 * the interface asks. That keeps the warning honest: it is computed from what
 * is actually in the database, not from what a screen remembers.
 */

export interface DeletionImpact {
  /** Results that were never exported, and so exist nowhere else (FR-25). */
  unexportedAssessments: string[];
  submissions: number;
  ratings: number;
  assessments: number;
  enrolments: number;
  groups: number;
}

/** What deleting this assessment would destroy. */
export async function assessmentImpact(
  assessmentId: string,
  user: SessionUser,
): Promise<DeletionImpact> {
  const assessment = await getAssessment(assessmentId, user);

  const { rows } = await query<{ submissions: string; ratings: string }>(
    `SELECT (SELECT count(*) FROM submissions WHERE assessment_id = $1)  AS submissions,
            (SELECT count(*) FROM peer_ratings WHERE assessment_id = $1) AS ratings`,
    [assessmentId],
  );

  const submissions = Number(rows[0]!.submissions);
  return {
    // Only counts as unexported if there is something to lose.
    unexportedAssessments: !assessment.exportedAt && submissions > 0 ? [assessment.name] : [],
    submissions,
    ratings: Number(rows[0]!.ratings),
    assessments: 1,
    enrolments: 0,
    groups: 0,
  };
}

/** What deleting this class would destroy. */
export async function classImpact(classId: string, user: SessionUser): Promise<DeletionImpact> {
  await getClass(classId, user);

  const { rows } = await query<{
    assessments: string;
    enrolments: string;
    groups: string;
    submissions: string;
    ratings: string;
  }>(
    `SELECT (SELECT count(*) FROM assessments WHERE class_id = $1) AS assessments,
            (SELECT count(*) FROM enrolments  WHERE class_id = $1) AS enrolments,
            (SELECT count(*) FROM groups      WHERE class_id = $1) AS groups,
            (SELECT count(*) FROM submissions s
               JOIN assessments a ON a.id = s.assessment_id
              WHERE a.class_id = $1) AS submissions,
            (SELECT count(*) FROM peer_ratings r
               JOIN assessments a ON a.id = r.assessment_id
              WHERE a.class_id = $1) AS ratings`,
    [classId],
  );

  const { rows: unexported } = await query<{ name: string }>(
    `SELECT a.name
       FROM assessments a
      WHERE a.class_id = $1
        AND a.exported_at IS NULL
        AND EXISTS (SELECT 1 FROM submissions s WHERE s.assessment_id = a.id)
      ORDER BY a.opens_at`,
    [classId],
  );

  return {
    unexportedAssessments: unexported.map((row) => row.name),
    submissions: Number(rows[0]!.submissions),
    ratings: Number(rows[0]!.ratings),
    assessments: Number(rows[0]!.assessments),
    enrolments: Number(rows[0]!.enrolments),
    groups: Number(rows[0]!.groups),
  };
}

export async function deleteAssessment(assessmentId: string, user: SessionUser): Promise<void> {
  const assessment = await getAssessment(assessmentId, user);
  const impact = await assessmentImpact(assessmentId, user);
  const klass = await getClass(assessment.classId, user);

  await withTransaction(async (sql) => {
    // Recorded before the delete, while there is still something to describe.
    await record(
      {
        actor: { id: user.id, name: user.name, surname: user.surname, role: user.role },
        eventType: "assessment.deleted",
        objectDescription: `${klass.moduleCode} · ${assessment.name}`,
        detail:
          `Deleted with ${impact.submissions} submission(s) and ${impact.ratings} rating(s)` +
          `${impact.unexportedAssessments.length ? ", never exported" : ""}.`,
        classId: assessment.classId,
        assessmentId,
        before: {
          name: assessment.name,
          status: assessment.status,
          submissions: impact.submissions,
          ratings: impact.ratings,
          exportedAt: assessment.exportedAt ?? null,
        },
      },
      sql,
    );

    await sql.query("DELETE FROM assessments WHERE id = $1", [assessmentId]);
  });
}

export async function deleteClass(classId: string, user: SessionUser): Promise<void> {
  const klass = await getClass(classId, user);
  const impact = await classImpact(classId, user);

  await withTransaction(async (sql) => {
    await record(
      {
        actor: { id: user.id, name: user.name, surname: user.surname, role: user.role },
        eventType: "class.deleted",
        objectDescription: `${klass.moduleCode} · ${klass.name}`,
        detail:
          `Deleted with ${impact.enrolments} enrolment(s), ${impact.groups} group(s), ` +
          `${impact.assessments} assessment(s) and ${impact.ratings} rating(s)` +
          `${impact.unexportedAssessments.length ? `, including ${impact.unexportedAssessments.length} never exported` : ""}.`,
        classId,
        before: {
          moduleCode: klass.moduleCode,
          name: klass.name,
          academicPeriod: klass.academicPeriod,
          ...impact,
        },
      },
      sql,
    );

    await sql.query("DELETE FROM classes WHERE id = $1", [classId]);
  });
}

/**
 * Records that an assessment's results have been exported (FR-25, FR-28).
 *
 * This is what turns "deleting would lose the only copy" into "there is a copy
 * elsewhere", so it is only ever set by an export that actually produced one.
 */
export async function markResultsExported(
  assessmentId: string,
  user: SessionUser,
): Promise<string> {
  const assessment = await getAssessment(assessmentId, user);
  const klass = await getClass(assessment.classId, user);

  return withTransaction(async (sql) => {
    const { rows } = await sql.query<{ exported_at: Date }>(
      "UPDATE assessments SET exported_at = now() WHERE id = $1 RETURNING exported_at",
      [assessmentId],
    );

    await record(
      {
        actor: { id: user.id, name: user.name, surname: user.surname, role: user.role },
        eventType: "results.exported",
        objectDescription: `${klass.moduleCode} · ${assessment.name}`,
        detail: "Results and raw data exported.",
        classId: assessment.classId,
        assessmentId,
      },
      sql,
    );

    return rows[0]!.exported_at.toISOString();
  });
}
