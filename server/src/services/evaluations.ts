import { query, withTransaction } from "../db/pool.ts";
import { badRequest, conflict, notFoundOrForbidden } from "../middleware/errors.ts";

/**
 * Capturing and submitting a peer evaluation (FR-15, FR-16, FR-17).
 *
 * The database already refuses self-evaluation, duplicate pairs and rating
 * outside your own group (BR-01, BR-02, BR-03, OR-07). Nothing here re-implements
 * those; the checks below exist to turn a refusal into a sentence a student can
 * act on, rather than to be the only thing standing in the way. Delete every
 * check in this file and the rules still hold - the messages just get worse.
 *
 * Everything is scoped to the signed-in student. No function takes anyone
 * else's id, so there is no ownership check to forget (SR-07).
 */

export interface RatingEntry {
  evaluatedStudentId: string;
  ratingOptionId: string;
  comment?: string | undefined;
}

export interface EvaluationContext {
  assessmentId: string;
  groupId: string;
  /** Who this student is expected to rate: their group, minus themselves. */
  peerIds: string[];
  status: "draft" | "open" | "closed";
  /** BR-05: the deadline itself refuses work, not only the lecturer's button. */
  closesAt: string;
  submission?: { id: string; status: "draft" | "submitted"; submittedAt?: string };
}

/**
 * Establishes that this student may evaluate this assessment at all, and what
 * "complete" would mean for them.
 *
 * Refuses with the same 404 whether the assessment does not exist, is not one
 * of theirs, or their group takes no part in it (SR-07).
 */
export async function getEvaluationContext(
  studentId: string,
  assessmentId: string,
): Promise<EvaluationContext> {
  const { rows } = await query<{
    group_id: string;
    status: "draft" | "open" | "closed";
    closes_at: Date;
    peer_ids: string[] | null;
    submission_id: string | null;
    submission_status: "draft" | "submitted" | null;
    submitted_at: Date | null;
  }>(
    `SELECT g.id AS group_id, a.status, a.closes_at,
            (SELECT array_agg(peer.student_id)
               FROM group_members peer
              WHERE peer.group_id = g.id AND peer.student_id <> $1) AS peer_ids,
            s.id AS submission_id, s.status AS submission_status, s.submitted_at
       FROM group_members mine
       JOIN groups g ON g.id = mine.group_id
       JOIN assessment_groups ag ON ag.group_id = g.id
       JOIN assessments a ON a.id = ag.assessment_id
       LEFT JOIN submissions s ON s.assessment_id = a.id AND s.evaluator_id = $1
      WHERE mine.student_id = $1 AND a.id = $2`,
    [studentId, assessmentId],
  );

  const row = rows[0];
  if (!row) throw notFoundOrForbidden();

  return {
    assessmentId,
    groupId: row.group_id,
    closesAt: row.closes_at.toISOString(),
    peerIds: row.peer_ids ?? [],
    status: row.status,
    ...(row.submission_id
      ? {
          submission: {
            id: row.submission_id,
            status: row.submission_status!,
            ...(row.submitted_at ? { submittedAt: row.submitted_at.toISOString() } : {}),
          },
        }
      : {}),
  };
}

/**
 * The student's own ratings for this assessment, draft or submitted (CI-10).
 *
 * What makes a half-finished evaluation follow them to another device, and a
 * submitted one viewable afterwards. Their own ratings only - SR-08 allows a
 * student their own submitted ratings and nothing about anybody else's.
 */
export async function getOwnEntries(
  studentId: string,
  assessmentId: string,
): Promise<RatingEntry[]> {
  const { rows } = await query<{
    evaluated_id: string;
    rating_option_id: string;
    comment: string | null;
  }>(
    `SELECT r.evaluated_id, r.rating_option_id, r.comment
       FROM peer_ratings r
       JOIN submissions s ON s.id = r.submission_id
      WHERE s.assessment_id = $2 AND s.evaluator_id = $1
      ORDER BY r.evaluated_id`,
    [studentId, assessmentId],
  );
  return rows.map((row) => ({
    evaluatedStudentId: row.evaluated_id,
    ratingOptionId: row.rating_option_id,
    ...(row.comment ? { comment: row.comment } : {}),
  }));
}

/** Rejects anything the student cannot legitimately have chosen. */
function validateEntries(entries: RatingEntry[], context: EvaluationContext, complete: boolean) {
  const rated = new Set<string>();

  for (const entry of entries) {
    if (entry.evaluatedStudentId === undefined) continue;

    // BR-02. The database would refuse this too; saying so plainly is kinder
    // than a constraint violation.
    if (!context.peerIds.includes(entry.evaluatedStudentId)) {
      throw badRequest("You can only rate the members of your own group.");
    }
    // BR-03: one rating per person. A payload naming someone twice is a bug in
    // the client, not a choice the student made, so it fails rather than
    // silently keeping the last one.
    if (rated.has(entry.evaluatedStudentId)) {
      throw badRequest("Each group member can only be rated once.");
    }
    rated.add(entry.evaluatedStudentId);

    // FR-17: the limit is enforced in the database as well; this names the
    // field so the counter under the box can go red.
    if (entry.comment && entry.comment.length > 500) {
      throw badRequest("Comments are limited to 500 characters.", {
        [`comment.${entry.evaluatedStudentId}`]: "Comments are limited to 500 characters.",
      });
    }
  }

  if (complete) {
    const missing = context.peerIds.filter((id) => !rated.has(id));
    if (missing.length > 0) {
      // FR-16 requires the unrated members to be named, which the route does
      // from this list rather than from a generic message.
      throw badRequest("Rate every group member before submitting.", {
        missing: missing.join(","),
      });
    }
  }
}

