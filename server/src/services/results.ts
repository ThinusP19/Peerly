import { query, withTransaction } from "../db/pool.ts";
import type { SessionUser } from "../domain/types.ts";
import {
  DEFAULT_CONFIG,
  calculateAssessment,
  type GroupInput,
  type ResultFlag,
  type StudentResult,
} from "../lib/felder.ts";
import { ONE_DECIMAL_MESSAGE, hasAtMostOneDecimal } from "../lib/marks.ts";
import { badRequest, conflict, notFoundOrForbidden } from "../middleware/errors.ts";
import { getAssessment } from "./assessments.ts";
import { record } from "./audit.ts";
import { getClass, type Asker } from "./classes.ts";
import { effectiveScale } from "./scale.ts";

/**
 * Running the calculation and reading its results (FR-22, FR-24, FR-26, OR-09).
 *
 * The arithmetic is not here - it is in `lib/felder.ts`, which has no database
 * and no HTTP (OR-18). This module gathers the inputs, hands them over, and
 * writes down both the answers and the exact rules used to get them.
 *
 * OR-09 is why a run is a row rather than a recalculation on demand: a mark has
 * to stay explainable after the ratings, the base marks or the configuration
 * have moved on. `calculation_runs.config` freezes the rules; the results
 * freeze the numbers.
 */

/** Everything one assessment's calculation needs, read in one pass. */
async function gatherGroups(assessmentId: string): Promise<GroupInput[]> {
  const { rows } = await query<{
    group_id: string;
    member_ids: string[] | null;
    base_mark: string | null;
    submitted_ids: string[] | null;
    unmatched_ids: string[] | null;
  }>(
    `SELECT g.id AS group_id,
            (SELECT array_agg(gm.student_id ORDER BY gm.student_id)
               FROM group_members gm WHERE gm.group_id = g.id) AS member_ids,
            m.base_mark,
            (SELECT array_agg(s.evaluator_id)
               FROM submissions s
               JOIN group_members gm ON gm.student_id = s.evaluator_id AND gm.group_id = g.id
              WHERE s.assessment_id = $1 AND s.status = 'submitted') AS submitted_ids,
            (SELECT array_agg(gm.student_id)
               FROM group_members gm
               JOIN enrolments e
                 ON e.user_id = gm.student_id AND e.class_id = gm.class_id
              WHERE gm.group_id = g.id AND e.match_status <> 'matched') AS unmatched_ids
       FROM assessment_groups ag
       JOIN groups g ON g.id = ag.group_id
       LEFT JOIN group_marks m ON m.assessment_id = ag.assessment_id AND m.group_id = g.id
      WHERE ag.assessment_id = $1
      ORDER BY g.group_number`,
    [assessmentId],
  );

  const { rows: ratings } = await query<{
    group_id: string;
    evaluator_id: string;
    evaluated_id: string;
    value: string;
  }>(
    // The assessment's own value where the lecturer set one, the system value
    // otherwise - the same layering effectiveScale shows them.
    `SELECT r.group_id, r.evaluator_id, r.evaluated_id,
            coalesce(v.hidden_value, o.hidden_value) AS value
       FROM peer_ratings r
       JOIN rating_options o ON o.id = r.rating_option_id
       LEFT JOIN assessment_rating_values v
         ON v.assessment_id = r.assessment_id AND v.rating_option_id = o.id
       JOIN submissions s ON s.id = r.submission_id
      WHERE r.assessment_id = $1
        -- A draft is not a submission. Counting one would let a student move a
        -- classmate's mark without ever having submitted.
        AND s.status = 'submitted'`,
    [assessmentId],
  );

  return rows.map((row) => ({
    groupId: row.group_id,
    memberIds: row.member_ids ?? [],
    // numeric arrives as a string to protect the precision; converted at the
    // point it enters the arithmetic, and nowhere earlier.
    baseMark: row.base_mark === null ? null : Number(row.base_mark),
    submittedIds: row.submitted_ids ?? [],
    unmatchedIds: row.unmatched_ids ?? [],
    ratings: ratings
      .filter((rating) => rating.group_id === row.group_id)
      .map((rating) => ({
        evaluatorId: rating.evaluator_id,
        evaluatedId: rating.evaluated_id,
        value: Number(rating.value),
      })),
  }));
}

