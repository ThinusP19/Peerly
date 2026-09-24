import { query, withTransaction } from "../db/pool.ts";
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
 * Confirming is the only part that writes, and it replaces the class's groups
 * wholesale rather than merging - which is why it refuses once an assessment
 * has real submissions behind it.
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

/**
 * Explains why a class's groups cannot be changed, or null if they can.
 *
 * FR-11 locks editing once an assessment is open and people have submitted.
 * Re-drawing under a live assessment would orphan every rating already given:
 * BR-01 requires both parties to be in the group a rating belongs to, and a
 * student moved out of their group breaks that for ratings in both directions.
 */
export async function regroupingBlockedReason(classId: string): Promise<string | null> {
  const { rows } = await query<{
    assessment_name: string;
    submissions: string;
    results: string;
  }>(
    `SELECT a.name AS assessment_name,
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
    return `"${live.assessment_name}" already has submissions, so the groups it was set up with can't be changed.`;
  }
  const calculated = rows.find((row) => Number(row.results) > 0);
  if (calculated) {
    return `"${calculated.assessment_name}" has calculated marks, which belong to the current groups, so they can't be changed.`;
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

  return withTransaction(async (sql) => {
    const { rowCount } = await sql.query("DELETE FROM groups WHERE class_id = $1", [classId]);

    for (const group of groups) {
      const { rows } = await sql.query<{ id: string }>(
        "INSERT INTO groups (class_id, group_number) VALUES ($1, $2) RETURNING id",
        [classId, group.groupNumber],
      );
      for (const studentId of group.memberStudentIds) {
        await sql.query(
          "INSERT INTO group_members (group_id, class_id, student_id) VALUES ($1, $2, $3)",
          [rows[0]!.id, classId, studentId],
        );
      }
    }

    await record(
      {
        actor: { id: user.id, name: user.name, surname: user.surname, role: user.role },
        eventType: "groups.confirmed",
        objectDescription: `${klass.moduleCode} · ${klass.name}`,
        detail: `${groups.length} group(s) confirmed for ${seen.size} student(s), replacing ${rowCount ?? 0}.`,
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
