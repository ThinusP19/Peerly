import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closePool, query } from "../db/pool.ts";
import { DEFAULT_CONFIG } from "../lib/felder.ts";
import { resetDatabase } from "../test/helpers.ts";
import { closedAssessment } from "../test/scenarios.ts";
import { getAuditEntries } from "./audit.ts";
import { getResults, overrideMark, runCalculation } from "./results.ts";

/**
 * FR-24: "Recalculation shall not silently discard an override: present every
 * affected override and require the Lecturer to confirm retention or
 * withdrawal."
 */

beforeEach(resetDatabase);
afterAll(closePool);

const overrides = async (assessmentId: string) =>
  (
    await query<{ student_id: string; override_mark: string; calculated_mark: string }>(
      "SELECT student_id, override_mark, calculated_mark FROM mark_overrides WHERE assessment_id = $1",
      [assessmentId],
    )
  ).rows;

async function withOverride() {
  const scene = await closedAssessment();
  await runCalculation(scene.assessmentId, scene.user);
  await overrideMark(
    scene.assessmentId,
    scene.students[0]!,
    85,
    "Carried the final demo.",
    scene.user,
  );
  return scene;
}

/**
 * BR-06, found on xstin9's branch 2026-09-24.
 *
 * The guard refused a draft and let an open assessment through, and scope.md
 * recorded that as a known gap. It matters because marks calculated while an
 * assessment is open change as more students submit - a lecturer who published
 * them would have published figures that were already wrong.
 */
describe("only a closed assessment is calculated (BR-06)", () => {
  it("refuses an assessment that is still open", async () => {
    const { assessmentId, user } = await closedAssessment();
    await query("UPDATE assessments SET status = 'open' WHERE id = $1", [assessmentId]);

    await expect(runCalculation(assessmentId, user)).rejects.toThrow(/Close this assessment/);
  });

  it("refuses a draft, and says why in its own words", async () => {
    const { assessmentId, user } = await closedAssessment();
    await query("UPDATE assessments SET status = 'draft' WHERE id = $1", [assessmentId]);

    await expect(runCalculation(assessmentId, user)).rejects.toThrow(/hasn't opened yet/);
  });

  it("writes nothing when it refuses", async () => {
    const { assessmentId, user } = await closedAssessment();
    await query("UPDATE assessments SET status = 'open' WHERE id = $1", [assessmentId]);

    await expect(runCalculation(assessmentId, user)).rejects.toThrow();
    const { rows } = await query<{ n: string }>(
      "SELECT count(*) AS n FROM calculation_runs WHERE assessment_id = $1",
      [assessmentId],
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it("allows it once closed", async () => {
    const { assessmentId, user } = await closedAssessment();

    const summary = await runCalculation(assessmentId, user);
    expect(summary.students).toBeGreaterThan(0);
  });
});

describe("recalculating with overrides in place (FR-24)", () => {
  it("runs without asking when there are no overrides", async () => {
    const { assessmentId, user } = await closedAssessment();
    await runCalculation(assessmentId, user);
    await expect(runCalculation(assessmentId, user)).resolves.toMatchObject({ students: 3 });
  });

  it("refuses to recalculate until the lecturer chooses", async () => {
    const { assessmentId, user } = await withOverride();

    await expect(runCalculation(assessmentId, user)).rejects.toThrow(/keep or withdraw/);
    // Refused before anything changed.
    expect(await overrides(assessmentId)).toHaveLength(1);
  });

  it("keeps an override, bringing its calculated mark up to date", async () => {
    const { assessmentId, user, students } = await withOverride();
    await query("UPDATE group_marks SET base_mark = 60 WHERE assessment_id = $1", [assessmentId]);

    await runCalculation(assessmentId, user, "keep");

    const [kept] = await overrides(assessmentId);
    expect(Number(kept!.override_mark)).toBe(85);
    // The figure shown beside the override is the one now in force (BR-08).
    expect(Number(kept!.calculated_mark)).toBe(60);
    const row = (await getResults(assessmentId, user)).find((r) => r.studentId === students[0]);
    expect(row?.override?.mark).toBe(85);
  });

  it("withdraws every override when asked, and the calculated mark stands", async () => {
    const { assessmentId, user, students } = await withOverride();

    await runCalculation(assessmentId, user, "withdraw");

    expect(await overrides(assessmentId)).toHaveLength(0);
    const row = (await getResults(assessmentId, user)).find((r) => r.studentId === students[0]);
    expect(row?.override ?? null).toBeNull();
    expect(row?.finalMark).toBe(70);
  });

  it("audits what happened to each override", async () => {
    const { assessmentId, user } = await withOverride();

    await runCalculation(assessmentId, user, "withdraw");

    const entries = await getAuditEntries({ eventType: "mark.overridden" });
    expect(entries.some((e) => /withdrawn on recalculation/.test(e.detail))).toBe(true);
  });
});

describe("draft ratings stay private to the student (FR-16)", () => {
  it("are not shown in a lecturer's drill-down", async () => {
    const scene = await closedAssessment();
    await runCalculation(scene.assessmentId, scene.user);
    // Turn one evaluator's submission back into a draft.
    await query(
      "UPDATE submissions SET status = 'draft', submitted_at = NULL WHERE evaluator_id = $1",
      [scene.students[1]],
    );

    const row = (await getResults(scene.assessmentId, scene.user)).find(
      (r) => r.studentId === scene.students[0],
    );
    expect(row?.received.map((r) => r.evaluator.id)).not.toContain(scene.students[1]);
  });
});

describe("each run records what it used (OR-09)", () => {
  it("freezes the rating scale with the config", async () => {
    const { assessmentId, user } = await closedAssessment();
    await runCalculation(assessmentId, user);

    const { rows } = await query<{
      rule_version: string;
      config: {
        scale: Array<{ label: string; value: number }>;
        minFactor: number;
        roundTo: number;
      };
    }>("SELECT rule_version, config FROM calculation_runs WHERE assessment_id = $1", [
      assessmentId,
    ]);

    // Whatever the rules are, the run has to have stored the ones it used -
    // that is the point of OR-09, not any particular value. The values
    // themselves are asserted in the calculation's own tests.
    expect(rows[0]!.rule_version).toBe(DEFAULT_CONFIG.ruleVersion);
    expect(rows[0]!.config.minFactor).toBe(DEFAULT_CONFIG.minFactor);
    expect(rows[0]!.config.roundTo).toBe(DEFAULT_CONFIG.roundTo);
    expect(rows[0]!.config.scale[0]).toEqual({ label: "Excellent", value: 100 });
    expect(rows[0]!.config.scale.at(-1)).toEqual({ label: "No contribution", value: 59 });
  });
});

describe("the audit trail reads like a person wrote it", () => {
  it("writes marks as they are shown, not as the column stores them", async () => {
    const scene = await withOverride();

    const [entry] = await getAuditEntries({ eventType: "mark.overridden" });
    expect(entry!.detail).toMatch(/Mark overridden from \d+(\.\d)? to 85\./);
    expect(entry!.detail, "no stored-column padding such as 77.10").not.toMatch(/\.\d0\b/);
    expect(scene.assessmentId).toBeDefined();
  });
});
