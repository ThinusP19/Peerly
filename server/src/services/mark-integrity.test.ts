import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closePool, query } from "../db/pool.ts";
import { resetDatabase } from "../test/helpers.ts";
import { closedAssessment } from "../test/scenarios.ts";
import { changeAssessmentStatus, setGroupBaseMark, updateAssessment } from "./assessment-writes.ts";
import { getAssessment } from "./assessments.ts";
import { getAuditEntries } from "./audit.ts";
import { assessmentImpact, markResultsExported } from "./deletion.ts";
import { buildResultsWorkbook } from "./export.ts";
import {
  getResults,
  listOverrides,
  overrideMark,
  removeOverride,
  runCalculation,
} from "./results.ts";

/**
 * The rules that keep a mark on an academic record honest, from the
 * 26 September QA pass: a mark never above the maximum (BR-07), recorded to one
 * decimal place (IS-06), and never served as current once what it was
 * calculated from has changed (FR-13).
 */

beforeEach(resetDatabase);
afterAll(closePool);

const groupOf = async (assessmentId: string) =>
  (
    await query<{ group_id: string }>(
      "SELECT group_id FROM assessment_groups WHERE assessment_id = $1",
      [assessmentId],
    )
  ).rows[0]!.group_id;

/** Everyone rates students[0] Excellent and everyone else No contribution. */
async function oneStarStudent(scene: Awaited<ReturnType<typeof closedAssessment>>) {
  const { rows: options } = await query<{ id: string }>(
    "SELECT id FROM rating_options ORDER BY display_order",
  );
  await query(
    `UPDATE peer_ratings SET rating_option_id = CASE WHEN evaluated_id = $2 THEN $3::uuid ELSE $4::uuid END
      WHERE assessment_id = $1`,
    [scene.assessmentId, scene.students[0], options[0]!.id, options.at(-1)!.id],
  );
}