export interface CalculationSummary {
  runId: string;
  calculatedAt: string;
  students: number;
  flagged: number;
}

/**
 * Runs the calculation and stores the results (FR-22).
 *
 * Refuses unless every participating group has a base mark. A factor with
 * nothing to multiply is not a mark, and producing partial results would put
 * blanks on a screen that is meant to be the finished picture (FR-21).
 */
export async function runCalculation(
  assessmentId: string,
  user: SessionUser,
  overrides?: OverrideDecision,
): Promise<CalculationSummary> {
  const assessment = await getAssessment(assessmentId, user);
  const klass = await getClass(assessment.classId, user);

  // BR-06: only a closed assessment is calculated. While it is still open, more
  // students may yet submit, so every mark produced is provisional and would
  // change without anybody touching the button - and a lecturer who published
  // those figures would have published numbers that were already wrong. The
  // deadline no longer accepts submissions (BR-05), but closing is the
  // lecturer's own statement that the assessment is finished with.
  if (assessment.status !== "closed") {
    throw conflict(
      assessment.status === "draft"
        ? "This assessment hasn't opened yet, so there is nothing to calculate."
        : "Close this assessment before calculating. While it is open, more students may still submit and every mark would change.",
    );
  }

  const groups = await gatherGroups(assessmentId);
  if (groups.length === 0) throw badRequest("This assessment has no groups.");

  const missing = groups.filter((g) => g.baseMark === null).length;
  if (missing > 0) {
    throw conflict(
      `${missing} group(s) still have no mark. Enter a mark for every group before calculating.`,
    );
  }
  // IS-06: a base mark stored before one decimal place was enforced (0005) is
  // re-entered rather than calculated from, so no mark is built on a figure
  // the marks screen would refuse.
  const imprecise = groups.filter((g) => !hasAtMostOneDecimal(g.baseMark!)).length;
  if (imprecise > 0) {
    throw conflict(
      `${imprecise} group mark(s) have more than one decimal place. ` +
        "Re-enter them as whole numbers or with one decimal place before calculating.",
    );
  }

  // FR-24: "Recalculation shall not silently discard an override: present
  // every affected override and require the Lecturer to confirm retention or
  // withdrawal." The screen lists them from listOverrides below; the server
  // refuses to guess which the lecturer meant.
  const { rows: existingOverrides } = await query<{
    student_id: string;
    override_mark: string;
    calculated_mark: string;
    name: string;
    surname: string;
  }>(
    `SELECT o.student_id, o.override_mark, o.calculated_mark, u.name, u.surname
       FROM mark_overrides o JOIN users u ON u.id = o.student_id
      WHERE o.assessment_id = $1
      ORDER BY u.surname, u.name`,
    [assessmentId],
  );
  if (existingOverrides.length > 0 && !overrides) {
    throw conflict(
      `${existingOverrides.length} override(s) exist for this assessment. ` +
        "Choose whether to keep or withdraw them before recalculating.",
    );
  }

  // The factor limits in force for this assessment: its own, or the system's.
  const scale = await effectiveScale(assessmentId);
  const config = { ...DEFAULT_CONFIG, minFactor: scale.minFactor, maxFactor: scale.maxFactor };

  // BR-07: the assessment's maximum caps every mark the factor would lift above it.
  const results = calculateAssessment(groups, config, { maxMark: assessment.maxMark });

  return withTransaction(async (sql) => {
    const { rows: run } = await sql.query<{ id: string; created_at: Date }>(
      `INSERT INTO calculation_runs (assessment_id, run_by, rule_version, config)
       VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
      [
        assessmentId,
        user.id,
        config.ruleVersion,
        // The scale is frozen with the run alongside the config (OR-09):
        // ratings point at options by id, and the values behind them can now
        // be changed by an administrator or the lecturer, so without this a
        // later change would leave an old run's marks unexplainable.
        JSON.stringify({
          ...config,
          // The ceiling the marks were capped at (BR-07), which can change later.
          maxMark: assessment.maxMark,
          customisedScale: scale.customised,
          scale: scale.options.map((option) => ({
            id: option.id,
            label: option.label,
            value: option.hiddenValue,
          })),
        }),
      ],
    );
    const runId = run[0]!.id;

    // A fresh run supersedes the last one. The previous run row survives, so
    // what an earlier calculation said is still on the record (OR-09).
    await sql.query("DELETE FROM calculated_results WHERE assessment_id = $1", [assessmentId]);

    for (const result of results) {
      await sql.query(
        `INSERT INTO calculated_results
           (run_id, assessment_id, student_id, group_id, ratings_received,
            mean_received, group_mean, raw_factor, adjustment_factor,
            base_mark, final_mark, flags)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          runId,
          assessmentId,
          result.studentId,
          result.groupId,
          result.ratingsReceived,
          result.meanReceived,
          result.groupMean,
          result.rawFactor,
          result.adjustmentFactor,
          result.baseMark,
          result.finalMark,
          result.flags,
        ],
      );
    }

    // A new run means new marks, and no workbook has carried them yet: an
    // earlier export no longer counts as a copy of these results (FR-28).
    await sql.query(
      `UPDATE assessments
          SET calculated_at = now(), calculation_run_id = $2, exported_at = NULL
        WHERE id = $1`,
      [assessmentId, runId],
    );

    // Each override is decided and audited on its own, so the log shows what
    // happened to every one of them rather than a count (FR-27).
    const newMarks = new Map(results.map((r) => [r.studentId, r.finalMark]));
    for (const existing of existingOverrides) {
      const recalculated = newMarks.get(existing.student_id) ?? null;
      const student = `${existing.name} ${existing.surname}`;

      // A student with no mark in the new run - moved out of every included
      // group - has nothing left to override.
      const withdraw = overrides === "withdraw" || recalculated === null;
      if (withdraw) {
        await sql.query("DELETE FROM mark_overrides WHERE assessment_id = $1 AND student_id = $2", [
          assessmentId,
          existing.student_id,
        ]);
      } else {
        // Kept: the record's calculated mark follows the new run, so the two
        // figures shown side by side are the ones actually in force (BR-08).
        await sql.query(
          `UPDATE mark_overrides SET calculated_mark = $3
            WHERE assessment_id = $1 AND student_id = $2`,
          [assessmentId, existing.student_id, recalculated],
        );
      }

      await record(
        {
          actor: { id: user.id, name: user.name, surname: user.surname, role: user.role },
          eventType: "mark.overridden",
          objectDescription: `${klass.moduleCode} · ${student}`,
          detail: withdraw
            ? `Override of ${existing.override_mark} withdrawn on recalculation` +
              (recalculated === null
                ? " - the student has no mark in the new run."
                : `; the calculated mark of ${recalculated} now stands.`)
            : `Override of ${existing.override_mark} kept on recalculation; ` +
              `calculated mark ${Number(existing.calculated_mark)} -> ${recalculated}.`,
          classId: assessment.classId,
          assessmentId,
          before: {
            overrideMark: Number(existing.override_mark),
            calculatedMark: Number(existing.calculated_mark),
          },
          after: withdraw
            ? { overrideMark: null, calculatedMark: recalculated }
            : { overrideMark: Number(existing.override_mark), calculatedMark: recalculated },
        },
        sql,
      );
    }

    const flagged = results.filter((r) => r.flags.length > 0).length;

    await record(
      {
        actor: { id: user.id, name: user.name, surname: user.surname, role: user.role },
        eventType: "marks.calculated",
        objectDescription: `${klass.moduleCode} · ${assessment.name}`,
        detail:
          `Calculated ${results.length} individual mark(s) using ${config.ruleVersion}` +
          (scale.customised ? " with this assessment's own rating values" : "") +
          "; " +
          `${flagged} flagged for review.`,
        classId: assessment.classId,
        assessmentId,
        after: { runId, ruleVersion: config.ruleVersion, students: results.length },
      },
      sql,
    );

    return {
      runId,
      calculatedAt: run[0]!.created_at.toISOString(),
      students: results.length,
      flagged,
    };
  });
}

