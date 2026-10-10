import { pool, query, withTransaction, type Sql } from "../db/pool.ts";
import type { SessionUser } from "../domain/types.ts";
import { DEFAULT_CONFIG } from "../lib/felder.ts";
import { badRequest } from "../middleware/errors.ts";
import { getAssessment } from "./assessments.ts";
import { record } from "./audit.ts";
import type { Asker } from "./classes.ts";

/**
 * The hidden values behind the rating options, and the factor limits (OR-19).
 *
 * Two layers. An administrator sets the system-wide defaults: the values on
 * `rating_options` and the limits in `calculation_settings`. A lecturer may
 * adjust either for one assessment of theirs; an option or limit they leave
 * alone follows the system value. What the calculation uses is the two layered
 * together - `effectiveScale` - and every run freezes exactly that (OR-09).
 *
 * None of this ever reaches a student. Every function here is behind a staff
 * route, and the student copy of the scale (`getRatingOptions`) strips the
 * value server-side whichever layer it came from.
 */

export interface FactorLimits {
  minFactor: number;
  maxFactor: number;
}

export interface ScaleOption {
  id: string;
  label: string;
  description: string;
  order: number;
  /** The value the calculation will use. */
  hiddenValue: number;
  /** The system-wide value, for showing what the lecturer changed. */
  defaultValue: number;
}

export interface Scale extends FactorLimits {
  options: ScaleOption[];
  /** The system-wide limits, beside whichever are in force. */
  defaults: FactorLimits;
  /** True when this assessment has values or limits of its own. */
  customised: boolean;
}

export interface ScaleChanges extends FactorLimits {
  /** Every active option's value, keyed by its id. */
  values: Record<string, number>;
}

/** The system-wide limits, or felder.ts's defaults where none were ever saved. */
export async function getDefaultLimits(sql: Sql = pool): Promise<FactorLimits> {
  const { rows } = await sql.query<{ min_factor: string; max_factor: string }>(
    "SELECT min_factor, max_factor FROM calculation_settings",
  );
  const row = rows[0];
  return row
    ? { minFactor: Number(row.min_factor), maxFactor: Number(row.max_factor) }
    : { minFactor: DEFAULT_CONFIG.minFactor, maxFactor: DEFAULT_CONFIG.maxFactor };
}

/**
 * The scale as it applies to one assessment, or the system scale when no
 * assessment is named.
 */
async function readScale(assessmentId: string | null): Promise<Scale> {
  const { rows } = await query<{
    id: string;
    label: string;
    description: string;
    display_order: number;
    default_value: string;
    own_value: string | null;
  }>(
    `SELECT o.id, o.label, o.description, o.display_order,
            o.hidden_value AS default_value, v.hidden_value AS own_value
       FROM rating_options o
       LEFT JOIN assessment_rating_values v
         ON v.rating_option_id = o.id AND v.assessment_id = $1
      WHERE o.active
      ORDER BY o.display_order`,
    [assessmentId],
  );

  const defaults = await getDefaultLimits();
  let own: FactorLimits | null = null;
  if (assessmentId) {
    const { rows: limits } = await query<{ min_factor: string | null; max_factor: string | null }>(
      "SELECT min_factor, max_factor FROM assessments WHERE id = $1",
      [assessmentId],
    );
    const row = limits[0];
    if (row?.min_factor != null && row.max_factor != null) {
      own = { minFactor: Number(row.min_factor), maxFactor: Number(row.max_factor) };
    }
  }

  // numeric arrives as a string; converted here, at the point of use.
  const options = rows.map((row) => ({
    id: row.id,
    label: row.label,
    description: row.description,
    order: row.display_order,
    hiddenValue: Number(row.own_value ?? row.default_value),
    defaultValue: Number(row.default_value),
  }));

  return {
    options,
    ...(own ?? defaults),
    defaults,
    customised: own !== null || rows.some((row) => row.own_value !== null),
  };
}

/** The system-wide scale. Staff only - the route says which staff. */
export const getDefaultScale = () => readScale(null);

/** One assessment's scale, for the lecturer who owns it. */
export async function getAssessmentScale(assessmentId: string, asker: Asker): Promise<Scale> {
  await getAssessment(assessmentId, asker);
  return readScale(assessmentId);
}

/**
 * What the calculation uses. No ownership check: the caller has already made
 * one, and this is never served by a route on its own.
 */
