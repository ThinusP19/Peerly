import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closePool, query } from "../db/pool.ts";
import type { SessionUser } from "../domain/types.ts";
import { createUser, resetDatabase } from "../test/helpers.ts";
import { getAuditEntries } from "./audit.ts";
import { allocate, confirmGroups, proposeGroups, regroupingBlockedReason } from "./groups.ts";

/** FR-10, FR-11, BR-10. */

beforeEach(resetDatabase);
afterAll(closePool);

const sizesOf = (groups: Array<{ memberStudentIds: string[] }>) =>
  groups.map((g) => g.memberStudentIds.length);

describe("allocate (FR-10)", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `s${i + 1}`);

  it("splits into the requested number of groups", () => {
    expect(sizesOf(allocate(ids(12), "count", 4))).toEqual([3, 3, 3, 3]);
  });

  it("spreads the remainder instead of stranding it (round-robin)", () => {
    // Consecutive slices would give 4/4/4/1 and leave someone nearly alone.
    expect(sizesOf(allocate(ids(13), "count", 4))).toEqual([4, 3, 3, 3]);
  });

  it("derives the group count from a target size", () => {
    expect(sizesOf(allocate(ids(13), "size", 4))).toEqual([4, 3, 3, 3]);
  });

  it("assigns every student exactly once", () => {
    const groups = allocate(ids(29), "size", 5);
    const assigned = groups.flatMap((g) => g.memberStudentIds);
    expect(assigned).toHaveLength(29);
    expect(new Set(assigned).size).toBe(29);
  });

  it("is deterministic, so re-drawing is a choice and not a surprise", () => {
    expect(allocate(ids(17), "count", 5)).toEqual(allocate(ids(17), "count", 5));
  });

  it("never makes more groups than there are students", () => {
    expect(sizesOf(allocate(ids(3), "count", 10))).toEqual([1, 1, 1]);
  });

  it("numbers groups from one", () => {
    expect(allocate(ids(4), "count", 2).map((g) => g.groupNumber)).toEqual([1, 2]);
  });

  it("refuses an empty class", () => {
    expect(() => allocate([], "count", 2)).toThrow(/no matched students/);
  });

  it("refuses a nonsensical value", () => {
    expect(() => allocate(ids(4), "count", 0)).toThrow(/whole number/);
    expect(() => allocate(ids(4), "size", -1)).toThrow(/whole number/);
  });
});

async function scenario(studentCount = 8) {
  const account = await createUser({ role: "lecturer", name: "Anneke", surname: "vd Merwe" });
  const user: SessionUser = {
    id: account.id,
    role: "lecturer",
    name: "Anneke",
    surname: "vd Merwe",
    email: account.email,
    studentNumber: null,
    status: "active",
    createdAt: new Date().toISOString(),
  };
  const { rows } = await query<{ id: string }>(
    `INSERT INTO classes (module_code, name, academic_period, lecturer_id)
     VALUES ('CMPG323', 'Test', '2026 S2', $1) RETURNING id`,
    [account.id],
  );
  const classId = rows[0]!.id;

  const studentIds: string[] = [];
  for (let i = 0; i < studentCount; i += 1) {
    const student = await createUser({ role: "student", studentNumber: String(41200345 + i) });
    await query(
      `INSERT INTO enrolments (class_id, student_number, imported_name, imported_surname, match_status, user_id)
       VALUES ($1, $2, 'Test', 'Person', 'matched', $3)`,
      [classId, String(41200345 + i), student.id],
    );
    studentIds.push(student.id);
  }

  return { user, classId, studentIds };
}

