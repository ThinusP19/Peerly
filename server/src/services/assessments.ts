import { query } from "../db/pool.ts";
import { notFoundOrForbidden } from "../middleware/errors.ts";
import { getClass, type Asker } from "./classes.ts";

/**
 * Assessments, as the lecturer portal reads them.
 *
 * Access is inherited from the class: an assessment belongs to exactly one
 * class, and the lecturer who owns that class owns it. Checked in SQL alongside
 * the fetch rather than as a separate lookup, so there is no window in which the
 * row has been read but not yet authorised.
 */

export interface AssessmentRecord {
  id: string;
  classId: string;
  name: string;
  description: string;
  groupIds: string[];
  status: "draft" | "open" | "closed";
  opensAt: string;
  closesAt: string;
  maxMark: number;
  calculatedAt?: string;
  calculationRunId?: string;
  exportedAt?: string;
}

interface AssessmentQueryRow {
  id: string;
  class_id: string;
  name: string;
  description: string;
  status: "draft" | "open" | "closed";
  opens_at: Date;
  closes_at: Date;
  max_mark: string;
  calculated_at: Date | null;
  calculation_run_id: string | null;
  exported_at: Date | null;
  group_ids: string[] | null;
}

const toAssessment = (row: AssessmentQueryRow): AssessmentRecord => ({
  id: row.id,
  classId: row.class_id,
  name: row.name,
  description: row.description,
  groupIds: row.group_ids ?? [],
  status: row.status,
  opensAt: row.opens_at.toISOString(),
  closesAt: row.closes_at.toISOString(),
  // numeric arrives as a string so no precision is lost in the driver; the
  // conversion happens here, deliberately, at the point of use.
  maxMark: Number(row.max_mark),
  ...(row.calculated_at ? { calculatedAt: row.calculated_at.toISOString() } : {}),
  ...(row.calculation_run_id ? { calculationRunId: row.calculation_run_id } : {}),
  ...(row.exported_at ? { exportedAt: row.exported_at.toISOString() } : {}),
});

/**
 * The assessment columns every read needs.
 *
 * A function rather than a constant so a caller can add its own columns. The
 * constant version silently cost us the progress counts: the LATERAL was joined
 * and never selected, so every assessment reported nought groups and nought
 * submissions while the underlying query was perfectly correct.
 */
const selectAssessment = (extraColumns = "") => `
  SELECT a.id, a.class_id, a.name, a.description, a.status, a.opens_at, a.closes_at,
         a.max_mark, a.calculated_at, a.calculation_run_id, a.exported_at,
         (SELECT array_agg(ag.group_id ORDER BY g.group_number)
            FROM assessment_groups ag
            JOIN groups g ON g.id = ag.group_id
           WHERE ag.assessment_id = a.id) AS group_ids${extraColumns}
    FROM assessments a
    JOIN classes c ON c.id = a.class_id`;

/** One assessment, or the same refusal whether it is missing or not yours. */
export async function getAssessment(assessmentId: string, asker: Asker): Promise<AssessmentRecord> {
  if (asker.role !== "lecturer") throw notFoundOrForbidden();

  const { rows } = await query<AssessmentQueryRow>(
    `${selectAssessment()} WHERE a.id = $1 AND c.lecturer_id = $2`,
    [assessmentId, asker.id],
  );
  const row = rows[0];
  if (!row) throw notFoundOrForbidden();
  return toAssessment(row);
}

export interface AssessmentRow {
  assessment: AssessmentRecord;
  groupCount: number;
  /** How many of the expected evaluators have submitted. */
  submitted: number;
  /** Everyone in a participating group, which is who is expected to submit. */
  expected: number;
}

/**
 * The assessment list for a class, each row carrying its progress bar's numbers.
 *
 * `expected` counts members of participating groups rather than the whole class:
 * a student in no group, or in a group this assessment left out, is not expected
 * to submit, and counting them would make every assessment look incomplete.
 */
export async function getAssessmentRows(classId: string, asker: Asker): Promise<AssessmentRow[]> {
  await getClass(classId, asker);

  const { rows } = await query<
    AssessmentQueryRow & { group_count: string; expected: string; submitted: string }
  >(
    `${selectAssessment(`,
         progress.group_count, progress.expected, progress.submitted`)}
      LEFT JOIN LATERAL (
        SELECT count(DISTINCT ag.group_id) AS group_count,
               count(gm.student_id)        AS expected,
               count(*) FILTER (
                 WHERE EXISTS (
                   SELECT 1 FROM submissions s
                    WHERE s.assessment_id = a.id
                      AND s.evaluator_id = gm.student_id
                      AND s.status = 'submitted')
               ) AS submitted
          FROM assessment_groups ag
          LEFT JOIN group_members gm ON gm.group_id = ag.group_id
         WHERE ag.assessment_id = a.id
      ) progress ON true
      WHERE a.class_id = $1 AND c.lecturer_id = $2
      ORDER BY a.opens_at DESC`,
    [classId, asker.id],
  );

  return rows.map((row) => ({
    assessment: toAssessment(row),
    groupCount: Number(row.group_count ?? 0),
    expected: Number(row.expected ?? 0),
    submitted: Number(row.submitted ?? 0),
  }));
}

export interface RatingOption {
  id: string;
  label: string;
  description: string;
  order: number;
  /** Lecturer-facing only. Absent entirely from a student's copy (SR-08). */
  hiddenValue?: number;
}

/**
 * The rating scale.
 *
 * SR-08 is not "do not render the numbers to a student" - it is that the values
 * must never reach a student's browser at all. So the field is deleted here,
 * server-side, rather than hidden by whatever is drawing the page. A student who
 * opens the network tab finds nothing to find.
 */
export async function getRatingOptions(role: Asker["role"]): Promise<RatingOption[]> {
  const { rows } = await query<{
    id: string;
    label: string;
    description: string;
    display_order: number;
    hidden_value: string;
  }>(
    `SELECT id, label, description, display_order, hidden_value
       FROM rating_options WHERE active ORDER BY display_order`,
  );

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    description: row.description,
    order: row.display_order,
    ...(role === "student" ? {} : { hiddenValue: Number(row.hidden_value) }),
  }));
}
