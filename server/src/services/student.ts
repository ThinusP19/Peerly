import { query } from "../db/pool.ts";

/**
 * What a student may see (FR-14, SR-08, OR-16).
 *
 * Every query here is scoped to the asking student's own id in SQL, not filtered
 * afterwards in JavaScript. A student never passes an identifier for whose data
 * they want - there is no parameter to tamper with, so there is no check to get
 * wrong.
 *
 * Nothing here returns a rating, a mark, an adjustment factor or a hidden value.
 * Not "does not render" - does not return. SR-08 is about what reaches the
 * browser, not what is drawn.
 */

export interface StudentEnrolment {
  id: string;
  classId: string;
  moduleCode: string;
  className: string;
  studentNumber: string;
  /**
   * The name as it appears on the class list the lecturer imported.
   *
   * The student's own explanation screen puts this beside the name on their
   * account, because seeing the two side by side is how they spot which of the
   * two is wrong. It is their own enrolment row and nobody else's.
   */
  importedName: string;
  importedSurname: string;
  matchStatus: "matched" | "unmatched" | "conflict";
  matchNote?: string;
}

/**
 * The class-list row this student maps to, matched on student number.
 *
 * Matched on the number rather than the account id on purpose: an unmatched or
 * conflicting row has no account id - that is precisely what those states mean -
 * and the student needs to be told about exactly those cases.
 */
export async function getStudentEnrolment(studentId: string): Promise<StudentEnrolment | null> {
  const { rows } = await query<{
    id: string;
    class_id: string;
    module_code: string;
    class_name: string;
    student_number: string;
    imported_name: string;
    imported_surname: string;
    match_status: "matched" | "unmatched" | "conflict";
    match_note: string | null;
  }>(
    `SELECT e.id, e.class_id, c.module_code, c.name AS class_name,
            e.student_number, e.imported_name, e.imported_surname,
            e.match_status, e.match_note
       FROM users u
       JOIN enrolments e ON e.student_number = u.student_number
       JOIN classes c ON c.id = e.class_id
      WHERE u.id = $1
      ORDER BY e.created_at
      LIMIT 1`,
    [studentId],
  );

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    classId: row.class_id,
    moduleCode: row.module_code,
    className: row.class_name,
    studentNumber: row.student_number,
    importedName: row.imported_name,
    importedSurname: row.imported_surname,
    matchStatus: row.match_status,
    ...(row.match_note ? { matchNote: row.match_note } : {}),
  };
}

export interface StudentPeer {
  id: string;
  name: string;
  surname: string;
}

export interface StudentAssessmentView {
  assessment: {
    id: string;
    name: string;
    description: string;
    status: "draft" | "open" | "closed";
    opensAt: string;
    closesAt: string;
    /** When the lecturer actually closed it, which can be before closesAt. */
    closedAt?: string;
  };
  klass: { id: string; moduleCode: string; name: string };
  group: { id: string; groupNumber: number };
  /** Everyone in the group except the student themselves (BR-02). */
  members: StudentPeer[];
  submission?: { id: string; status: "draft" | "submitted"; submittedAt?: string };
}

/**
 * Every assessment this student can see, with the group context they need.
 *
 * Drafts are left out. A draft is the lecturer's work in progress - its name,
 * dates and groups may still be wrong - and the lecturer's screens promise
 * that nothing is visible to students until it is opened.
 */
export async function getStudentAssessments(studentId: string): Promise<StudentAssessmentView[]> {
  const { rows } = await query<{
    assessment_id: string;
    assessment_name: string;
    description: string;
    status: "draft" | "open" | "closed";
    opens_at: Date;
    closes_at: Date;
    closed_at: Date | null;
    class_id: string;
    module_code: string;
    class_name: string;
    group_id: string;
    group_number: number;
    submission_id: string | null;
    submission_status: "draft" | "submitted" | null;
    submitted_at: Date | null;
    members: Array<{ id: string; name: string; surname: string }> | null;
  }>(
    `SELECT a.id AS assessment_id, a.name AS assessment_name, a.description, a.status,
            a.opens_at, a.closes_at, a.closed_at,
            c.id AS class_id, c.module_code, c.name AS class_name,
            g.id AS group_id, g.group_number,
            s.id AS submission_id, s.status AS submission_status, s.submitted_at,
            (SELECT json_agg(json_build_object('id', p.id, 'name', p.name, 'surname', p.surname)
                             ORDER BY p.surname, p.name)
               FROM group_members peer
               JOIN users p ON p.id = peer.student_id
              WHERE peer.group_id = g.id AND peer.student_id <> $1) AS members
       FROM group_members mine
       JOIN groups g ON g.id = mine.group_id
       JOIN classes c ON c.id = g.class_id
       JOIN assessment_groups ag ON ag.group_id = g.id
       JOIN assessments a ON a.id = ag.assessment_id
       LEFT JOIN submissions s ON s.assessment_id = a.id AND s.evaluator_id = $1
      WHERE mine.student_id = $1
        AND a.status <> 'draft'
      -- Open first, then closed; each by when it shuts.
      ORDER BY CASE a.status WHEN 'open' THEN 0 ELSE 1 END, a.closes_at`,
    [studentId],
  );

  return rows.map((row) => ({
    assessment: {
      id: row.assessment_id,
      name: row.assessment_name,
      description: row.description,
      status: row.status,
      opensAt: row.opens_at.toISOString(),
      closesAt: row.closes_at.toISOString(),
      ...(row.closed_at ? { closedAt: row.closed_at.toISOString() } : {}),
    },
    klass: { id: row.class_id, moduleCode: row.module_code, name: row.class_name },
    group: { id: row.group_id, groupNumber: row.group_number },
    members: row.members ?? [],
    ...(row.submission_id
      ? {
          submission: {
            id: row.submission_id,
            status: row.submission_status!,
            ...(row.submitted_at ? { submittedAt: row.submitted_at.toISOString() } : {}),
          },
        }
      : {}),
  }));
}