export const effectiveScale = (assessmentId: string) => readScale(assessmentId);

/** At most three decimal places: what numeric(6, 3) and numeric(5, 3) store. */
const threePlaces = (value: number) => Number.isInteger(Number((value * 1000).toPrecision(12)));

/**
 * Refuses a scale that cannot be stored, or that would rank the options in a
 * different order from the one students see them in.
 *
 * The database holds the range and the limits too (0009); the order is
 * checked here, because it runs across rows and layers no CHECK can see. It
 * matters: the options are shown best first, and a student choosing "Very
 * good" over "Satisfactory" must never be lowering the mark they give.
 */
function validate(changes: ScaleChanges, options: Array<{ id: string; label: string }>) {
  const fields: Record<string, string> = {};

  for (const option of options) {
    const value = changes.values[option.id];
    if (value === undefined || !Number.isFinite(value)) {
      fields[`value.${option.id}`] = `Give ${option.label} a value.`;
    } else if (value < 0 || value > 1000) {
      fields[`value.${option.id}`] = "Use a value between 0 and 1000.";
    } else if (!threePlaces(value)) {
      fields[`value.${option.id}`] = "Use at most three decimal places.";
    }
  }
  const unknown = Object.keys(changes.values).filter((id) => !options.some((o) => o.id === id));
  if (unknown.length > 0) throw badRequest("That scale names a rating option that doesn't exist.");

  if (Object.keys(fields).length === 0) {
    for (let index = 1; index < options.length; index += 1) {
      const better = options[index - 1]!;
      const worse = options[index]!;
      if (changes.values[worse.id]! > changes.values[better.id]!) {
        fields[`value.${worse.id}`] =
          `${worse.label} can't be worth more than ${better.label}, which students see above it.`;
      }
    }
  }

  const { minFactor, maxFactor } = changes;
  if (!(minFactor > 0 && minFactor <= 1) || !threePlaces(minFactor)) {
    fields.minFactor = "The lowest factor has to be more than 0 and at most 1.";
  }
  if (!(maxFactor >= 1 && maxFactor <= 2) || !threePlaces(maxFactor)) {
    fields.maxFactor = "The highest factor has to be at least 1 and at most 2.";
  }

  if (Object.keys(fields).length > 0) {
    throw badRequest(Object.values(fields)[0]!, fields);
  }
}

/** "Excellent 100 -> 98, Marginal 79 -> 75; factor 0.6-1.1 -> 0.5-1.1" */
function describeChange(
  before: Scale,
  after: ScaleChanges,
  options: ScaleOption[],
): { detail: string; changed: boolean } {
  const values = options
    .filter((option) => option.hiddenValue !== after.values[option.id])
    .map((option) => `${option.label} ${option.hiddenValue} -> ${after.values[option.id]}`);
  const limits =
    before.minFactor !== after.minFactor || before.maxFactor !== after.maxFactor
      ? [
          `factor limits ${before.minFactor}-${before.maxFactor} -> ${after.minFactor}-${after.maxFactor}`,
        ]
      : [];
  const parts = [...values, ...limits];
  return { detail: parts.join("; "), changed: parts.length > 0 };
}

const snapshot = (scale: Pick<Scale, "options" | "minFactor" | "maxFactor">) => ({
  values: Object.fromEntries(scale.options.map((option) => [option.label, option.hiddenValue])),
  minFactor: scale.minFactor,
  maxFactor: scale.maxFactor,
});

const actorOf = (user: SessionUser) => ({
  id: user.id,
  name: user.name,
  surname: user.surname,
  role: user.role,
});

/**
 * Changes the system-wide defaults. Administrator only (the route enforces it).
 *
 * Assessments already calculated keep their marks: each run froze the scale
 * it used, so those marks stay explainable, and nothing changes on a student's
 * record until a lecturer chooses to calculate again.
 */
