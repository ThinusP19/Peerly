import { pool, query, withTransaction, type Sql } from "../db/pool.ts";
import type { SessionUser } from "../domain/types.ts";
import { badRequest, conflict } from "../middleware/errors.ts";
import { record } from "./audit.ts";
import { getClass } from "./classes.ts";

/**
 * Generating and confirming groups (FR-10, FR-11, BR-10).
 *
 * Proposing is a pure function over a list of student ids - no database, no
 * randomness, no clock. That matters because FR-10 lets the lecturer
 * re-generate freely before confirming: a proposal that changed each time it
 * was drawn would make "generate again" feel broken rather than deliberate,
 * and there would be no way to tell a re-draw from a bug.
 *
 * Confirming replaces all groups, so it refuses when an assessment depends on them.
 */

export interface ProposedGroup {
  groupNumber: number;
  memberStudentIds: string[];
}

export type AllocationMode = "count" | "size";

/**
 * Round-robin, not consecutive slices.
 *
 * Dealing one student at a time into each group in turn spreads the remainder
 * evenly: 13 students into 4 groups gives 4/3/3/3, where slicing would give
 * 4/4/4/1 and leave one person nearly alone. IS-03 is still open on the
 * remainder rule; this is the behaviour the interface was built against and the
 * one that keeps every group usable.
 */
export function allocate(
  studentIds: string[],
  mode: AllocationMode,
  value: number,
): ProposedGroup[] {
  if (studentIds.length === 0) {
    throw badRequest("There are no matched students in this class to put into groups.");
  }
  if (!Number.isInteger(value) || value < 1) {
    throw badRequest("Enter a whole number greater than zero.");
  }

  const groupCount =
    mode === "count" ? Math.min(value, studentIds.length) : Math.ceil(studentIds.length / value);

  const groups: ProposedGroup[] = Array.from({ length: groupCount }, (_, index) => ({
    groupNumber: index + 1,
    memberStudentIds: [],
  }));

  studentIds.forEach((studentId, index) => {
    groups[index % groupCount]!.memberStudentIds.push(studentId);
  });

  return groups;
}

export interface Proposal {
  groups: ProposedGroup[];
  /** FR-10: a group of one has nobody to rate, so it is surfaced, not hidden. */
  warnings: string[];
  eligibleCount: number;
}

/**
 * Proposes an allocation for a class, without writing anything.
 *
 * Only matched students are eligible. An unmatched or conflicting enrolment has
 * no account behind it, so there is nobody to put in a group and nobody who
 * could sign in to rate anyone.
 */
export async function proposeGroups(
  classId: string,
  mode: AllocationMode,
  value: number,
  user: SessionUser,
): Promise<Proposal> {
  await getClass(classId, user);

  const { rows } = await query<{ user_id: string }>(
    `SELECT e.user_id
       FROM enrolments e
      WHERE e.class_id = $1 AND e.match_status = 'matched' AND e.user_id IS NOT NULL
      ORDER BY e.student_number`,
    [classId],
  );

  const groups = allocate(
    rows.map((row) => row.user_id),
    mode,
    value,
  );

  const warnings: string[] = [];
  const tooSmall = groups.filter((group) => group.memberStudentIds.length < 2);
  if (tooSmall.length > 0) {
    warnings.push(
      `${tooSmall.length} group(s) would have fewer than two members, so nobody in them has anyone to rate.`,
    );
  }

  return { groups, warnings, eligibleCount: rows.length };
}

/** Returns why a class cannot be regrouped, or null when it can. */
export async function regroupingBlockedReason(
  classId: string,
  sql: Sql = pool,
): Promise<string | null> {
  const { rows } = await sql.query<{
    assessment_name: string;
    status: "open" | "closed";
    submissions: string;
    results: string;
  }>(
    `SELECT a.name AS assessment_name, a.status,
            (SELECT count(*) FROM submissions s WHERE s.assessment_id = a.id) AS submissions,
            -- Results are keyed to the groups they were calculated over, so a
            -- calculated assessment locks the groups even if nobody submitted:
            -- an assessment can be closed and calculated with no submissions at
            -- all, and every member still has a mark that refers to a group.
            (SELECT count(*) FROM calculated_results r WHERE r.assessment_id = a.id) AS results
       FROM assessments a
      WHERE a.class_id = $1 AND a.status <> 'draft'
      ORDER BY a.opens_at DESC`,
    [classId],
  );

  const live = rows.find((row) => Number(row.submissions) > 0);
  if (live) {
    return `"${live.assessment_name}" already has submissions, so this class's groups can't be changed.`;
  }
  const calculated = rows.find((row) => Number(row.results) > 0);
  if (calculated) {
    return `"${calculated.assessment_name}" has calculated marks tied to this class's groups, so they can't be changed.`;
  }
  const closed = rows.find((row) => row.status === "closed");
  if (closed) {
    return `"${closed.assessment_name}" is closed, so this class's groups can't be changed.`;
  }
  return null;
}

export interface ConfirmResult {
  groupCount: number;
  memberCount: number;
  replaced: number;
}

/**
 * Replaces the class's groups with a confirmed allocation (FR-11).
 *
 * Wholesale replacement inside one transaction. Merging would leave a student
 * in a group the lecturer thought they had been moved out of, and BR-10's
 * one-group-per-class constraint would refuse the write halfway through,
 * leaving the class in a state nobody asked for.
 */