/** What a recalculation does with the overrides already entered (FR-24). */
export type OverrideDecision = "keep" | "withdraw";

export interface MarkOverride {
  mark: number;
  reason: string;
  by: string;
  at: string;
}

export interface ResultRow extends Omit<StudentResult, "flags"> {
  flags: ResultFlag[];
  student: { id: string; name: string; surname: string; studentNumber: string | null };
  groupNumber: number;
  groupName?: string;
  leaderStudentId?: string;
  override?: MarkOverride;
  /** Every rating this student received, with who gave it (FR-26 drill-down). */
  received: Array<{
    evaluator: { id: string; name: string; surname: string };
    ratingOptionId: string;
    /**
     * The value this rating counted for in the current run - read from the
     * scale the run froze, so it matches the mark even after the system
     * values have since been changed.
     */
    value?: number;
    comment?: string;
  }>;
}

/** The results table and its drill-down (FR-26). Lecturer-only (SR-08, OR-16). */
export async function getResults(assessmentId: string, asker: Asker): Promise<ResultRow[]> {
  const assessment = await getAssessment(assessmentId, asker);

  // FR-13: re-opening, or changing a base mark or the maximum after
  // calculating, invalidates the run. Its rows stay in the table - they still
  // lock the groups they were calculated over - but they are no longer anybody's
  // mark, so nothing is served as current until the marks are calculated again.
  if (!assessment.calculatedAt) return [];

  const { rows } = await query<{
    student_id: string;
    group_id: string;
    group_number: number;
    group_name: string | null;
    leader_id: string | null;
    name: string;
    surname: string;
    student_number: string | null;
    ratings_received: number;
    mean_received: string | null;
    group_mean: string | null;
    raw_factor: string | null;
    adjustment_factor: string | null;
    base_mark: string | null;
    final_mark: string | null;
    flags: ResultFlag[];
    override_mark: string | null;
    override_reason: string | null;
    override_by: string | null;
    override_at: Date | null;
    received: Array<ResultRow["received"][number] & { label: string }> | null;
  }>(
    `SELECT r.student_id, r.group_id, g.group_number, g.group_name, leader.student_id AS leader_id,
            u.name, u.surname, u.student_number,
            r.ratings_received, r.mean_received, r.group_mean, r.raw_factor,
            r.adjustment_factor, r.base_mark, r.final_mark, r.flags,
            o.override_mark, o.reason AS override_reason, o.created_at AS override_at,
            (ob.name || ' ' || ob.surname) AS override_by,
            (SELECT json_agg(json_build_object(
                      'evaluator', json_build_object('id', ev.id, 'name', ev.name, 'surname', ev.surname),
                      'ratingOptionId', pr.rating_option_id,
                      'label', ro.label,
                      'comment', pr.comment)
                    ORDER BY ev.surname, ev.name)
               FROM peer_ratings pr
               JOIN users ev ON ev.id = pr.evaluator_id
               JOIN rating_options ro ON ro.id = pr.rating_option_id
               -- The ratings the mark was calculated from, not drafts.
               JOIN submissions ps ON ps.id = pr.submission_id AND ps.status = 'submitted'
              WHERE pr.assessment_id = r.assessment_id AND pr.evaluated_id = r.student_id)
              AS received
       FROM calculated_results r
       JOIN users u ON u.id = r.student_id
       JOIN groups g ON g.id = r.group_id
       LEFT JOIN enrolments leader_enrolment ON leader_enrolment.id = g.leader_enrolment_id
       LEFT JOIN group_members leader ON leader.group_id = g.id
                                    AND leader.student_id = leader_enrolment.user_id
       LEFT JOIN mark_overrides o
         ON o.assessment_id = r.assessment_id AND o.student_id = r.student_id
       LEFT JOIN users ob ON ob.id = o.overridden_by
      WHERE r.assessment_id = $1
      ORDER BY g.group_number, u.surname, u.name`,
    [assessmentId],
  );

  const number = (value: string | null) => (value === null ? null : Number(value));

  // The scale the current run used. Runs before 0009 froze it by label only.
  const { rows: run } = await query<{
    config: { scale?: Array<{ id?: string; label: string; value: number }> };
  }>("SELECT config FROM calculation_runs WHERE id = $1", [assessment.calculationRunId ?? null]);
  const frozen = run[0]?.config.scale ?? [];
  const valueOf = (optionId: string, label: string) =>
    (frozen.find((option) => option.id === optionId) ?? frozen.find((o) => o.label === label))
      ?.value;

  return rows.map((row) => ({
    studentId: row.student_id,
    groupId: row.group_id,
    groupNumber: row.group_number,
    ...(row.group_name !== null ? { groupName: row.group_name } : {}),
    ...(row.leader_id !== null ? { leaderStudentId: row.leader_id } : {}),
    student: {
      id: row.student_id,
      name: row.name,
      surname: row.surname,
      studentNumber: row.student_number,
    },
    ratingsReceived: row.ratings_received,
    meanReceived: number(row.mean_received),
    groupMean: number(row.group_mean),
    rawFactor: number(row.raw_factor),
    adjustmentFactor: number(row.adjustment_factor) ?? 1,
    baseMark: number(row.base_mark),
    finalMark: number(row.final_mark),
    flags: row.flags,
    ...(row.override_mark !== null
      ? {
          override: {
            mark: Number(row.override_mark),
            reason: row.override_reason!,
            by: row.override_by ?? "Unknown",
            at: row.override_at!.toISOString(),
          },
        }
      : {}),
    received: (row.received ?? []).map(({ label, ...rating }) => {
      const value = valueOf(rating.ratingOptionId, label);
      return value === undefined ? rating : { ...rating, value };
    }),
  }));
}

