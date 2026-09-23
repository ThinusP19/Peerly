import { query, withTransaction } from "../db/pool.ts";
import type { SessionUser } from "../domain/types.ts";
import { conflict, notFoundOrForbidden } from "../middleware/errors.ts";
import { record } from "./audit.ts";

/**
 * Resolving a class-list match conflict (FR-04).
 *
 * A conflict is the case the system deliberately refuses to decide for itself:
 * a student number on the list that an account claims, where something about
 * the details does not line up. SR-01 makes that a person's judgement, because
 * guessing wrong links one student's marks to another student's account.
 */

export interface ConflictCandidate {
  id: string;
  name: string;
  surname: string;
  email: string;
  studentNumber: string | null;
}

interface EnrolmentContext {
  id: string;
  classId: string;
  studentNumber: string;
  importedName: string;
  importedSurname: string;
  matchStatus: "matched" | "unmatched" | "conflict";
  moduleCode: string;
}

/** Loads the enrolment, refusing anything outside the lecturer's own classes. */
async function loadEnrolment(enrolmentId: string, user: SessionUser): Promise<EnrolmentContext> {
  if (user.role !== "lecturer") throw notFoundOrForbidden();

  const { rows } = await query<{
    id: string;
    class_id: string;
    student_number: string;
    imported_name: string;
    imported_surname: string;
    match_status: "matched" | "unmatched" | "conflict";
    module_code: string;
  }>(
    `SELECT e.id, e.class_id, e.student_number, e.imported_name, e.imported_surname,
            e.match_status, c.module_code
       FROM enrolments e
       JOIN classes c ON c.id = e.class_id
      WHERE e.id = $1 AND c.lecturer_id = $2`,
    [enrolmentId, user.id],
  );

  const row = rows[0];
  if (!row) throw notFoundOrForbidden();

  return {
    id: row.id,
    classId: row.class_id,
    studentNumber: row.student_number,
    importedName: row.imported_name,
    importedSurname: row.imported_surname,
    matchStatus: row.match_status,
    moduleCode: row.module_code,
  };
}

/**
 * Accounts that could plausibly be this enrolment.
 *
 * Matched on the student number alone. Offering near-misses on name would
 * invite the lecturer to link an account that simply has a similar name, which
 * is the mistake this screen exists to prevent.
 */
export async function getConflictCandidates(
  enrolmentId: string,
  user: SessionUser,
): Promise<ConflictCandidate[]> {
  const enrolment = await loadEnrolment(enrolmentId, user);

  const { rows } = await query<ConflictCandidate>(
    `SELECT id, name, surname, email, student_number AS "studentNumber"
       FROM users
      WHERE role = 'student' AND student_number = $1
      ORDER BY created_at`,
    [enrolment.studentNumber],
  );
  return rows;
}

export type ConflictDecision = { kind: "link"; userId: string } | { kind: "leave-unmatched" };

/**
 * Records the lecturer's decision (FR-04).
 *
 * Either outcome is a resolution: linking the account, or deciding none of the
 * candidates is the right person and leaving the row unmatched with a note
 * saying it was looked at. The second is not a failure - it is the answer when
 * the student has not registered yet.
 */
export async function resolveEnrolmentConflict(
  enrolmentId: string,
  decision: ConflictDecision,
  user: SessionUser,
): Promise<void> {
  const enrolment = await loadEnrolment(enrolmentId, user);

  if (enrolment.matchStatus !== "conflict") {
    throw conflict("This entry no longer has a conflict to resolve.");
  }

  const listed = `${enrolment.importedName} ${enrolment.importedSurname} (${enrolment.studentNumber})`;

  await withTransaction(async (sql) => {
    let detail: string;

    if (decision.kind === "link") {
      // Only an account that holds this entry's student number - the same list
      // getConflictCandidates offers. Anything else would let a hand-written
      // request link an arbitrary student to this class.
      const { rows } = await sql.query<{ name: string; surname: string; email: string }>(
        `SELECT name, surname, email FROM users
          WHERE id = $1 AND role = 'student' AND student_number = $2`,
        [decision.userId, enrolment.studentNumber],
      );
      const account = rows[0];
      if (!account) {
        throw conflict(
          "That account doesn't hold this student number, so it can't be linked here.",
        );
      }

      // enrolments_one_account_per_class refuses linking an account that is
      // already on this list under another row, which is exactly the duplicate
      // this decision could otherwise create.
      await sql.query(
        `UPDATE enrolments
            SET match_status = 'matched', user_id = $2, match_note = NULL
          WHERE id = $1`,
        [enrolmentId, decision.userId],
      );
      detail = `Linked to ${account.name} ${account.surname} (${account.email}).`;
    } else {
      await sql.query(
        `UPDATE enrolments
            SET match_status = 'unmatched', user_id = NULL,
                match_note = 'Not linked: the conflict was reviewed and no account was matched to this entry.'
          WHERE id = $1`,
        [enrolmentId],
      );
      detail = "Reviewed and left unmatched.";
    }

    await record(
      {
        actor: { id: user.id, name: user.name, surname: user.surname, role: user.role },
        eventType: "enrolment.resolved",
        objectDescription: `${enrolment.moduleCode} · ${listed}`,
        detail,
        classId: enrolment.classId,
        before: { matchStatus: "conflict" },
        after: { matchStatus: decision.kind === "link" ? "matched" : "unmatched" },
      },
      sql,
    );
  });
}