/**
 * Writes the ratings for one evaluator, replacing whatever was there.
 *
 * Replace rather than merge: the payload is the whole evaluation as the student
 * currently has it on screen, so a member they went back and cleared must
 * disappear rather than linger from an earlier save. Inside the caller's
 * transaction, so a half-written evaluation is never visible (OR-05).
 */
async function writeRatings(
  sql: Parameters<Parameters<typeof withTransaction>[0]>[0],
  submissionId: string,
  studentId: string,
  context: EvaluationContext,
  entries: RatingEntry[],
) {
  await sql.query("DELETE FROM peer_ratings WHERE submission_id = $1", [submissionId]);

  for (const entry of entries) {
    await sql.query(
      `INSERT INTO peer_ratings
         (submission_id, assessment_id, group_id, evaluator_id, evaluated_id, rating_option_id, comment)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        submissionId,
        context.assessmentId,
        context.groupId,
        studentId,
        entry.evaluatedStudentId,
        entry.ratingOptionId,
        entry.comment?.trim() || null,
      ],
    );
  }
}

/** Creates or finds this student's submission row for the assessment. */
async function upsertSubmission(
  sql: Parameters<Parameters<typeof withTransaction>[0]>[0],
  assessmentId: string,
  studentId: string,
  status: "draft" | "submitted",
): Promise<string> {
  const { rows } = await sql.query<{ id: string }>(
    `INSERT INTO submissions (assessment_id, evaluator_id, status, submitted_at)
     VALUES ($1, $2, $3, CASE WHEN $3::submission_status = 'submitted' THEN now() END)
     ON CONFLICT (assessment_id, evaluator_id) DO UPDATE
        SET status = EXCLUDED.status,
            updated_at = now(),
            -- Keep the original time when amending something already submitted.
            submitted_at = COALESCE(submissions.submitted_at, EXCLUDED.submitted_at)
        -- A draft never overwrites a submission. Checked here, in the same
        -- statement as the write, not only beforehand: an autosave already in
        -- flight when the student presses Submit can otherwise land just after
        -- the submission and quietly turn it back into a draft. The row lock
        -- ON CONFLICT takes makes this re-read the committed row.
        WHERE EXCLUDED.status = 'submitted' OR submissions.status <> 'submitted'
     RETURNING id`,
    [assessmentId, studentId, status],
  );
  if (!rows[0]) throw conflict("You've already submitted this evaluation.");
  return rows[0].id;
}

/** Refuses anything but an open assessment, in the student's own words. */
function requireOpen(context: EvaluationContext) {
  if (context.status === "draft") {
    throw conflict("This assessment hasn't opened yet.");
  }
  if (context.status === "closed") {
    // OR-08: submitted ratings are immutable once an assessment closes. The UI
    // hides the form, but the endpoint is reachable without it.
    throw conflict("This assessment has closed, so it can no longer be changed.");
  }
  // BR-05: "no submission or amendment after closing". The closing TIME closes
  // it, not only the lecturer pressing the button - otherwise a student could
  // submit weeks late whenever nobody had got round to closing it, and the
  // extension feature, which exists solely to move this date, would decide
  // nothing. The lecturer's own closure remains separate: it is what says the
  // results may be calculated.
  if (new Date(context.closesAt) <= new Date()) {
    throw conflict("The closing time for this assessment has passed.");
  }
}

/**
 * Saves work in progress (CI-10).
 *
 * Partial by design - a student rates one member at a time - so completeness is
 * not checked. What is checked is that every rating is one they were allowed to
 * make, so a draft can never hold something a submission would reject.
 */
export async function saveDraft(
  studentId: string,
  assessmentId: string,
  entries: RatingEntry[],
): Promise<void> {
  const context = await getEvaluationContext(studentId, assessmentId);
  requireOpen(context);

  if (context.submission?.status === "submitted") {
    // Already submitted: the next write is an amendment, and must go through
    // submit() so it stays complete.
    throw conflict("You've already submitted this evaluation.");
  }

  validateEntries(entries, context, false);

  await withTransaction(async (sql) => {
    const submissionId = await upsertSubmission(sql, assessmentId, studentId, "draft");
    await writeRatings(sql, submissionId, studentId, context, entries);
  });
}

export interface SubmissionResult {
  id: string;
  status: "submitted";
  submittedAt: string;
  ratingCount: number;
}

/**
 * Submits, or amends an already-submitted evaluation while the assessment is
 * still open (FR-16).
 *
 * Every member must be rated. The whole thing lands in one transaction, so a
 * submission is never recorded against a partial set of ratings.
 */
export async function submitEvaluation(
  studentId: string,
  assessmentId: string,
  entries: RatingEntry[],
): Promise<SubmissionResult> {
  const context = await getEvaluationContext(studentId, assessmentId);
  requireOpen(context);

  if (context.peerIds.length === 0) {
    // A group of one has nobody to rate. Better to say so than to accept an
    // empty submission that means nothing.
    throw conflict("There's nobody else in your group to rate.");
  }

  validateEntries(entries, context, true);

  return withTransaction(async (sql) => {
    const submissionId = await upsertSubmission(sql, assessmentId, studentId, "submitted");
    await writeRatings(sql, submissionId, studentId, context, entries);

    const { rows } = await sql.query<{ submitted_at: Date; count: string }>(
      `SELECT s.submitted_at,
              (SELECT count(*) FROM peer_ratings r WHERE r.submission_id = s.id) AS count
         FROM submissions s WHERE s.id = $1`,
      [submissionId],
    );

    return {
      id: submissionId,
      status: "submitted" as const,
      submittedAt: rows[0]!.submitted_at.toISOString(),
      ratingCount: Number(rows[0]!.count),
    };
  });
}
