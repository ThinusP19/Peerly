import type { Sql } from "../db/pool.ts";
import { record, type Actor } from "./audit.ts";

/**
 * FR-04: matching student accounts to class-list entries.
 *
 * "Run on account activation and again on every class-list commit, so the
 * order of registration and import does not matter." One function serves both
 * triggers, so a student who registers after the list is imported is matched
 * by exactly the rule that would have matched them had they registered first.
 *
 * Only an active student account is a candidate - an unverified one has not
 * proved the address is theirs (SR-01). A number held by an account whose name
 * materially differs from the list's is set to Conflict rather than matched:
 * that is precisely what an impersonation attempt looks like, and FR-04 leaves
 * it to a lecturer.
 *
 * Rows a lecturer has already decided are left alone: a match stands, a
 * Conflict waits for its resolution, and an entry the lecturer reviewed and
 * deliberately left unmatched is not re-linked behind their back.
 */

/** The note enrolments.ts writes when a lecturer declines a conflict. */
export const REVIEWED_NOTE_PREFIX = "Not linked:";

const CONFLICT_NOTE =
  "A registered account uses this student number, but its name differs from the class list. Check it before it's linked.";

/**
 * Case, punctuation and spacing are not material differences - "Nomvula
 * Dube-Khumalo" and "nomvula dubekhumalo" are the same person. Accents are kept:
 * "Zoë" against "Zoe" becomes a Conflict, which costs a lecturer one click,
 * where guessing wrong the other way would link a stranger.
 */
const NORMALISE = (column: string) => `regexp_replace(lower(${column}), '[^[:alpha:]]+', '', 'g')`;

/**
 * Matches every pending enrolment within scope.
 *
 * Pass `classId` after a class-list commit, or `userId` after an account is
 * activated. Returns how many rows became Matched and how many became Conflict.
 *
 * Each row it changes is audited (FR-27), in the caller's transaction: linking
 * an account to a class list is what lets that student rate and be rated, so it
 * must not happen without a trace. `actor` is whoever set it off - the lecturer
 * who imported the list, or the student whose activation it was.
 */
export async function matchEnrolments(
  sql: Sql,
  scope: { classId: string } | { userId: string },
  actor: Actor = { name: "System" },
): Promise<{ matched: number; conflicts: number }> {
  const byClass = "classId" in scope;
  const { rows } = await sql.query<{
    status: "matched" | "conflict";
    class_id: string;
    module_code: string;
    student_number: string;
    imported_name: string;
    imported_surname: string;
  }>(
    `WITH candidates AS (
       SELECT e.id AS enrolment_id, u.id AS user_id,
              -- The surname must agree, and so must the first given name: a
              -- list saying "Thabo" and an account saying "Thabo John" is the
              -- same student, "Thabo" and "Sipho" is not.
              (${NORMALISE("u.surname")} = ${NORMALISE("e.imported_surname")}
               AND ${NORMALISE("split_part(trim(u.name), ' ', 1)")}
                 = ${NORMALISE("split_part(trim(e.imported_name), ' ', 1)")}) AS same_person
         FROM enrolments e
         JOIN users u
           ON u.student_number = e.student_number
          AND u.role = 'student'
          AND u.status = 'active'
        WHERE e.match_status = 'unmatched'
          AND e.user_id IS NULL
          AND (e.match_note IS NULL OR e.match_note NOT LIKE '${REVIEWED_NOTE_PREFIX}%')
          AND ${byClass ? "e.class_id = $1" : "u.id = $1"}
          -- enrolments_one_account_per_class: an account already on this list
          -- under another row is a duplicate for a lecturer, not a match.
          AND NOT EXISTS (
            SELECT 1 FROM enrolments other
             WHERE other.class_id = e.class_id AND other.user_id = u.id
          )
     )
     UPDATE enrolments e
        SET match_status = CASE WHEN c.same_person THEN 'matched' ELSE 'conflict' END::match_status,
            user_id      = CASE WHEN c.same_person THEN c.user_id END,
            match_note   = CASE WHEN c.same_person THEN NULL ELSE $2 END
       FROM candidates c
      WHERE e.id = c.enrolment_id
      RETURNING e.match_status::text AS status, e.class_id, e.student_number,
                e.imported_name, e.imported_surname,
                (SELECT k.module_code FROM classes k WHERE k.id = e.class_id) AS module_code`,
    [byClass ? scope.classId : scope.userId, CONFLICT_NOTE],
  );

  for (const row of rows) {
    await record(
      {
        actor,
        eventType: row.status === "matched" ? "enrolment.matched" : "enrolment.conflict",
        objectDescription: `${row.imported_name} ${row.imported_surname} · ${row.student_number}`,
        detail:
          row.status === "matched"
            ? `Linked automatically to the registered account on the ${row.module_code} class list.`
            : `Flagged on the ${row.module_code} class list: a registered account uses this student number, but its name differs, so a lecturer needs to check it.`,
        classId: row.class_id,
        before: { matchStatus: "unmatched" },
        after: { matchStatus: row.status },
      },
      sql,
    );
  }

  return {
    matched: rows.filter((row) => row.status === "matched").length,
    conflicts: rows.filter((row) => row.status === "conflict").length,
  };
}