export async function confirmGroups(
  classId: string,
  groups: ProposedGroup[],
  user: SessionUser,
): Promise<ConfirmResult> {
  const klass = await getClass(classId, user);

  const blocked = await regroupingBlockedReason(classId);
  if (blocked) throw conflict(blocked);

  if (groups.length === 0) throw badRequest("There are no groups to confirm.");

  // A student in two groups would be refused by the database anyway; saying so
  // here names the problem instead of reporting a constraint violation.
  const seen = new Set<string>();
  for (const group of groups) {
    for (const studentId of group.memberStudentIds) {
      if (seen.has(studentId)) {
        throw badRequest("A student can only be in one group.");
      }
      seen.add(studentId);
    }
  }

  const { rows: eligible } = await query<{ user_id: string }>(
    `SELECT user_id FROM enrolments
      WHERE class_id = $1 AND match_status = 'matched' AND user_id IS NOT NULL`,
    [classId],
  );
  const allowed = new Set(eligible.map((row) => row.user_id));
  for (const studentId of seen) {
    if (!allowed.has(studentId)) {
      // Not on this class list, or not matched to an account. Either way they
      // cannot be in one of its groups.
      throw badRequest("Someone in these groups isn't a matched student on this class list.");
    }
  }

  // The generate screen enforces these, but the API is reachable without it.
  // A group of one has nobody to rate and nobody to be rated by.
  if (groups.some((group) => group.memberStudentIds.length < 2)) {
    throw badRequest(
      "Every group needs at least 2 members - nobody can rate anyone in a group of one.",
    );
  }

  const numbers = new Set(groups.map((group) => group.groupNumber));
  if (numbers.size !== groups.length) {
    throw badRequest(
      "Each group number can only be used once - every group must be numbered once.",
    );
  }

  // BR-10: every eligible student is assigned. A matched student left out would
  // simply never be asked to evaluate, with nothing on screen to say why.
  const missing = [...allowed].filter((studentId) => !seen.has(studentId)).length;
  if (missing) {
    throw badRequest(
      `${missing} matched ${missing === 1 ? "student isn't" : "students aren't"} in any group. Every matched student on the class list needs a group.`,
    );
  }

  // Draft and open assessments that take part through these groups. Deleting
  // the old groups deletes their links too, and an assessment with no groups
  // disappears from every student's dashboard. One that used every group moves
  // to every new group; one that used only some cannot be carried over, because
  // nothing says which new groups correspond to the old ones.
  const { rows: inUse } = await query<{ id: string; name: string; linked: string; total: string }>(
    `SELECT a.id, a.name,
            (SELECT count(*) FROM assessment_groups ag WHERE ag.assessment_id = a.id) AS linked,
            (SELECT count(*) FROM groups g WHERE g.class_id = a.class_id) AS total
       FROM assessments a
      WHERE a.class_id = $1 AND a.status IN ('draft', 'open')`,
    [classId],
  );
  const partial = inUse.find((a) => Number(a.linked) > 0 && Number(a.linked) < Number(a.total));
  if (partial) {
    throw conflict(
      `"${partial.name}" takes part with only some of the current groups, and new groups can't be matched to them. Remove it or create a new assessment after regrouping.`,
    );
  }
  const carried = inUse.filter((a) => Number(a.linked) > 0);

  return withTransaction(async (sql) => {
    const { rowCount } = await sql.query("DELETE FROM groups WHERE class_id = $1", [classId]);
    const newGroupIds: string[] = [];

    for (const group of groups) {
      const { rows } = await sql.query<{ id: string }>(
        "INSERT INTO groups (class_id, group_number) VALUES ($1, $2) RETURNING id",
        [classId, group.groupNumber],
      );
      newGroupIds.push(rows[0]!.id);
      for (const studentId of group.memberStudentIds) {
        await sql.query(
          "INSERT INTO group_members (group_id, class_id, student_id) VALUES ($1, $2, $3)",
          [rows[0]!.id, classId, studentId],
        );
      }
    }

    for (const assessment of carried) {
      for (const groupId of newGroupIds) {
        await sql.query(
          "INSERT INTO assessment_groups (assessment_id, group_id, class_id) VALUES ($1, $2, $3)",
          [assessment.id, groupId, classId],
        );
      }
    }

    await record(
      {
        actor: { id: user.id, name: user.name, surname: user.surname, role: user.role },
        eventType: "groups.confirmed",
        objectDescription: `${klass.moduleCode} · ${klass.name}`,
        detail:
          `${groups.length} group(s) confirmed for ${seen.size} student(s), replacing ${rowCount ?? 0}.` +
          (carried.length
            ? ` ${carried.map((a) => `"${a.name}"`).join(", ")} now ${carried.length === 1 ? "uses" : "use"} the new groups.`
            : ""),
        classId,
        before: { groupCount: rowCount ?? 0 },
        after: {
          groupCount: groups.length,
          sizes: groups.map((group) => group.memberStudentIds.length),
        },
      },
      sql,
    );

    return {
      groupCount: groups.length,
      memberCount: seen.size,
      replaced: rowCount ?? 0,
    };
  });
}
