import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { closePool, query } from "../db/pool.ts";
import type { SessionUser } from "../domain/types.ts";
import { DEFAULT_CONFIG } from "../lib/felder.ts";
import { createUser, resetDatabase } from "../test/helpers.ts";
import { closedAssessment } from "../test/scenarios.ts";
import { getAssessment } from "./assessments.ts";
import { getAuditEntries } from "./audit.ts";
import { getResults, runCalculation } from "./results.ts";
import {
  getAssessmentScale,
  getDefaultScale,
  updateAssessmentScale,
  updateDefaultScale,
  type Scale,
  type ScaleChanges,
} from "./scale.ts";

/**
 * OR-19, on client feedback 2026-10-10: the hidden values and the factor
 * limits can be changed - system-wide by an administrator, and for one
 * assessment by its lecturer. Changing them changes marks, so these tests
 * check the marks themselves, by hand, not only that a value was stored.
 */

let original: Array<{ id: string; hidden_value: string }> = [];

beforeAll(async () => {
  original = (
    await query<{ id: string; hidden_value: string }>("SELECT id, hidden_value FROM rating_options")
  ).rows;
});
beforeEach(resetDatabase);
// rating_options is configuration that resetDatabase deliberately keeps, so a
// test that changes the system values puts them back.
afterEach(async () => {
  for (const row of original) {
    await query("UPDATE rating_options SET hidden_value = $2 WHERE id = $1", [
      row.id,
      row.hidden_value,
    ]);
  }
});
afterAll(closePool);

let admin: SessionUser;
beforeEach(async () => {
  const account = await createUser({ role: "admin" });
  admin = { ...adminTemplate, id: account.id };
});

const adminTemplate: SessionUser = {
  id: "",
  role: "admin",
  name: "Sys",
  surname: "Admin",
  email: "admin@nwu.ac.za",
  studentNumber: null,
  status: "active",
  createdAt: new Date().toISOString(),
};

/** The scale as a change, with some values replaced by label. */
const changed = (scale: Scale, values: Record<string, number> = {}, limits = {}): ScaleChanges => ({
  values: Object.fromEntries(
    scale.options.map((option) => [option.id, values[option.label] ?? option.hiddenValue]),
  ),
  minFactor: scale.minFactor,
  maxFactor: scale.maxFactor,
  ...limits,
});

/**
 * The scenario's group of three, every rating Very good (94), except that the
 * second student rates the first Excellent (100). By hand, at the defaults:
 *   s0: 100, 94 -> 97     s1: 94, 94 -> 94     s2: 94, 94 -> 94
 *   group mean 285 / 3 = 95; s0 factor 97 / 95 x 70 = 71.47... -> 71.5
 */
async function scenario() {
  const scene = await closedAssessment();
  const [s0, s1] = scene.students as [string, string, string];
  await query(
    `UPDATE peer_ratings SET rating_option_id =
       (SELECT id FROM rating_options WHERE label = 'Excellent')
      WHERE evaluator_id = $1 AND evaluated_id = $2`,
    [s1, s0],
  );
  return scene;
}

const markOf = async (assessmentId: string, user: SessionUser, studentId: string) =>
  (await getResults(assessmentId, user)).find((row) => row.studentId === studentId)!.finalMark;

