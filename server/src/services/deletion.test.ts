import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closePool, query } from "../db/pool.ts";
import type { SessionUser } from "../domain/types.ts";
import { createUser, resetDatabase } from "../test/helpers.ts";
import { getAuditEntries } from "./audit.ts";
import {
  assessmentImpact,
  classImpact,
  deleteAssessment,
  deleteClass,
  markResultsExported,
} from "./deletion.ts";
import { getConflictCandidates, resolveEnrolmentConflict } from "./enrolments.ts";

/** FR-04, FR-25, FR-28. */

beforeEach(resetDatabase);
afterAll(closePool);

async function scenario() {
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
  const { rows: cls } = await query<{ id: string }>(
    `INSERT INTO classes (module_code, name, academic_period, lecturer_id)
     VALUES ('CMPG323', 'Test', '2026 S2', $1) RETURNING id`,
    [account.id],
  );
  const classId = cls[0]!.id;

  const students: string[] = [];
  const { rows: grp } = await query<{ id: string }>(
    "INSERT INTO groups (class_id, group_number) VALUES ($1, 1) RETURNING id",
    [classId],
  );
  for (let i = 0; i < 3; i += 1) {
    const s = await createUser({ role: "student", studentNumber: String(41200345 + i) });
    await query("INSERT INTO group_members (group_id, class_id, student_id) VALUES ($1,$2,$3)", [
      grp[0]!.id,
      classId,
      s.id,
    ]);
    await query(
      `INSERT INTO enrolments (class_id, student_number, imported_name, imported_surname, match_status, user_id)
       VALUES ($1, $2, 'Test', 'Person', 'matched', $3)`,
      [classId, String(41200345 + i), s.id],
    );
    students.push(s.id);
  }

  const { rows: asm } = await query<{ id: string }>(
    `INSERT INTO assessments (class_id, name, status, opens_at, closes_at)
     VALUES ($1, 'Phase 2', 'closed', now() - interval '9 days', now() - interval '1 day')
     RETURNING id`,
    [classId],
  );
  await query(
    "INSERT INTO assessment_groups (assessment_id, group_id, class_id) VALUES ($1,$2,$3)",
    [asm[0]!.id, grp[0]!.id, classId],
  );

  const { rows: options } = await query<{ id: string }>(
    "SELECT id FROM rating_options ORDER BY display_order LIMIT 1",
  );
  const { rows: sub } = await query<{ id: string }>(
    `INSERT INTO submissions (assessment_id, evaluator_id, status, submitted_at)
     VALUES ($1, $2, 'submitted', now()) RETURNING id`,
    [asm[0]!.id, students[0]!],
  );
  await query(
    `INSERT INTO peer_ratings (submission_id, assessment_id, group_id, evaluator_id, evaluated_id, rating_option_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [sub[0]!.id, asm[0]!.id, grp[0]!.id, students[0]!, students[1]!, options[0]!.id],
  );

  return { user, classId, assessmentId: asm[0]!.id, students, groupId: grp[0]!.id };
}

describe("deletion impact (FR-28)", () => {
  it("counts what an assessment would take with it", async () => {
    const { user, assessmentId } = await scenario();

    const impact = await assessmentImpact(assessmentId, user);
    expect(impact).toMatchObject({ submissions: 1, ratings: 1, assessments: 1 });
  });

  it("flags results that were never exported, since deleting loses the only copy", async () => {
    const { user, assessmentId } = await scenario();

    expect((await assessmentImpact(assessmentId, user)).unexportedAssessments).toEqual(["Phase 2"]);
  });

  it("stops flagging it once the results have been exported (FR-25)", async () => {
    const { user, assessmentId } = await scenario();
    await markResultsExported(assessmentId, user);

    expect((await assessmentImpact(assessmentId, user)).unexportedAssessments).toEqual([]);
  });

  it("does not flag an assessment nobody submitted to - there is nothing to lose", async () => {
    const { user, classId } = await scenario();
    const { rows } = await query<{ id: string }>(
      `INSERT INTO assessments (class_id, name, status, opens_at, closes_at)
       VALUES ($1, 'Empty', 'draft', now(), now() + interval '1 day') RETURNING id`,
      [classId],
    );

    expect((await assessmentImpact(rows[0]!.id, user)).unexportedAssessments).toEqual([]);
  });

  it("counts everything a class would take with it", async () => {
    const { user, classId } = await scenario();

    const impact = await classImpact(classId, user);
    expect(impact).toMatchObject({
      assessments: 1,
      enrolments: 3,
      groups: 1,
      submissions: 1,
      ratings: 1,
    });
    expect(impact.unexportedAssessments).toEqual(["Phase 2"]);
  });
});

describe("deleteAssessment (FR-28)", () => {
  it("removes it along with its submissions and ratings", async () => {
    const { user, assessmentId } = await scenario();
    await deleteAssessment(assessmentId, user);

    for (const table of ["assessments", "submissions", "peer_ratings"]) {
      const { rows } = await query(`SELECT 1 FROM ${table}`);
      expect(rows, table).toHaveLength(0);
    }
  });

  it("leaves the class and its groups alone", async () => {
    const { user, assessmentId } = await scenario();
    await deleteAssessment(assessmentId, user);

    const { rows } = await query("SELECT 1 FROM groups");
    expect(rows).toHaveLength(1);
  });

  it("keeps the record that it happened, after the thing is gone (FR-27)", async () => {
    const { user, assessmentId } = await scenario();
    await deleteAssessment(assessmentId, user);

    const [entry] = await getAuditEntries();
    expect(entry!.eventType).toBe("assessment.deleted");
    expect(entry!.detail).toContain("1 submission(s)");
    expect(entry!.detail).toContain("never exported");
  });

  it("refuses another lecturer", async () => {
    const { assessmentId } = await scenario();
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

    await expect(deleteAssessment(assessmentId, intruder)).rejects.toMatchObject({ status: 404 });
  });
});

describe("deleteClass (FR-28)", () => {
  it("removes the class and everything under it", async () => {
    const { user, classId } = await scenario();
    await deleteClass(classId, user);

    for (const table of ["classes", "enrolments", "groups", "assessments", "peer_ratings"]) {
      const { rows } = await query(`SELECT 1 FROM ${table}`);
      expect(rows, table).toHaveLength(0);
    }
  });

  it("does not delete the student accounts themselves", async () => {
    const { user, classId } = await scenario();
    await deleteClass(classId, user);

    const { rows } = await query("SELECT 1 FROM users WHERE role = 'student'");
    expect(rows).toHaveLength(3);
  });

  it("keeps the audit entry, which has no foreign key to cascade through", async () => {
    const { user, classId } = await scenario();
    await deleteClass(classId, user);

    const [entry] = await getAuditEntries();
    expect(entry!.eventType).toBe("class.deleted");
    expect(entry!.detail).toContain("3 enrolment(s)");
  });
});

describe("resolveEnrolmentConflict (FR-04)", () => {
  const withConflict = async () => {
    const s = await scenario();
    const student = await createUser({ role: "student", studentNumber: "41209999" });
    const { rows } = await query<{ id: string }>(
      `INSERT INTO enrolments (class_id, student_number, imported_name, imported_surname, match_status, match_note)
       VALUES ($1, '41209999', 'Lwazi', 'Dube', 'conflict', 'Needs checking.') RETURNING id`,
      [s.classId],
    );
    return { ...s, enrolmentId: rows[0]!.id, candidateId: student.id };
  };

  it("offers accounts holding that student number", async () => {
    const { user, enrolmentId, candidateId } = await withConflict();

    const candidates = await getConflictCandidates(enrolmentId, user);
    expect(candidates.map((c) => c.id)).toEqual([candidateId]);
  });

  it("links the account the lecturer chose", async () => {
    const { user, enrolmentId, candidateId } = await withConflict();
    await resolveEnrolmentConflict(enrolmentId, { kind: "link", userId: candidateId }, user);

    const { rows } = await query<{
      match_status: string;
      user_id: string;
      match_note: string | null;
    }>("SELECT match_status, user_id, match_note FROM enrolments WHERE id = $1", [enrolmentId]);
    expect(rows[0]).toMatchObject({ match_status: "matched", user_id: candidateId });
    expect(rows[0]!.match_note).toBeNull();
  });

  it("records leaving it unmatched as a resolution in its own right", async () => {
    const { user, enrolmentId } = await withConflict();
    await resolveEnrolmentConflict(enrolmentId, { kind: "leave-unmatched" }, user);

    const { rows } = await query<{ match_status: string; match_note: string }>(
      "SELECT match_status, match_note FROM enrolments WHERE id = $1",
      [enrolmentId],
    );
    expect(rows[0]!.match_status).toBe("unmatched");
    expect(rows[0]!.match_note).toContain("reviewed");
  });

  it("refuses a row that has no conflict", async () => {
    const { user, classId } = await scenario();
    const { rows } = await query<{ id: string }>(
      "SELECT id FROM enrolments WHERE class_id = $1 LIMIT 1",
      [classId],
    );

    await expect(
      resolveEnrolmentConflict(rows[0]!.id, { kind: "leave-unmatched" }, user),
    ).rejects.toThrow(/no longer has a conflict/);
  });

  it("refuses another lecturer's enrolment", async () => {
    const { enrolmentId } = await withConflict();
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

    await expect(getConflictCandidates(enrolmentId, intruder)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("records the decision, with what it was and what it became (FR-27)", async () => {
    const { user, enrolmentId, candidateId } = await withConflict();
    await resolveEnrolmentConflict(enrolmentId, { kind: "link", userId: candidateId }, user);

    const [entry] = await getAuditEntries();
    expect(entry!.eventType).toBe("enrolment.resolved");
    expect(entry!.detail).toContain("Linked to");
  });
});