/**
 * Overrides a calculated mark (FR-24, BR-08, OR-15).
 *
 * The calculated mark is kept, never replaced - BR-08 - so the pair can be shown
 * side by side and the difference accounted for. The reason is mandatory in the
 * database as well as here: an unexplained mark adjustment is exactly what this
 * system exists to eliminate.
 */
export async function overrideMark(
  assessmentId: string,
  studentId: string,
  mark: number,
  reason: string,
  user: SessionUser,
): Promise<void> {
  const assessment = await getAssessment(assessmentId, user);
  const klass = await getClass(assessment.classId, user);

  if (!reason.trim()) {
    throw badRequest("Give a reason for the override.", {
      reason: "Give a reason for the override.",
    });
  }
  if (mark < 0 || mark > assessment.maxMark) {
    throw badRequest(`Enter a mark between 0 and ${assessment.maxMark}.`, {
      mark: `Enter a mark between 0 and ${assessment.maxMark}.`,
    });
  }
  if (!hasAtMostOneDecimal(mark)) {
    throw badRequest(ONE_DECIMAL_MESSAGE, { mark: ONE_DECIMAL_MESSAGE });
  }
  // An override stands beside a calculated mark (BR-08). After re-opening or a
  // changed base mark there is no current one to stand beside.
  if (!assessment.calculatedAt) {
    throw conflict(
      "These marks are out of date. Calculate them again before overriding one, so the override sits beside the current mark.",
    );
  }

  const { rows } = await query<{ final_mark: string | null; name: string; surname: string }>(
    `SELECT r.final_mark, u.name, u.surname
       FROM calculated_results r JOIN users u ON u.id = r.student_id
      WHERE r.assessment_id = $1 AND r.student_id = $2`,
    [assessmentId, studentId],
  );
  const calculated = rows[0];
  if (!calculated) throw notFoundOrForbidden();
  if (calculated.final_mark === null) {
    throw conflict("This student has no calculated mark to override yet.");
  }

  const { rows: existing } = await query<{ override_mark: string }>(
    "SELECT override_mark FROM mark_overrides WHERE assessment_id = $1 AND student_id = $2",
    [assessmentId, studentId],
  );

  await withTransaction(async (sql) => {
    await sql.query(
      `INSERT INTO mark_overrides
         (assessment_id, student_id, calculated_mark, override_mark, reason, overridden_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (assessment_id, student_id) DO UPDATE
          SET override_mark = EXCLUDED.override_mark,
              reason = EXCLUDED.reason,
              overridden_by = EXCLUDED.overridden_by,
              created_at = now()`,
      [assessmentId, studentId, Number(calculated.final_mark), mark, reason.trim(), user.id],
    );
    // The last workbook no longer carries this student's mark (FR-28).
    await sql.query("UPDATE assessments SET exported_at = NULL WHERE id = $1", [assessmentId]);

    await record(
      {
        actor: { id: user.id, name: user.name, surname: user.surname, role: user.role },
        eventType: "mark.overridden",
        objectDescription: `${klass.moduleCode} · ${calculated.name} ${calculated.surname}`,
        detail: `Mark overridden from ${Number(calculated.final_mark)} to ${mark}. Reason: ${reason.trim()}`,
        classId: assessment.classId,
        assessmentId,
        before: {
          calculatedMark: Number(calculated.final_mark),
          previousOverride: existing[0] ? Number(existing[0].override_mark) : null,
        },
        after: { overrideMark: mark, reason: reason.trim() },
      },
      sql,
    );
  });
}

