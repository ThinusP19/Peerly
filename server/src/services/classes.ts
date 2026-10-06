import { query, withTransaction } from "../db/pool.ts";
import type { SessionUser } from "../domain/types.ts";
import type { Role } from "../domain/types.ts";
import { badRequest, conflict, notFoundOrForbidden } from "../middleware/errors.ts";
import { record } from "./audit.ts";

/**
 * Classes, class lists and groups, as the lecturer portal reads them.
 *
 * Every function takes the asking account, not just an id. SR-07 requires the
 * server to decide ownership on each request, and a signature that cannot
 * express "who is asking" is one where somebody eventually forgets to check.
 *
 * A class the caller does not own is refused with the same 404 as one that does
 * not exist, so class identifiers cannot be discovered by probing.
 */

export interface Asker {
  id: string;
  role: Role;
}

export interface ClassRecord {
  id: string;
  moduleCode: string;
  name: string;
  lecturerId: string;
  academicPeriod: string;
}

interface ClassRow {
  id: string;
  module_code: string;
  name: string;
  lecturer_id: string;
  academic_period: string;
}

const toClass = (row: ClassRow): ClassRecord => ({
  id: row.id,
  moduleCode: row.module_code,
  name: row.name,
  lecturerId: row.lecturer_id,
  academicPeriod: row.academic_period,
});

/**
 * Throws unless the caller may work with this class.
 *
 * A lecturer owns their own classes. SR-16 keeps administrators out: they have
 * no automatic access to responses or marks, and a class list is both.
 */
export async function getClass(classId: string, asker: Asker): Promise<ClassRecord> {
  const { rows } = await query<ClassRow>(
    "SELECT id, module_code, name, lecturer_id, academic_period FROM classes WHERE id = $1",
    [classId],
  );
  const record = rows[0];

  if (!record || record.lecturer_id !== asker.id || asker.role !== "lecturer") {
    throw notFoundOrForbidden();
  }
  return toClass(record);
}

export interface ClassSummary {
  klass: ClassRecord;
  studentCount: number;
  matchedCount: number;
  unmatchedCount: number;
  conflictCount: number;
  groupCount: number;
  /** Students in a confirmed group - not the same as matched, before grouping. */
  groupedCount: number;
  assessmentCount: number;
  activeAssessment?: {
    id: string;
    name: string;
    status: "draft" | "open" | "closed";
    closesAt: string;
  };
}

interface SummaryRow extends ClassRow {
  student_count: string;
  matched_count: string;
  unmatched_count: string;
  conflict_count: string;
  group_count: string;
  grouped_count: string;
  assessment_count: string;
  active_id: string | null;
  active_name: string | null;
  active_status: "draft" | "open" | "closed" | null;
  active_closes_at: Date | null;
}

/**
 * Every class the lecturer owns, with the counts their dashboard card shows.
 *
 * One query with correlated subqueries rather than a join and a GROUP BY:
 * counting enrolments and groups in the same join multiplies the rows against
 * each other, and the totals come out wrong in a way that looks plausible.
 */
export async function getClassSummaries(asker: Asker): Promise<ClassSummary[]> {
  if (asker.role !== "lecturer") return [];

  const { rows } = await query<SummaryRow>(
    `SELECT c.id, c.module_code, c.name, c.lecturer_id, c.academic_period,
            (SELECT count(*) FROM enrolments e WHERE e.class_id = c.id) AS student_count,
            (SELECT count(*) FROM enrolments e WHERE e.class_id = c.id AND e.match_status = 'matched')   AS matched_count,
            (SELECT count(*) FROM enrolments e WHERE e.class_id = c.id AND e.match_status = 'unmatched') AS unmatched_count,
            (SELECT count(*) FROM enrolments e WHERE e.class_id = c.id AND e.match_status = 'conflict')  AS conflict_count,
            (SELECT count(*) FROM groups g WHERE g.class_id = c.id) AS group_count,
            (SELECT count(*) FROM group_members gm WHERE gm.class_id = c.id) AS grouped_count,
            (SELECT count(*) FROM assessments a WHERE a.class_id = c.id) AS assessment_count,
            active.id AS active_id, active.name AS active_name,
            active.status AS active_status, active.closes_at AS active_closes_at
       FROM classes c
       -- The assessment the card highlights: an open one if there is one, else
       -- the next draft. Ordered by status so 'open' wins, then by closing time.
       LEFT JOIN LATERAL (
         SELECT a.id, a.name, a.status, a.closes_at
           FROM assessments a
          WHERE a.class_id = c.id AND a.status IN ('open', 'draft')
          ORDER BY (a.status = 'open') DESC, a.closes_at
          LIMIT 1
       ) active ON true
      WHERE c.lecturer_id = $1
      ORDER BY c.module_code`,
    [asker.id],
  );

  return rows.map((row) => ({
    klass: toClass(row),
    studentCount: Number(row.student_count),
    matchedCount: Number(row.matched_count),
    unmatchedCount: Number(row.unmatched_count),
    conflictCount: Number(row.conflict_count),
    groupCount: Number(row.group_count),
    groupedCount: Number(row.grouped_count),
    assessmentCount: Number(row.assessment_count),
    ...(row.active_id
      ? {
          activeAssessment: {
            id: row.active_id,
            name: row.active_name!,
            status: row.active_status!,
            closesAt: row.active_closes_at!.toISOString(),
          },
        }
      : {}),
  }));
}

export interface EnrolmentRow {
  id: string;
  classId: string;
  studentNumber: string;
  importedName: string;
  importedSurname: string;
  matchStatus: "matched" | "unmatched" | "conflict";
  userId?: string;
  matchNote?: string;
  account?: { id: string; name: string; surname: string; email: string };
  groupNumber?: number;
}

