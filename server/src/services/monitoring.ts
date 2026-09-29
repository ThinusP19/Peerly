import { query } from "../db/pool.ts";
import type { SessionUser } from "../domain/types.ts";
import * as mail from "../lib/mail.ts";
import { conflict } from "../middleware/errors.ts";
import { getAssessment } from "./assessments.ts";
import { record } from "./audit.ts";
import { getClass, type Asker } from "./classes.ts";

/**
 * Submission monitoring and the evaluation matrix (FR-18, FR-19, OR-16).
 *
 * Everything here is lecturer-only, and every function re-establishes that
 * through getAssessment, which refuses an assessment the caller does not own.
 * OR-16 is the reason there is no student-facing equivalent: an individual
 * rating is visible to the responsible lecturer and to its author, and to
 * nobody else - least of all the person it is about.
 */

/**
 * A student, as their own lecturer sees them.
 *
 * Carries the e-mail because FR-18 asks the lecturer to chase outstanding
 * submissions, and a name alone is not something you can contact. This is the
 * same information already on the class list, and it is lecturer-only - the
 * student portal's peer shape (services/student.ts) is deliberately narrower.
 */
export interface Person {
  id: string;
  role: "student";
  name: string;
  surname: string;
  email: string;
  studentNumber: string | null;
  status: "active" | "inactive" | "unverified";
  createdAt: string;
}

export interface GroupProgressRow {
  group: { id: string; groupNumber: number };
  members: Person[];
  submittedIds: string[];
  draftIds: string[];
  outstanding: Person[];
}

interface ProgressQueryRow {
  group_id: string;
  group_number: number;
  members: Person[] | null;
  submitted_ids: string[] | null;
  draft_ids: string[] | null;
}

/**
 * Per-group submission progress, and who is still outstanding by name.
 *
 * "Outstanding" is derived here rather than asked for separately: it is every
 * member without a submitted row, which includes people holding a draft. A
 * draft is not a submission, and a monitor that treated it as one would tell a
 * lecturer everyone was done when nobody was.
 */
export async function getGroupProgress(
  assessmentId: string,
  asker: Asker,
): Promise<GroupProgressRow[]> {
  await getAssessment(assessmentId, asker);

  const { rows } = await query<ProgressQueryRow>(
    `SELECT g.id AS group_id, g.group_number,
            (SELECT json_agg(json_build_object(
                      'id', u.id, 'role', u.role, 'name', u.name, 'surname', u.surname,
                      'email', u.email, 'studentNumber', u.student_number,
                      'status', u.status, 'createdAt', u.created_at)
                    ORDER BY u.surname, u.name)
               FROM group_members gm JOIN users u ON u.id = gm.student_id
              WHERE gm.group_id = g.id) AS members,
            (SELECT array_agg(s.evaluator_id)
               FROM submissions s JOIN group_members gm ON gm.student_id = s.evaluator_id
              WHERE s.assessment_id = $1 AND gm.group_id = g.id AND s.status = 'submitted')
              AS submitted_ids,
            (SELECT array_agg(s.evaluator_id)
               FROM submissions s JOIN group_members gm ON gm.student_id = s.evaluator_id
              WHERE s.assessment_id = $1 AND gm.group_id = g.id AND s.status = 'draft')
              AS draft_ids
       FROM assessment_groups ag
       JOIN groups g ON g.id = ag.group_id
      WHERE ag.assessment_id = $1
      ORDER BY g.group_number`,
    [assessmentId],
  );

  return rows.map((row) => {
    const members = row.members ?? [];
    const submittedIds = row.submitted_ids ?? [];
    return {
      group: { id: row.group_id, groupNumber: row.group_number },
      members,
      submittedIds,
      draftIds: row.draft_ids ?? [],
      outstanding: members.filter((m) => !submittedIds.includes(m.id)),
    };
  });
}

export interface SubmissionRecord {
  id: string;
  assessmentId: string;
  evaluatorStudentId: string;
  status: "draft" | "submitted";
  submittedAt?: string;
  updatedAt: string;
}

export async function getSubmissions(
  assessmentId: string,
  asker: Asker,
): Promise<SubmissionRecord[]> {
  await getAssessment(assessmentId, asker);

  const { rows } = await query<{
    id: string;
    assessment_id: string;
    evaluator_id: string;
    status: "draft" | "submitted";
    submitted_at: Date | null;
    updated_at: Date;
  }>(
    `SELECT id, assessment_id, evaluator_id, status, submitted_at, updated_at
       FROM submissions WHERE assessment_id = $1`,
    [assessmentId],
  );

  return rows.map((row) => ({
    id: row.id,
    assessmentId: row.assessment_id,
    evaluatorStudentId: row.evaluator_id,
    status: row.status,
    ...(row.submitted_at ? { submittedAt: row.submitted_at.toISOString() } : {}),
    updatedAt: row.updated_at.toISOString(),
  }));
}

export interface PeerRatingRecord {
  submissionId: string;
  evaluatedStudentId: string;
  ratingOptionId: string;
  comment?: string;
}