/**
 * Withdraws one student's override, so their calculated mark stands again
 * (FR-24, BR-08).
 *
 * The only other way back was recalculating with every override withdrawn,
 * which took every justified override in the assessment with the mistaken one.
 * A reason is required here too: removing an adjustment changes a mark on the
 * record just as much as making one, and the audit log has to say why.
 */
export async function removeOverride(
  assessmentId: string,
  studentId: string,
  reason: string,
  user: SessionUser,
): Promise<void> {
  const assessment = await getAssessment(assessmentId, user);
  const klass = await getClass(assessment.classId, user);

  if (!reason.trim()) {
    throw badRequest("Give a reason for removing the override.", {
      reason: "Give a reason for removing the override.",
    });
  }

  const { rows } = await query<{
    override_mark: string;
    calculated_mark: string;
    name: string;
    surname: string;
  }>(
    `SELECT o.override_mark, o.calculated_mark, u.name, u.surname
       FROM mark_overrides o JOIN users u ON u.id = o.student_id
      WHERE o.assessment_id = $1 AND o.student_id = $2`,
    [assessmentId, studentId],
  );
  const existing = rows[0];
  if (!existing) throw conflict("This student's mark isn't overridden.");

  await withTransaction(async (sql) => {
    await sql.query("DELETE FROM mark_overrides WHERE assessment_id = $1 AND student_id = $2", [
      assessmentId,
      studentId,
    ]);
    await sql.query("UPDATE assessments SET exported_at = NULL WHERE id = $1", [assessmentId]);

    await record(
      {
        actor: { id: user.id, name: user.name, surname: user.surname, role: user.role },
        eventType: "mark.overridden",
        objectDescription: `${klass.moduleCode} · ${existing.name} ${existing.surname}`,
        detail:
          `Override of ${existing.override_mark} removed; the calculated mark of ` +
          `${existing.calculated_mark} stands. Reason: ${reason.trim()}`,
        classId: assessment.classId,
        assessmentId,
        before: {
          overrideMark: Number(existing.override_mark),
          calculatedMark: Number(existing.calculated_mark),
        },
        after: { overrideMark: null, reason: reason.trim() },
      },
      sql,
    );
  });
}

export interface OverrideSummary {
  studentId: string;
  name: string;
  surname: string;
  mark: number;
  reason: string;
}

/**
 * Every override on the assessment, whether or not its results are current.
 *
 * A recalculation asks what to do with each of these (FR-24), including after
 * a re-open or a changed base mark, when the results themselves are no longer
 * served - so the marks screen lists them from here, the same rows the
 * calculation checks, rather than from the results.
 */
export async function listOverrides(
  assessmentId: string,
  asker: Asker,
): Promise<OverrideSummary[]> {
  await getAssessment(assessmentId, asker);
  const { rows } = await query<{
    student_id: string;
    name: string;
    surname: string;
    override_mark: string;
    reason: string;
  }>(
    `SELECT o.student_id, u.name, u.surname, o.override_mark, o.reason
       FROM mark_overrides o JOIN users u ON u.id = o.student_id
      WHERE o.assessment_id = $1
      ORDER BY u.surname, u.name`,
    [assessmentId],
  );
  return rows.map((row) => ({
    studentId: row.student_id,
    name: row.name,
    surname: row.surname,
    mark: Number(row.override_mark),
    reason: row.reason,
  }));
}