interface EnrolmentQueryRow {
  id: string;
  class_id: string;
  student_number: string;
  imported_name: string;
  imported_surname: string;
  match_status: "matched" | "unmatched" | "conflict";
  user_id: string | null;
  match_note: string | null;
  account_name: string | null;
  account_surname: string | null;
  account_email: string | null;
  group_number: number | null;
}

/** The class list, joined to the account each row matched and its group. */
export async function getEnrolments(classId: string, asker: Asker): Promise<EnrolmentRow[]> {
  await getClass(classId, asker);

  const { rows } = await query<EnrolmentQueryRow>(
    `SELECT e.id, e.class_id, e.student_number, e.imported_name, e.imported_surname,
            e.match_status, e.user_id, e.match_note,
            u.name AS account_name, u.surname AS account_surname, u.email AS account_email,
            COALESCE(g.group_number, imported_group.group_number) AS group_number
       FROM enrolments e
       LEFT JOIN users u ON u.id = e.user_id
       LEFT JOIN group_members gm ON gm.student_id = e.user_id AND gm.class_id = e.class_id
       LEFT JOIN groups g ON g.id = gm.group_id
       LEFT JOIN groups imported_group ON imported_group.id = e.imported_group_id
      WHERE e.class_id = $1
      ORDER BY e.student_number`,
    [classId],
  );

  return rows.map((row) => ({
    id: row.id,
    classId: row.class_id,
    studentNumber: row.student_number,
    importedName: row.imported_name,
    importedSurname: row.imported_surname,
    matchStatus: row.match_status,
    ...(row.user_id ? { userId: row.user_id } : {}),
    ...(row.match_note ? { matchNote: row.match_note } : {}),
    ...(row.user_id && row.account_name
      ? {
          account: {
            id: row.user_id,
            name: row.account_name,
            surname: row.account_surname!,
            email: row.account_email!,
          },
        }
      : {}),
    ...(row.group_number !== null ? { groupNumber: row.group_number } : {}),
  }));
}

export interface GroupRecord {
  id: string;
  classId: string;
  groupNumber: number;
  memberStudentIds: string[];
}

/** Confirmed groups for a class, each with its members in a stable order. */
export async function getGroups(classId: string, asker: Asker): Promise<GroupRecord[]> {
  await getClass(classId, asker);

  const { rows } = await query<{
    id: string;
    class_id: string;
    group_number: number;
    member_ids: string[] | null;
  }>(
    `SELECT g.id, g.class_id, g.group_number,
            array_remove(array_agg(gm.student_id ORDER BY u.surname, u.name), NULL) AS member_ids
       FROM groups g
       LEFT JOIN group_members gm ON gm.group_id = g.id
       LEFT JOIN users u ON u.id = gm.student_id
      WHERE g.class_id = $1
      GROUP BY g.id, g.class_id, g.group_number
      ORDER BY g.group_number`,
    [classId],
  );

  return rows.map((row) => ({
    id: row.id,
    classId: row.class_id,
    groupNumber: row.group_number,
    memberStudentIds: row.member_ids ?? [],
  }));
}

/* ------------------------------------------------------------------ *
 * Creating a class - FR-08, BR-11
 * ------------------------------------------------------------------ */

export interface CreateClassInput {
  moduleCode: string;
  name: string;
  academicPeriod: string;
}

/**
 * Creates a class, owned by the lecturer who created it (BR-11).
 *
 * The owner is taken from the session, never from the request. A lecturer
 * cannot create a class on somebody else's behalf, so there is no field for it.
 */
/** Long enough for any real module name, short enough to fit a table row. */
export const MAX_CLASS_NAME = 120;

export async function createClass(
  input: CreateClassInput,
  user: SessionUser,
): Promise<ClassRecord> {
  const moduleCode = input.moduleCode.trim().toUpperCase();
  // Collapsed, so "2026  Semester 2" cannot slip past UNIQUE (module_code,
  // academic_period) as a period of its own.
  const academicPeriod = input.academicPeriod.trim().replace(/\s+/g, " ");
  const name = input.name.trim();

  // The same rules as the New class dialog, which a request sent straight to
  // the API does not go through.
  if (!/^[A-Z]{4}\d{3}$/.test(moduleCode)) {
    const message = "A module code is 4 letters and 3 digits, for example CMPG323.";
    throw badRequest(message, { moduleCode: message });
  }
  if (!/^\d{4} Semester [12]$/.test(academicPeriod)) {
    const message = "Choose an academic period such as 2026 Semester 2.";
    throw badRequest(message, { academicPeriod: message });
  }
  if (!name || name.length > MAX_CLASS_NAME) {
    const message = `Enter a class name of up to ${MAX_CLASS_NAME} characters.`;
    throw badRequest(message, { name: message });
  }

  return withTransaction(async (sql) => {
    let created;
    try {
      created = await sql.query<ClassRow>(
        `INSERT INTO classes (module_code, name, academic_period, lecturer_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, module_code, name, lecturer_id, academic_period`,
        [moduleCode, name, academicPeriod, user.id],
      );
    } catch {
      // UNIQUE (module_code, academic_period). Naming the clash is more useful
      // than a generic rule violation, and it gives away nothing: the lecturer
      // asking either owns it or is about to be told it exists anyway.
      throw conflict(
        `${moduleCode} already exists for ${academicPeriod}. Use a different module code or academic period.`,
      );
    }

    const klass = toClass(created.rows[0]!);

    await record(
      {
        actor: { id: user.id, name: user.name, surname: user.surname, role: user.role },
        eventType: "class.created",
        objectDescription: `${klass.moduleCode} \u00b7 ${klass.name}`,
        detail: `Created for ${klass.academicPeriod}.`,
        classId: klass.id,
      },
      sql,
    );

    return klass;
  });
}