/**
 * Every rating given in an assessment - the raw material of the matrix.
 *
 * Lecturer-only by construction: this carries rating_option_id, from which the
 * hidden numeric value is one lookup away, so it must never be reachable by a
 * student (SR-08, OR-16).
 */
export async function getPeerRatings(
  assessmentId: string,
  asker: Asker,
): Promise<PeerRatingRecord[]> {
  await getAssessment(assessmentId, asker);

  const { rows } = await query<{
    submission_id: string;
    evaluated_id: string;
    rating_option_id: string;
    comment: string | null;
  }>(
    // Submitted ratings only. A draft is a student's work in progress and may
    // still change; showing it would put an opinion they have not committed to
    // in front of the lecturer, and in a different matrix from the marks.
    `SELECT r.submission_id, r.evaluated_id, r.rating_option_id, r.comment
       FROM peer_ratings r
       JOIN submissions s ON s.id = r.submission_id AND s.status = 'submitted'
      WHERE r.assessment_id = $1`,
    [assessmentId],
  );

  return rows.map((row) => ({
    submissionId: row.submission_id,
    evaluatedStudentId: row.evaluated_id,
    ratingOptionId: row.rating_option_id,
    ...(row.comment ? { comment: row.comment } : {}),
  }));
}

export interface GroupMarkRecord {
  assessmentId: string;
  groupId: string;
  baseMark: number | null;
}

/** Base marks per group (FR-21). Null where the lecturer has not entered one. */
export async function getGroupMarks(
  assessmentId: string,
  asker: Asker,
): Promise<GroupMarkRecord[]> {
  await getAssessment(assessmentId, asker);

  const { rows } = await query<{ group_id: string; base_mark: string | null }>(
    `SELECT ag.group_id, gm.base_mark
       FROM assessment_groups ag
       LEFT JOIN group_marks gm
         ON gm.assessment_id = ag.assessment_id AND gm.group_id = ag.group_id
       JOIN groups g ON g.id = ag.group_id
      WHERE ag.assessment_id = $1
      ORDER BY g.group_number`,
    [assessmentId],
  );

  return rows.map((row) => ({
    assessmentId,
    groupId: row.group_id,
    // numeric comes back as a string to protect the precision; converted here.
    baseMark: row.base_mark === null ? null : Number(row.base_mark),
  }));
}

/** Everyone in a class, for the screens that need to name a student. */
export async function getClassRoster(classId: string, asker: Asker): Promise<Person[]> {
  await getClass(classId, asker);

  const { rows } = await query<Person>(
    `SELECT DISTINCT u.id, u.role, u.name, u.surname, u.email,
            u.student_number AS "studentNumber", u.status,
            u.created_at AS "createdAt"
       FROM group_members gm JOIN users u ON u.id = gm.student_id
      WHERE gm.class_id = $1
      ORDER BY u.surname, u.name`,
    [classId],
  );
  return rows;
}

export interface ReminderResult {
  /** How many students were written to. */
  sent: number;
}

/**
 * Reminds the students who have not submitted (FR-18).
 *
 * Only the outstanding ones, and only while the assessment can still be
 * submitted to - a reminder to do something that is no longer possible is worse
 * than none. A student with a draft has still not submitted, so they are
 * reminded too.
 *
 * Dispatch is fire-and-forget, like every other message Peerly sends (CI-05):
 * a relay that is slow or down must not fail the lecturer's request, and they
 * can send again. The audit entry records the intent and the count, which is
 * what the lecturer needs to answer "did I chase them, and when".
 */
export async function sendSubmissionReminders(
  assessmentId: string,
  user: SessionUser,
): Promise<ReminderResult> {
  const assessment = await getAssessment(assessmentId, user);
  const klass = await getClass(assessment.classId, user);

  if (assessment.status !== "open") {
    throw conflict("Only an open assessment can be reminded about.");
  }
  if (new Date(assessment.closesAt) <= new Date()) {
    throw conflict("The closing time has passed, so there is nothing left to remind anyone about.");
  }
  // #13: before the opening time nobody can submit, so a reminder would only
  // send students to a form that refuses them.
  if (new Date(assessment.opensAt) > new Date()) {
    throw conflict(
      "This assessment only opens for students at its opening time, so there is nothing to remind them about yet.",
    );
  }

  const progress = await getGroupProgress(assessmentId, user);
  const outstanding = progress.flatMap((row) => row.outstanding);

  if (outstanding.length === 0) {
    throw conflict("Everyone has submitted, so there is nobody to remind.");
  }

  for (const student of outstanding) {
    mail.queue(
      mail.submissionReminderMail(
        student.email,
        student.name,
        assessment.name,
        klass.moduleCode,
        assessment.closesAt,
      ),
    );
  }

  await record({
    actor: { id: user.id, name: user.name, surname: user.surname, role: user.role },
    eventType: "reminders.sent",
    objectDescription: `${klass.moduleCode} · ${assessment.name}`,
    detail: `Reminder sent to ${outstanding.length} outstanding student(s).`,
    classId: assessment.classId,
    assessmentId,
  });

  return { sent: outstanding.length };
}