export async function updateDefaultScale(changes: ScaleChanges, user: SessionUser): Promise<Scale> {
  const before = await getDefaultScale();
  validate(changes, before.options);

  const { detail, changed } = describeChange(before, changes, before.options);
  // Saving the form unchanged is not a write, and every write is permanent in
  // the audit log.
  if (!changed) return before;

  await withTransaction(async (sql) => {
    for (const option of before.options) {
      await sql.query("UPDATE rating_options SET hidden_value = $2 WHERE id = $1", [
        option.id,
        changes.values[option.id],
      ]);
    }
    await sql.query(
      `INSERT INTO calculation_settings (id, min_factor, max_factor, updated_by, updated_at)
       VALUES (true, $1, $2, $3, now())
       ON CONFLICT (id) DO UPDATE
          SET min_factor = EXCLUDED.min_factor,
              max_factor = EXCLUDED.max_factor,
              updated_by = EXCLUDED.updated_by,
              updated_at = now()`,
      [changes.minFactor, changes.maxFactor, user.id],
    );

    await record(
      {
        actor: actorOf(user),
        eventType: "scale.updated",
        objectDescription: "System rating values",
        detail: `Default rating values changed: ${detail}. Applies to calculations from now on.`,
        before: snapshot(before),
        after: snapshot({
          options: before.options.map((option) => ({
            ...option,
            hiddenValue: changes.values[option.id]!,
          })),
          minFactor: changes.minFactor,
          maxFactor: changes.maxFactor,
        }),
      },
      sql,
    );
  });

  return getDefaultScale();
}

/**
 * Sets one assessment's own values, or with `null` returns it to the system
 * defaults. Lecturer only, and only on their own assessment.
 *
 * Changing the values changes every mark, so calculated marks are out of date
 * afterwards, exactly as after a changed base mark (FR-13).
 */
export async function updateAssessmentScale(
  assessmentId: string,
  changes: ScaleChanges | null,
  user: SessionUser,
): Promise<{ scale: Scale; invalidatedCalculation: boolean }> {
  const assessment = await getAssessment(assessmentId, user);
  const before = await readScale(assessmentId);

  // A reset is the system values, written as a change so it is validated,
  // described and audited by the same path as any other.
  const target: ScaleChanges = changes ?? {
    values: Object.fromEntries(before.options.map((option) => [option.id, option.defaultValue])),
    ...before.defaults,
  };
  validate(target, before.options);

  const { detail, changed } = describeChange(before, target, before.options);
  if (!changed && (changes !== null || !before.customised)) {
    return { scale: before, invalidatedCalculation: false };
  }

  const invalidatedCalculation = changed && Boolean(assessment.calculatedAt);

  await withTransaction(async (sql) => {
    await sql.query("DELETE FROM assessment_rating_values WHERE assessment_id = $1", [
      assessmentId,
    ]);

    // Only what differs from the system value is stored, so an option the
    // lecturer left alone keeps following the system default.
    const defaultLimits = await getDefaultLimits(sql);
    if (changes !== null) {
      for (const option of before.options) {
        const value = target.values[option.id]!;
        if (value === option.defaultValue) continue;
        await sql.query(
          `INSERT INTO assessment_rating_values (assessment_id, rating_option_id, hidden_value)
           VALUES ($1, $2, $3)`,
          [assessmentId, option.id, value],
        );
      }
    }
    const ownLimits =
      changes !== null &&
      (target.minFactor !== defaultLimits.minFactor ||
        target.maxFactor !== defaultLimits.maxFactor);
    await sql.query("UPDATE assessments SET min_factor = $2, max_factor = $3 WHERE id = $1", [
      assessmentId,
      ownLimits ? target.minFactor : null,
      ownLimits ? target.maxFactor : null,
    ]);

    if (invalidatedCalculation) {
      await sql.query(
        "UPDATE assessments SET calculated_at = NULL, calculation_run_id = NULL WHERE id = $1",
        [assessmentId],
      );
    }

    await record(
      {
        actor: actorOf(user),
        eventType: "scale.updated",
        objectDescription: assessment.name,
        detail:
          (changes === null
            ? "Rating values returned to the system defaults"
            : "Rating values for this assessment changed") +
          (detail ? `: ${detail}.` : ".") +
          (invalidatedCalculation
            ? " The calculated marks are out of date until they are calculated again."
            : ""),
        classId: assessment.classId,
        assessmentId,
        before: snapshot(before),
        after: snapshot({
          options: before.options.map((option) => ({
            ...option,
            hiddenValue: target.values[option.id]!,
          })),
          minFactor: target.minFactor,
          maxFactor: target.maxFactor,
        }),
      },
      sql,
    );
  });

  return { scale: await readScale(assessmentId), invalidatedCalculation };
}
