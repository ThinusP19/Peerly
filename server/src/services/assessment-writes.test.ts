import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closePool, query } from "../db/pool.ts";
import type { SessionUser } from "../domain/types.ts";
import { createUser, resetDatabase } from "../test/helpers.ts";
import { getAuditEntries } from "./audit.ts";
import {
  changeAssessmentStatus,
  createAssessment,
  setGroupBaseMark,
  updateAssessment,
} from "./assessment-writes.ts";

/** FR-12, FR-13, FR-21 - and the audit entry each one leaves behind (FR-27). */

beforeEach(resetDatabase);
afterAll(closePool);

async function scenario() {
  const account = await createUser({ role: "lecturer", name: "Anneke", surname: "van der Merwe" });
  const user: SessionUser = {
    id: account.id,
    role: "lecturer",
    name: "Anneke",
    surname: "van der Merwe",
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

  const groupIds: string[] = [];
  for (let g = 1; g <= 2; g += 1) {
    const { rows } = await query<{ id: string }>(
      "INSERT INTO groups (class_id, group_number) VALUES ($1, $2) RETURNING id",
      [classId, g],
    );
    groupIds.push(rows[0]!.id);
  }

  return { user, classId, groupIds };
}

const times = {
  opensAt: "2026-10-01T08:00:00.000Z",
  closesAt: "2026-10-14T20:00:00.000Z",
};

describe("createAssessment", () => {
  it("creates it as a draft, never straight to open (FR-12)", async () => {
    const { user, classId, groupIds } = await scenario();

    const assessment = await createAssessment(
      { classId, name: "Phase 2", groupIds, ...times },
      user,
    );
    expect(assessment.status).toBe("draft");
    expect(assessment.groupIds).toHaveLength(2);
  });

  it("refuses a closing time before the opening time", async () => {
    const { user, classId, groupIds } = await scenario();

    await expect(
      createAssessment(
        { classId, name: "Phase 2", groupIds, opensAt: times.closesAt, closesAt: times.opensAt },
        user,
      ),
    ).rejects.toMatchObject({ fields: { closesAt: expect.any(String) } });
  });

  it("refuses an assessment with no groups", async () => {
    const { user, classId } = await scenario();

    await expect(
      createAssessment({ classId, name: "Phase 2", groupIds: [], ...times }, user),
    ).rejects.toThrow(/at least one group/);
  });

  it("refuses a group from another lecturer's class", async () => {
    // The composite foreign key is what actually stops this; the test proves a
    // hand-made request cannot get past it.
    const { user, classId } = await scenario();
    const other = await createUser({ role: "lecturer" });
    const { rows: theirClass } = await query<{ id: string }>(
      `INSERT INTO classes (module_code, name, academic_period, lecturer_id)
       VALUES ('CMPG315', 'Theirs', '2026 S2', $1) RETURNING id`,
      [other.id],
    );
    const { rows: theirGroup } = await query<{ id: string }>(
      "INSERT INTO groups (class_id, group_number) VALUES ($1, 1) RETURNING id",
      [theirClass[0]!.id],
    );

    await expect(
      createAssessment({ classId, name: "Phase 2", groupIds: [theirGroup[0]!.id], ...times }, user),
    ).rejects.toThrow();
  });

  it("refuses another lecturer's class outright", async () => {
    const { classId, groupIds } = await scenario();
    const intruderAccount = await createUser({ role: "lecturer" });
    const intruder: SessionUser = {
      id: intruderAccount.id,
      role: "lecturer",
      name: "X",
      surname: "Y",
      email: intruderAccount.email,
      studentNumber: null,
      status: "active",
      createdAt: new Date().toISOString(),
    };

    await expect(
      createAssessment({ classId, name: "Phase 2", groupIds, ...times }, intruder),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("writes an audit entry naming the lecturer (FR-27)", async () => {
    const { user, classId, groupIds } = await scenario();
    await createAssessment({ classId, name: "Phase 2", groupIds, ...times }, user);

    const [entry] = await getAuditEntries();
    expect(entry).toMatchObject({
      eventType: "assessment.created",
      actorName: "Anneke van der Merwe",
    });
    expect(entry!.objectDescription).toContain("CMPG323");
  });

  it("leaves no audit entry when the write fails (OR-05)", async () => {
    const { user, classId } = await scenario();
    await expect(
      createAssessment(
        { classId, name: "Phase 2", groupIds: ["00000000-0000-0000-0000-000000000000"], ...times },
        user,
      ),
    ).rejects.toThrow();

    expect(await getAuditEntries()).toHaveLength(0);
  });
});

describe("changeAssessmentStatus (FR-13)", () => {
  const make = async () => {
    const s = await scenario();
    const assessment = await createAssessment(
      { classId: s.classId, name: "Phase 2", groupIds: s.groupIds, ...times },
      s.user,
    );
    return { ...s, assessmentId: assessment.id };
  };

  it("opens a draft", async () => {
    const { user, assessmentId } = await make();

    const { assessment } = await changeAssessmentStatus(assessmentId, "open", user);
    expect(assessment.status).toBe("open");
  });

  it("closes an open assessment", async () => {
    const { user, assessmentId } = await make();
    await changeAssessmentStatus(assessmentId, "open", user);

    const { assessment } = await changeAssessmentStatus(assessmentId, "close", user);
    expect(assessment.status).toBe("closed");
  });

  it("refuses to open something that is already open", async () => {
    const { user, assessmentId } = await make();
    await changeAssessmentStatus(assessmentId, "open", user);

    await expect(changeAssessmentStatus(assessmentId, "open", user)).rejects.toThrow(/draft/);
  });

  it("refuses to close a draft, which never opened", async () => {
    const { user, assessmentId } = await make();

    await expect(changeAssessmentStatus(assessmentId, "close", user)).rejects.toThrow(/open/);
  });

  it("reports that re-opening invalidated a calculation, and clears it", async () => {
    const { user, assessmentId } = await make();
    await changeAssessmentStatus(assessmentId, "open", user);
    await changeAssessmentStatus(assessmentId, "close", user);
    await query("UPDATE assessments SET calculated_at = now() WHERE id = $1", [assessmentId]);

    const result = await changeAssessmentStatus(assessmentId, "reopen", user);
    expect(result.invalidatedCalculation).toBe(true);
    expect(result.assessment.calculatedAt).toBeUndefined();
  });

  it("does not claim to invalidate a calculation that never ran", async () => {
    const { user, assessmentId } = await make();
    await changeAssessmentStatus(assessmentId, "open", user);
    await changeAssessmentStatus(assessmentId, "close", user);

    const result = await changeAssessmentStatus(assessmentId, "reopen", user);
    expect(result.invalidatedCalculation).toBe(false);
  });

  it("records each transition with its before and after state", async () => {
    const { user, assessmentId } = await make();
    await changeAssessmentStatus(assessmentId, "open", user);

    const [entry] = await getAuditEntries({ eventType: "assessment.opened" });
    expect(entry!.detail).toContain("draft to open");
  });
});

describe("updateAssessment", () => {
  const make = async () => {
    const s = await scenario();
    const assessment = await createAssessment(
      { classId: s.classId, name: "Phase 2", groupIds: s.groupIds, ...times },
      s.user,
    );
    return { ...s, assessmentId: assessment.id };
  };

  it("extends the closing time and records both times (FR-13)", async () => {
    const { user, assessmentId } = await make();
    const later = "2026-10-21T20:00:00.000Z";

    const updated = await updateAssessment(assessmentId, { closesAt: later }, user);
    expect(updated.closesAt).toBe(later);

    const [entry] = await getAuditEntries({ eventType: "assessment.updated" });
    expect(entry!.detail).toContain(times.closesAt);
    expect(entry!.detail).toContain(later);
  });

  it("refuses to change the groups once it has opened", async () => {
    const { user, assessmentId, groupIds } = await make();
    await changeAssessmentStatus(assessmentId, "open", user);

    await expect(
      updateAssessment(assessmentId, { groupIds: [groupIds[0]!] }, user),
    ).rejects.toThrow(/can't be changed once an assessment has opened/);
  });

  it("allows the groups to change while it is still a draft", async () => {
    const { user, assessmentId, groupIds } = await make();

    const updated = await updateAssessment(assessmentId, { groupIds: [groupIds[0]!] }, user);
    expect(updated.groupIds).toEqual([groupIds[0]]);
  });

  /**
   * FR-27 is "every write", and this used to record only a moved closing time.
   * A rename, a different maximum mark, a new opening time and a change to the
   * participating groups all happened with no entry at all - and the last two
   * decide who is assessed and what their mark is out of.
   */
  describe("every change reaches the audit trail (FR-27)", () => {
    it("records a rename, with the name it had before", async () => {
      const { user, assessmentId } = await make();

      await updateAssessment(assessmentId, { name: "Phase 2 - revised" }, user);

      const [entry] = await getAuditEntries({ eventType: "assessment.updated" });
      expect(entry, "a rename must leave an entry").toBeDefined();
      expect(entry!.detail).toContain("Phase 2");
      expect(entry!.objectDescription).toContain("Phase 2 - revised");
    });

    it("records a change to the maximum mark", async () => {
      const { user, assessmentId } = await make();

      await updateAssessment(assessmentId, { maxMark: 50 }, user);

      const [entry] = await getAuditEntries({ eventType: "assessment.updated" });
      expect(entry, "a changed maximum mark must leave an entry").toBeDefined();
      expect(entry!.detail).toMatch(/Maximum mark changed from 100 to 50/);
    });

    it("records a change to which groups take part", async () => {
      const { user, assessmentId, groupIds } = await make();

      await updateAssessment(assessmentId, { groupIds: [groupIds[0]!] }, user);

      const [entry] = await getAuditEntries({ eventType: "assessment.updated" });
      expect(entry, "changing who is assessed must leave an entry").toBeDefined();
      expect(entry!.detail).toMatch(/Participating groups changed/);
    });

    it("names every field when several move at once, in one entry", async () => {
      const { user, assessmentId } = await make();

      await updateAssessment(
        assessmentId,
        { name: "Renamed", maxMark: 75, closesAt: "2026-10-21T20:00:00.000Z" },
        user,
      );

      const entries = await getAuditEntries({ eventType: "assessment.updated" });
      expect(entries).toHaveLength(1);
      expect(entries[0]!.detail).toContain("Renamed from");
      expect(entries[0]!.detail).toContain("Maximum mark changed");
      expect(entries[0]!.detail).toContain("Closing time changed");
    });

    it("writes nothing when a save changes nothing", async () => {
      const { user, assessmentId } = await make();

      await updateAssessment(assessmentId, { name: "Phase 2" }, user);

      expect(await getAuditEntries({ eventType: "assessment.updated" })).toHaveLength(0);
    });
  });
});

describe("setGroupBaseMark (FR-21)", () => {
  const make = async () => {
    const s = await scenario();
    const assessment = await createAssessment(
      { classId: s.classId, name: "Phase 2", groupIds: s.groupIds, ...times },
      s.user,
    );
    return { ...s, assessmentId: assessment.id };
  };

  it("records a mark", async () => {
    const { user, assessmentId, groupIds } = await make();
    await setGroupBaseMark(assessmentId, groupIds[0]!, 72.5, user);

    const { rows } = await query<{ base_mark: string }>(
      "SELECT base_mark FROM group_marks WHERE group_id = $1",
      [groupIds[0]],
    );
    expect(Number(rows[0]!.base_mark)).toBe(72.5);
  });

  it("refuses a mark above the maximum", async () => {
    const { user, assessmentId, groupIds } = await make();

    await expect(setGroupBaseMark(assessmentId, groupIds[0]!, 101, user)).rejects.toThrow(
      /between 0 and 100/,
    );
  });

  it("refuses a negative mark", async () => {
    const { user, assessmentId, groupIds } = await make();

    await expect(setGroupBaseMark(assessmentId, groupIds[0]!, -1, user)).rejects.toThrow();
  });

  it("accepts zero, which is a mark the group earned", async () => {
    const { user, assessmentId, groupIds } = await make();
    await setGroupBaseMark(assessmentId, groupIds[0]!, 0, user);

    const { rows } = await query<{ base_mark: string | null }>(
      "SELECT base_mark FROM group_marks WHERE group_id = $1",
      [groupIds[0]],
    );
    expect(Number(rows[0]!.base_mark)).toBe(0);
  });

  it("treats null as cleared, which is not zero", async () => {
    const { user, assessmentId, groupIds } = await make();
    await setGroupBaseMark(assessmentId, groupIds[0]!, 65, user);
    await setGroupBaseMark(assessmentId, groupIds[0]!, null, user);

    const { rows } = await query<{ base_mark: string | null }>(
      "SELECT base_mark FROM group_marks WHERE group_id = $1",
      [groupIds[0]],
    );
    expect(rows[0]!.base_mark).toBeNull();
  });

  it("overwrites rather than accumulating rows", async () => {
    const { user, assessmentId, groupIds } = await make();
    await setGroupBaseMark(assessmentId, groupIds[0]!, 65, user);
    await setGroupBaseMark(assessmentId, groupIds[0]!, 70, user);

    const { rows } = await query("SELECT 1 FROM group_marks WHERE group_id = $1", [groupIds[0]]);
    expect(rows).toHaveLength(1);
  });

  it("keeps what the mark was before it changed (OR-09)", async () => {
    const { user, assessmentId, groupIds } = await make();
    await setGroupBaseMark(assessmentId, groupIds[0]!, 65, user);
    await setGroupBaseMark(assessmentId, groupIds[0]!, 70, user);

    const { rows } = await query<{ before_state: { baseMark: number | null } }>(
      "SELECT before_state FROM audit_entries WHERE event_type = 'marks.entered' ORDER BY id DESC LIMIT 1",
    );
    expect(rows[0]!.before_state).toEqual({ baseMark: 65 });
  });

  it("refuses a group that takes no part in the assessment", async () => {
    const { user, assessmentId, classId } = await make();
    const { rows } = await query<{ id: string }>(
      "INSERT INTO groups (class_id, group_number) VALUES ($1, 99) RETURNING id",
      [classId],
    );

    await expect(setGroupBaseMark(assessmentId, rows[0]!.id, 65, user)).rejects.toMatchObject({
      status: 404,
    });
  });
});