describe("a calculated mark never exceeds the maximum (BR-07)", () => {
  it("caps the mark, flags it, and freezes the maximum with the run", async () => {
    const scene = await closedAssessment();
    await oneStarStudent(scene);
    await query("UPDATE group_marks SET base_mark = 95 WHERE assessment_id = $1", [
      scene.assessmentId,
    ]);

    await runCalculation(scene.assessmentId, scene.user);

    const results = await getResults(scene.assessmentId, scene.user);
    const star = results.find((r) => r.studentId === scene.students[0])!;
    expect(star.adjustmentFactor).toBe(1.1);
    expect(star.finalMark).toBe(100);
    expect(star.flags).toContain("capped-at-maximum");
    expect(Math.max(...results.map((r) => r.finalMark ?? 0))).toBeLessThanOrEqual(100);

    const { rows } = await query<{ config: { maxMark: number } }>(
      "SELECT config FROM calculation_runs WHERE assessment_id = $1",
      [scene.assessmentId],
    );
    expect(rows[0]!.config.maxMark).toBe(100);
  });

  it("is refused by the database as well", async () => {
    const scene = await closedAssessment();
    await runCalculation(scene.assessmentId, scene.user);

    await expect(
      query("UPDATE calculated_results SET final_mark = 104.5 WHERE assessment_id = $1", [
        scene.assessmentId,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
  });
});

describe("marks have at most one decimal place (IS-06)", () => {
  it("refuses a base mark with two or three decimals, and stores nothing", async () => {
    const { assessmentId, user } = await closedAssessment();
    const groupId = await groupOf(assessmentId);

    for (const value of [70.25, 62.345, 0.001]) {
      await expect(setGroupBaseMark(assessmentId, groupId, value, user)).rejects.toMatchObject({
        status: 400,
        fields: { baseMark: expect.stringMatching(/one decimal place/) },
      });
    }
    const { rows } = await query<{ base_mark: string }>(
      "SELECT base_mark FROM group_marks WHERE assessment_id = $1",
      [assessmentId],
    );
    expect(Number(rows[0]!.base_mark)).toBe(70);
  });

  it("accepts whole numbers and one decimal, and audits exactly what was stored", async () => {
    const { assessmentId, user } = await closedAssessment();
    const groupId = await groupOf(assessmentId);

    await setGroupBaseMark(assessmentId, groupId, 60.3, user);

    const [entry] = await getAuditEntries({ eventType: "marks.entered" });
    expect(entry!.detail).toContain("set to 60.3 out of 100");
  });

  it("refuses an override with more than one decimal", async () => {
    const { assessmentId, user, students } = await closedAssessment();
    await runCalculation(assessmentId, user);

    for (const value of [60.55, 60.255, 99.999]) {
      await expect(
        overrideMark(assessmentId, students[0]!, value, "Reason.", user),
      ).rejects.toMatchObject({ status: 400, fields: { mark: expect.any(String) } });
    }
    expect(await listOverrides(assessmentId, user)).toEqual([]);
    expect(await getAuditEntries({ eventType: "mark.overridden" })).toHaveLength(0);
  });

  it("is enforced by the database for a direct write", async () => {
    const { assessmentId, user, students } = await closedAssessment();
    await runCalculation(assessmentId, user);

    await expect(
      query("UPDATE group_marks SET base_mark = 70.25 WHERE assessment_id = $1", [assessmentId]),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      query(
        `INSERT INTO mark_overrides
           (assessment_id, student_id, calculated_mark, override_mark, reason, overridden_by)
         VALUES ($1, $2, 70, 60.55, 'Reason.', $3)`,
        [assessmentId, students[0], user.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("will not calculate from a two-decimal base mark stored before the rule", async () => {
    const { assessmentId, user } = await closedAssessment();
    await query("ALTER TABLE group_marks DISABLE TRIGGER group_marks_follow_the_rules");
    try {
      await query("UPDATE group_marks SET base_mark = 70.25 WHERE assessment_id = $1", [
        assessmentId,
      ]);
    } finally {
      await query("ALTER TABLE group_marks ENABLE TRIGGER group_marks_follow_the_rules");
    }

    await expect(runCalculation(assessmentId, user)).rejects.toThrow(/more than one decimal/);
  });
});

describe("changing a base mark after calculating (FR-13)", () => {
  it("makes the calculated marks out of date until they are calculated again", async () => {
    const { assessmentId, user, students } = await closedAssessment();
    await runCalculation(assessmentId, user);
    const groupId = await groupOf(assessmentId);

    const outcome = await setGroupBaseMark(assessmentId, groupId, 65, user);

    expect(outcome.invalidatedCalculation).toBe(true);
    const assessment = await getAssessment(assessmentId, user);
    expect(assessment.calculatedAt).toBeUndefined();
    expect(assessment.calculationRunId).toBeUndefined();
    expect(await getResults(assessmentId, user)).toEqual([]);
    await expect(buildResultsWorkbook(assessmentId, user)).rejects.toThrow(/Calculate the marks/);
    await expect(overrideMark(assessmentId, students[0]!, 60, "Reason.", user)).rejects.toThrow(
      /out of date/,
    );

    const [entry] = await getAuditEntries({ eventType: "marks.entered" });
    expect(entry!.detail).toContain("out of date");

    await runCalculation(assessmentId, user);
    const [row] = await getResults(assessmentId, user);
    expect(row!.baseMark).toBe(65);
  });

  it("leaves the calculation alone when the mark did not change", async () => {
    const { assessmentId, user } = await closedAssessment();
    await runCalculation(assessmentId, user);
    const groupId = await groupOf(assessmentId);

    const outcome = await setGroupBaseMark(assessmentId, groupId, 70, user);

    expect(outcome.invalidatedCalculation).toBe(false);
    expect((await getAssessment(assessmentId, user)).calculatedAt).toBeDefined();
  });
});

describe("a base mark that did not change is not a write", () => {
  it("records no audit entry for the same value", async () => {
    const { assessmentId, user } = await closedAssessment();
    const groupId = await groupOf(assessmentId);

    await setGroupBaseMark(assessmentId, groupId, 70, user);

    expect(await getAuditEntries({ eventType: "marks.entered" })).toHaveLength(0);
  });

  it("records no 'cleared' entry for a box that never held a mark", async () => {
    const { assessmentId, user } = await closedAssessment();
    const groupId = await groupOf(assessmentId);
    await query("DELETE FROM group_marks WHERE assessment_id = $1", [assessmentId]);

    await setGroupBaseMark(assessmentId, groupId, null, user);

    expect(await getAuditEntries({ eventType: "marks.entered" })).toHaveLength(0);
    const { rows } = await query("SELECT 1 FROM group_marks WHERE assessment_id = $1", [
      assessmentId,
    ]);
    expect(rows).toHaveLength(0);
  });
});

describe("after re-opening (FR-13)", () => {
  it("serves no results, refuses an override, and still lists the overrides", async () => {
    const { assessmentId, user, students } = await closedAssessment();
    await runCalculation(assessmentId, user);
    await overrideMark(assessmentId, students[0]!, 80, "Carried the demo.", user);

    await changeAssessmentStatus(assessmentId, "reopen", user);

    expect(await getResults(assessmentId, user)).toEqual([]);
    await expect(overrideMark(assessmentId, students[1]!, 60, "Reason.", user)).rejects.toThrow(
      /out of date/,
    );
    // What a recalculation will ask about is still there to ask about.
    expect(await listOverrides(assessmentId, user)).toMatchObject([
      { studentId: students[0], mark: 80, reason: "Carried the demo." },
    ]);
  });
});

describe("changing the maximum mark (BR-07)", () => {
  it("refuses to lower it below a base mark already entered", async () => {
    const { assessmentId, user } = await closedAssessment();

    await expect(updateAssessment(assessmentId, { maxMark: 50 }, user)).rejects.toMatchObject({
      status: 400,
      fields: { maxMark: expect.stringMatching(/70/) },
    });
    expect((await getAssessment(assessmentId, user)).maxMark).toBe(100);
  });

  it("refuses to lower it below an override", async () => {
    const { assessmentId, user, students } = await closedAssessment();
    await runCalculation(assessmentId, user);
    await overrideMark(assessmentId, students[0]!, 90, "Carried the demo.", user);

    await expect(updateAssessment(assessmentId, { maxMark: 80 }, user)).rejects.toThrow(/90/);
  });

  it("is refused by the database as well", async () => {
    const { assessmentId } = await closedAssessment();

    await expect(
      query("UPDATE assessments SET max_mark = 50 WHERE id = $1", [assessmentId]),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("allows a maximum that stays above every mark, and asks for a recalculation", async () => {
    const { assessmentId, user } = await closedAssessment();
    await runCalculation(assessmentId, user);

    const updated = await updateAssessment(assessmentId, { maxMark: 80 }, user);

    expect(updated.maxMark).toBe(80);
    expect(updated.calculatedAt).toBeUndefined();
    expect(await getResults(assessmentId, user)).toEqual([]);
  });

  it("leaves the calculation alone when the maximum did not change", async () => {
    const { assessmentId, user } = await closedAssessment();
    await runCalculation(assessmentId, user);

    const updated = await updateAssessment(assessmentId, { maxMark: 100, name: "Renamed" }, user);

    expect(updated.calculatedAt).toBeDefined();
  });
});

describe("removing one override (FR-24)", () => {
  it("restores the calculated mark for that student only, with the reason audited", async () => {
    const { assessmentId, user, students } = await closedAssessment();
    await runCalculation(assessmentId, user);
    await overrideMark(assessmentId, students[0]!, 80, "Carried the demo.", user);
    await overrideMark(assessmentId, students[1]!, 60, "Missed the demo.", user);

    await removeOverride(assessmentId, students[0]!, "Overrode the wrong student.", user);

    const results = await getResults(assessmentId, user);
    expect(results.find((r) => r.studentId === students[0])?.override).toBeUndefined();
    expect(results.find((r) => r.studentId === students[1])?.override?.mark).toBe(60);

    const [entry] = await getAuditEntries({ eventType: "mark.overridden" });
    expect(entry!.detail).toContain("removed");
    expect(entry!.detail).toContain("Overrode the wrong student.");
  });

  it("needs a reason", async () => {
    const { assessmentId, user, students } = await closedAssessment();
    await runCalculation(assessmentId, user);
    await overrideMark(assessmentId, students[0]!, 80, "Carried the demo.", user);

    await expect(removeOverride(assessmentId, students[0]!, "  ", user)).rejects.toMatchObject({
      status: 400,
    });
    expect(await listOverrides(assessmentId, user)).toHaveLength(1);
  });

  it("says so when there is nothing to remove", async () => {
    const { assessmentId, user, students } = await closedAssessment();
    await runCalculation(assessmentId, user);

    await expect(removeOverride(assessmentId, students[0]!, "Reason.", user)).rejects.toMatchObject(
      { status: 409 },
    );
  });
});

describe("an export only counts for the marks it carried (FR-28)", () => {
  it("is reset by a recalculation", async () => {
    const { assessmentId, user } = await closedAssessment();
    await runCalculation(assessmentId, user);
    await markResultsExported(assessmentId, user);
    expect((await assessmentImpact(assessmentId, user)).unexportedAssessments).toEqual([]);

    await runCalculation(assessmentId, user);

    expect((await getAssessment(assessmentId, user)).exportedAt).toBeUndefined();
    expect((await assessmentImpact(assessmentId, user)).unexportedAssessments).toHaveLength(1);
  });

  it("is reset by an override", async () => {
    const { assessmentId, user, students } = await closedAssessment();
    await runCalculation(assessmentId, user);
    await markResultsExported(assessmentId, user);

    await overrideMark(assessmentId, students[0]!, 80, "Carried the demo.", user);

    expect((await getAssessment(assessmentId, user)).exportedAt).toBeUndefined();
  });
});