describe("an assessment's own values", () => {
  it("start as the system defaults", async () => {
    const { assessmentId, user } = await scenario();
    const scale = await getAssessmentScale(assessmentId, user);

    expect(scale.customised).toBe(false);
    expect(scale.minFactor).toBe(DEFAULT_CONFIG.minFactor);
    expect(scale.maxFactor).toBe(DEFAULT_CONFIG.maxFactor);
    expect(scale.options[0]).toMatchObject({
      label: "Excellent",
      hiddenValue: 100,
      defaultValue: 100,
    });
  });

  it("change the marks, with figures worked out by hand", async () => {
    const { assessmentId, user, students } = await scenario();
    await runCalculation(assessmentId, user);
    expect(await markOf(assessmentId, user, students[0]!)).toBe(71.5);

    const scale = await getAssessmentScale(assessmentId, user);
    await updateAssessmentScale(assessmentId, changed(scale, { Excellent: 110 }), user);
    await runCalculation(assessmentId, user, "keep");

    // s0: 110, 94 -> 102; group mean (102 + 94 + 94) / 3 = 290 / 3.
    // 306 / 290 = 1.055172... x 70 = 73.862... -> 73.9
    expect(await markOf(assessmentId, user, students[0]!)).toBe(73.9);
  });

  it("are frozen with the run that used them (OR-09)", async () => {
    const { assessmentId, user } = await scenario();
    const scale = await getAssessmentScale(assessmentId, user);
    await updateAssessmentScale(assessmentId, changed(scale, { Excellent: 110 }), user);
    await runCalculation(assessmentId, user);

    const { rows } = await query<{
      config: { customisedScale: boolean; scale: Array<{ label: string; value: number }> };
    }>("SELECT config FROM calculation_runs WHERE assessment_id = $1", [assessmentId]);
    expect(rows[0]!.config.customisedScale).toBe(true);
    expect(rows[0]!.config.scale[0]).toMatchObject({ label: "Excellent", value: 110 });
  });

  it("show each rating's value from the run in the drill-down", async () => {
    const { assessmentId, user, students } = await scenario();
    const scale = await getAssessmentScale(assessmentId, user);
    await updateAssessmentScale(assessmentId, changed(scale, { Excellent: 110 }), user);
    await runCalculation(assessmentId, user);

    const row = (await getResults(assessmentId, user)).find((r) => r.studentId === students[0]);
    expect(row!.received.map((rating) => rating.value).sort()).toEqual([110, 94]);
  });

  it("apply the factor limits the lecturer chose", async () => {
    const { assessmentId, user, students } = await scenario();
    const scale = await getAssessmentScale(assessmentId, user);
    // A ceiling of 1: nobody can earn more than the group's own mark.
    await updateAssessmentScale(assessmentId, changed(scale, {}, { maxFactor: 1 }), user);
    await runCalculation(assessmentId, user);

    expect(await markOf(assessmentId, user, students[0]!)).toBe(70);
  });

  it("store only what differs from the system values", async () => {
    const { assessmentId, user } = await scenario();
    const scale = await getAssessmentScale(assessmentId, user);
    await updateAssessmentScale(assessmentId, changed(scale, { Excellent: 110 }), user);

    const { rows } = await query(
      "SELECT 1 FROM assessment_rating_values WHERE assessment_id = $1",
      [assessmentId],
    );
    expect(rows).toHaveLength(1);
    const after = await getAssessmentScale(assessmentId, user);
    expect(after.customised).toBe(true);
    // Limits left alone still follow the system.
    expect(
      (await query("SELECT min_factor FROM assessments WHERE id = $1", [assessmentId])).rows[0],
    ).toEqual({ min_factor: null });
  });

  it("make calculated marks out of date, and say so in the audit log (FR-13, FR-27)", async () => {
    const { assessmentId, user } = await scenario();
    await runCalculation(assessmentId, user);

    const scale = await getAssessmentScale(assessmentId, user);
    const outcome = await updateAssessmentScale(
      assessmentId,
      changed(scale, { Excellent: 110 }),
      user,
    );

    expect(outcome.invalidatedCalculation).toBe(true);
    expect((await getAssessment(assessmentId, user)).calculatedAt).toBeUndefined();
    const entries = await getAuditEntries({ eventType: "scale.updated" });
    expect(entries[0]!.detail).toMatch(/Excellent 100 -> 110/);
    expect(entries[0]!.detail).toMatch(/out of date/);
  });

  it("return to the system defaults on a reset", async () => {
    const { assessmentId, user } = await scenario();
    const scale = await getAssessmentScale(assessmentId, user);
    await updateAssessmentScale(
      assessmentId,
      changed(scale, { Excellent: 110 }, { minFactor: 0.5 }),
      user,
    );

    const { scale: reset } = await updateAssessmentScale(assessmentId, null, user);
    expect(reset.customised).toBe(false);
    expect(reset.options[0]!.hiddenValue).toBe(100);
    expect(reset.minFactor).toBe(DEFAULT_CONFIG.minFactor);
  });

  it("write nothing when nothing changed", async () => {
    const { assessmentId, user } = await scenario();
    const scale = await getAssessmentScale(assessmentId, user);
    await updateAssessmentScale(assessmentId, changed(scale), user);

    const entries = await getAuditEntries({ eventType: "scale.updated" });
    expect(entries).toHaveLength(0);
  });

  it("are refused to another lecturer", async () => {
    const { assessmentId, user } = await scenario();
    const scale = await getAssessmentScale(assessmentId, user);
    const other = await createUser({ role: "lecturer" });
    const stranger = { ...user, id: other.id };

    await expect(getAssessmentScale(assessmentId, stranger)).rejects.toMatchObject({ status: 404 });
    await expect(
      updateAssessmentScale(assessmentId, changed(scale, { Excellent: 110 }), stranger),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("what a scale may not be", () => {
  it("refuses a worse option worth more than a better one", async () => {
    const { assessmentId, user } = await scenario();
    const scale = await getAssessmentScale(assessmentId, user);
    const marginal = scale.options.find((option) => option.label === "Marginal")!;

    await expect(
      updateAssessmentScale(assessmentId, changed(scale, { Marginal: 95 }), user),
    ).rejects.toMatchObject({
      status: 400,
      fields: {
        [`value.${marginal.id}`]: expect.stringMatching(/can't be worth more than Ordinary/),
      },
    });
  });

  it("allows two options the same value", async () => {
    const { assessmentId, user } = await scenario();
    const scale = await getAssessmentScale(assessmentId, user);

    await expect(
      updateAssessmentScale(assessmentId, changed(scale, { "Very good": 100 }), user),
    ).resolves.toBeDefined();
  });

  it("refuses factor limits that do not bracket 1", async () => {
    const { assessmentId, user } = await scenario();
    const scale = await getAssessmentScale(assessmentId, user);

    await expect(
      updateAssessmentScale(assessmentId, changed(scale, {}, { minFactor: 1.2 }), user),
    ).rejects.toMatchObject({ fields: { minFactor: expect.any(String) } });
    await expect(
      updateAssessmentScale(assessmentId, changed(scale, {}, { maxFactor: 0.9 }), user),
    ).rejects.toMatchObject({ fields: { maxFactor: expect.any(String) } });
  });

  it("refuses negative values and values with four decimals", async () => {
    const { assessmentId, user } = await scenario();
    const scale = await getAssessmentScale(assessmentId, user);

    await expect(
      updateAssessmentScale(assessmentId, changed(scale, { "No contribution": -1 }), user),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      updateAssessmentScale(assessmentId, changed(scale, { Excellent: 99.0001 }), user),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("is refused by the database too, however the write arrives", async () => {
    const { assessmentId } = await scenario();

    await expect(
      query("UPDATE assessments SET min_factor = 1.5, max_factor = 2 WHERE id = $1", [
        assessmentId,
      ]),
    ).rejects.toThrow(/own_factor_limits/);
    await expect(
      query("UPDATE assessments SET min_factor = 0.5 WHERE id = $1", [assessmentId]),
    ).rejects.toThrow(/own_factor_limits/);
    await expect(query("UPDATE rating_options SET hidden_value = -5")).rejects.toThrow(
      /hidden_value_in_range/,
    );
  });
});

describe("the system defaults", () => {
  it("apply to an assessment without values of its own", async () => {
    const { assessmentId, user, students } = await scenario();
    const defaults = await getDefaultScale();
    await updateDefaultScale(changed(defaults, { Excellent: 110 }), admin);

    await runCalculation(assessmentId, user);
    expect(await markOf(assessmentId, user, students[0]!)).toBe(73.9);
  });

  it("do not override an assessment's own values", async () => {
    const { assessmentId, user, students } = await scenario();
    const scale = await getAssessmentScale(assessmentId, user);
    await updateAssessmentScale(assessmentId, changed(scale, { Excellent: 110 }), user);
    await updateDefaultScale(changed(await getDefaultScale(), { Excellent: 98 }), admin);

    await runCalculation(assessmentId, user);
    expect(await markOf(assessmentId, user, students[0]!)).toBe(73.9);
  });

  it("leave marks already calculated alone until the lecturer calculates again", async () => {
    const { assessmentId, user, students } = await scenario();
    await runCalculation(assessmentId, user);
    await updateDefaultScale(changed(await getDefaultScale(), { Excellent: 110 }), admin);

    expect((await getAssessment(assessmentId, user)).calculatedAt).toBeDefined();
    expect(await markOf(assessmentId, user, students[0]!)).toBe(71.5);
  });

  it("store the factor limits and audit the change (FR-27)", async () => {
    const defaults = await getDefaultScale();
    const after = await updateDefaultScale(changed(defaults, {}, { minFactor: 0.5 }), admin);

    expect(after.minFactor).toBe(0.5);
    const { rows } = await query<{ event_type: string; detail: string }>(
      "SELECT event_type, detail FROM audit_entries",
    );
    expect(rows[0]!.event_type).toBe("scale.updated");
    expect(rows[0]!.detail).toMatch(/factor limits 0.6-1.1 -> 0.5-1.1/);
  });
});