describe("proposeGroups", () => {
  it("uses only matched students", async () => {
    const { user, classId } = await scenario(6);
    await query(
      `INSERT INTO enrolments (class_id, student_number, imported_name, imported_surname, match_status)
       VALUES ($1, '41209999', 'Not', 'Registered', 'unmatched')`,
      [classId],
    );

    const proposal = await proposeGroups(classId, "count", 2, user);
    expect(proposal.eligibleCount).toBe(6);
    expect(sizesOf(proposal.groups)).toEqual([3, 3]);
  });

  it("warns about groups with fewer than two members", async () => {
    const { user, classId } = await scenario(3);

    const proposal = await proposeGroups(classId, "count", 3, user);
    expect(proposal.warnings[0]).toContain("fewer than two members");
  });

  it("writes nothing", async () => {
    const { user, classId } = await scenario(6);
    await proposeGroups(classId, "count", 2, user);

    const { rows } = await query("SELECT 1 FROM groups");
    expect(rows).toHaveLength(0);
  });

  it("refuses another lecturer's class", async () => {
    const { classId } = await scenario(4);
    const other = await createUser({ role: "lecturer" });
    const intruder: SessionUser = {
      id: other.id,
      role: "lecturer",
      name: "X",
      surname: "Y",
      email: other.email,
      studentNumber: null,
      status: "active",
      createdAt: new Date().toISOString(),
    };

    await expect(proposeGroups(classId, "count", 2, intruder)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("confirmGroups (FR-11, BR-10)", () => {
  it("persists the allocation", async () => {
    const { user, classId } = await scenario(8);
    const { groups } = await proposeGroups(classId, "count", 2, user);

    const result = await confirmGroups(classId, groups, user);
    expect(result).toMatchObject({ groupCount: 2, memberCount: 8, replaced: 0 });
  });

  it("replaces the previous groups rather than adding to them", async () => {
    const { user, classId } = await scenario(8);
    await confirmGroups(classId, (await proposeGroups(classId, "count", 2, user)).groups, user);

    const result = await confirmGroups(
      classId,
      (await proposeGroups(classId, "count", 4, user)).groups,
      user,
    );
    expect(result).toMatchObject({ groupCount: 4, replaced: 2 });

    const { rows } = await query<{ count: string }>("SELECT count(*) AS count FROM groups");
    expect(Number(rows[0]!.count)).toBe(4);
  });

  it("refuses a student placed in two groups (BR-10)", async () => {
    const { user, classId, studentIds } = await scenario(4);

    await expect(
      confirmGroups(
        classId,
        [
          { groupNumber: 1, memberStudentIds: [studentIds[0]!, studentIds[1]!] },
          { groupNumber: 2, memberStudentIds: [studentIds[1]!, studentIds[2]!] },
        ],
        user,
      ),
    ).rejects.toThrow(/only be in one group/);
  });

  it("refuses somebody who is not a matched student on this list", async () => {
    const { user, classId, studentIds } = await scenario(4);
    const outsider = await createUser({ role: "student" });

    await expect(
      confirmGroups(
        classId,
        [{ groupNumber: 1, memberStudentIds: [studentIds[0]!, outsider.id] }],
        user,
      ),
    ).rejects.toThrow(/matched student on this class list/);
  });

  it("refuses an empty allocation", async () => {
    const { user, classId } = await scenario(4);
    await expect(confirmGroups(classId, [], user)).rejects.toThrow(/no groups to confirm/);
  });

  it("records the confirmation with the sizes it produced (FR-27)", async () => {
    const { user, classId } = await scenario(8);
    await confirmGroups(classId, (await proposeGroups(classId, "count", 2, user)).groups, user);

    const [entry] = await getAuditEntries();
    expect(entry!.eventType).toBe("groups.confirmed");
    expect(entry!.detail).toContain("2 group(s) confirmed for 8 student(s)");
  });

  it("leaves the old groups alone if the new allocation is refused (OR-05)", async () => {
    const { user, classId, studentIds } = await scenario(8);
    await confirmGroups(classId, (await proposeGroups(classId, "count", 2, user)).groups, user);

    await expect(
      confirmGroups(
        classId,
        [{ groupNumber: 1, memberStudentIds: [studentIds[0]!, studentIds[0]!] }],
        user,
      ),
    ).rejects.toThrow();

    const { rows } = await query<{ count: string }>("SELECT count(*) AS count FROM groups");
    expect(Number(rows[0]!.count)).toBe(2);
  });
});

describe("regroupingBlockedReason (FR-11)", () => {
  const withOpenAssessment = async (submissions: number) => {
    const s = await scenario(6);
    await confirmGroups(
      s.classId,
      (await proposeGroups(s.classId, "count", 2, s.user)).groups,
      s.user,
    );

    const { rows: asm } = await query<{ id: string }>(
      `INSERT INTO assessments (class_id, name, status, opens_at, closes_at)
       VALUES ($1, 'Phase 2', 'open', now() - interval '1 day', now() + interval '7 days')
       RETURNING id`,
      [s.classId],
    );
    const { rows: groups } = await query<{ id: string }>(
      "SELECT id FROM groups WHERE class_id = $1",
      [s.classId],
    );
    for (const g of groups) {
      await query(
        "INSERT INTO assessment_groups (assessment_id, group_id, class_id) VALUES ($1,$2,$3)",
        [asm[0]!.id, g.id, s.classId],
      );
    }
    for (let i = 0; i < submissions; i += 1) {
      await query(
        `INSERT INTO submissions (assessment_id, evaluator_id, status, submitted_at)
         VALUES ($1, $2, 'submitted', now())`,
        [asm[0]!.id, s.studentIds[i]],
      );
    }
    return s;
  };

  it("allows regrouping while an open assessment has no submissions yet", async () => {
    const { classId } = await withOpenAssessment(0);
    expect(await regroupingBlockedReason(classId)).toBeNull();
  });

  it("blocks it once somebody has submitted, naming the assessment", async () => {
    const { classId } = await withOpenAssessment(1);

    const reason = await regroupingBlockedReason(classId);
    expect(reason).toContain("Phase 2");
    expect(reason).toContain("already has submissions");
  });

  it("refuses the confirmation itself, not only the check", async () => {
    const { classId, user } = await withOpenAssessment(1);

    await expect(
      confirmGroups(classId, (await proposeGroups(classId, "count", 3, user)).groups, user),
    ).rejects.toThrow(/already has submissions/);
  });

  it("does not block on a draft assessment, which nobody can have submitted to", async () => {
    const { classId } = await scenario(6);
    await query(
      `INSERT INTO assessments (class_id, name, status, opens_at, closes_at)
       VALUES ($1, 'Draft', 'draft', now(), now() + interval '7 days')`,
      [classId],
    );

    expect(await regroupingBlockedReason(classId)).toBeNull();
  });
});
