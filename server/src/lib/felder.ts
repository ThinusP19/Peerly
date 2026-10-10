/**
 * The Felder individual mark calculation (FR-22, FR-23, OR-18, OR-19).
 *
 * A pure module: no database, no HTTP, no clock, no randomness. OR-18 requires
 * exactly that, and the reason is in FR-22 itself - an error here is not a
 * cosmetic defect but an academic-integrity failure, so this has to be testable
 * in isolation and readable by someone checking a mark against a spreadsheet.
 *
 * ------------------------------------------------------------------------
 * AWAITING SPONSOR APPROVAL (AS-08)
 * ------------------------------------------------------------------------
 * The FSD fixes the shape of the calculation: a student's adjustment factor is
 * their own mean received rating divided by their group's mean, and their mark
 * is the group's base mark multiplied by that factor.
 *
 * What the FSD does NOT fix, and what AS-08 covers, is the numbers around it.
 * Three of those are now decided: the rating scale and the factor limits on
 * 2026-09-22, and the rounding rule - one decimal place - on 2026-09-23. What
 * is still open is the free-rider and outlier thresholds (IS-04) and whether a
 * non-submitter carries an academic penalty (IS-02). Every one of them lives
 * in `CalculationConfig`
 * below rather than in the code (OR-19), with the defaults this module was
 * built against clearly marked. Changing them is a configuration change, not a
 * rewrite, and `calculation_runs.config` freezes whichever values were in force
 * with each run - so a mark stays explainable after the configuration moves on.
 *
 * Until AS-08 is signed off, results produced here are correct in method and
 * provisional in policy. They should not be presented as final marks.
 */

export interface CalculationConfig {
  /** Identifies the rule set a run used, stored alongside its results. */
  ruleVersion: string;
  /**
   * The adjustment factor is clamped to this range (FR-22 step 4).
   *
   * 0.6 to 1.1, confirmed 2026-09-22. The floor stops a poorly-rated student losing the
   * whole group mark over peer opinion; the ceiling stops a well-rated one
   * exceeding what the group's work actually earned.
   */
  minFactor: number;
  maxFactor: number;
  /**
   * Decimal places for the final mark.
   *
   * One, confirmed 2026-09-23: the precision the mark is recorded at. Matching
   * the two deliberately means the mark is rounded once, here, rather than
   * rounded to two places and rounded again by whoever records it - which is
   * the accumulated error FR-22 exists to prevent, just moved downstream.
   *
   * The ONLY rounding in the calculation. FR-22 requires full precision to be
   * retained internally and rounding applied at the final step, so no rounding
   * error accumulates - the factor is never rounded before it is multiplied.
   * A factor shown to four places is a display of the stored value, not the
   * value itself.
   */
  roundTo: number;
  /**
   * The factor given where there is nothing to compute one from - a group of
   * one, or a student nobody rated. DEFAULT 1: neutral, so the student receives
   * the group's mark unchanged. Any other value is a penalty, and a penalty is
   * a policy decision the Sponsor makes, not a default.
   */
  neutralFactor: number;
  /**
   * A student rated at or below this share of the scale is flagged as a
   * possible free rider (FR-20, IS-04). Advisory only - it never alters a mark.
   */
  lowContributionThreshold: number;
  /**
   * How far from the group mean a single rating must sit to be an outlier.
   *
   * Anchored to the scale rather than to a target hit rate, because the Sponsor
   * has to defend it: the bands are about five apart, so 20 is four of them -
   * "the group thought they were satisfactory, one member thought they were
   * unsatisfactory". Two bands, which is what this was, is ordinary
   * disagreement and flagged 27 of 28 students on real seeded data.
   */
  outlierThreshold: number;
  /**
   * How far apart two people's ratings OF EACH OTHER must be to be a dispute.
   *
   * Its own setting rather than a multiple of the one above (OR-19), so the
   * Sponsor can tune them independently once there is real data to tune
   * against. At 40, on a scale spanning 59 to 100, it means one rated the other
   * Excellent and got No contribution back - which is what "extremes" says.
   */
  reciprocalThreshold: number;
  /**
   * Whether a member's rating of themselves counts towards their own mean.
   *
   * True, decided 2026-10-10 on client feedback: the client's Felder
   * spreadsheet counts self-ratings, and every member now rates the whole
   * group, themselves included. Kept as a setting (OR-19) so a run says which
   * rule it used, and so turning it back off is a configuration change. Off,
   * a self-rating is ignored everywhere in the calculation, flags included.
   */
  countSelfRatings: boolean;
}

/** The values this module was built and tested against. */
export const DEFAULT_CONFIG: CalculationConfig = {
  // 2026.4: self-ratings count (2026-10-10).
  ruleVersion: "felder-2026.4-provisional",
  // Confirmed 2026-09-22.
  minFactor: 0.6,
  maxFactor: 1.1,
  // Confirmed 2026-09-23.
  roundTo: 1,
  neutralFactor: 1,
  // On the banded scale (0004): at or below Marginal, 79, on average - the
  // same point on the scale the old threshold of 50 marked. Awaiting IS-04.
  lowContributionThreshold: 79,
  // Four bands apart. Provisional, awaiting IS-04 and real data from AS-09.
  outlierThreshold: 20,
  // Effectively opposite ends of a 59-100 scale. Provisional, as above.
  reciprocalThreshold: 40,
  // Confirmed 2026-10-10.
  countSelfRatings: true,
};

export type ResultFlag =
  | "uniform-rating"
  | "reciprocal-extreme"
  | "isolated-outlier"
  | "incomplete-group"
  | "low-contribution"
  | "no-submission"
  | "group-of-two"
  | "group-of-one"
  | "unmatched"
  | "not-peer-assessed"
  | "zero-base-mark"
  | "zero-group-mean"
  | "capped-at-maximum";

/** One rating, reduced to what the calculation needs. */
export interface Rating {
  evaluatorId: string;
  evaluatedId: string;
  /** The hidden numeric value behind the descriptive option. */
  value: number;
}

export interface GroupInput {
  groupId: string;
  memberIds: string[];
  /** Null where the lecturer has not entered one - not the same as zero. */
  baseMark: number | null;
  ratings: Rating[];
  /** Members who submitted an evaluation. */
  submittedIds: string[];
  /** Members whose class-list enrolment is not matched (FR-23 case eight). */
  unmatchedIds?: string[];
}

export interface StudentResult {
  studentId: string;
  groupId: string;
  ratingsReceived: number;
  /** Null where nobody rated them. Full precision, like every figure but the mark. */
  meanReceived: number | null;
  groupMean: number | null;
  /** Before the limits are applied - kept so a mark stays explainable (OR-09). */
  rawFactor: number | null;
  adjustmentFactor: number;
  baseMark: number | null;
  /** Null where the group has no base mark yet: there is nothing to adjust. */
  finalMark: number | null;
  flags: ResultFlag[];
}

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((total, value) => total + value, 0) / values.length;

/**
 * Rounds half away from zero, to `places`.
 *
 * JavaScript's `Math.round` rounds half up, which biases every exact .5 upward,
 * and `toFixed` inherits binary floating point's surprises (1.005 rounds down).
 * Marks go on an academic record, so the rule is stated explicitly here rather
 * than inherited from whichever primitive happened to be reached for.
 *
 * The value is cleaned to twelve significant digits before it is rounded. A
 * mark is a base mark times a ratio of rating sums, so its true value is a
 * fraction; by the time binary floating point has divided and multiplied its
 * way there, a true midpoint such as 35.55 can arrive as 35.549999999999997 -
 * a few units in the last place low, more than an epsilon nudge covers - and
 * round the wrong way. Twelve digits keep every real digit of a mark (the
 * nearest true value that is NOT a midpoint is far further away than that)
 * and discard only the noise. The property test in felder.test.ts checks this
 * against exact fractions.
 */
export function round(value: number, places: number): number {
  const factor = 10 ** places;
  const scaled = Number((value * factor).toPrecision(12));
  const rounded = Math.round(Math.abs(scaled)) / factor;
  // `|| 0` so a small negative that rounds away to nothing is 0, not -0.
  return scaled < 0 ? -rounded || 0 : rounded;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** What the calculation needs to know about the assessment itself. */
export interface AssessmentLimits {
  /**
   * The assessment's maximum mark (BR-07). The factor ceiling of 1.1 lets a
   * well-rated student earn more than the group's base mark, and 1.1 times any
   * base mark above 90.9 out of 100 is more than 100 - so the mark is capped
   * here as well, after rounding. Left out, nothing is capped.
   */
  maxMark?: number;
}

/**
 * Calculates every member of one group (FR-22, FR-23).
 *
 * The eight FR-23 cases are handled explicitly and commented where they arise,
 * rather than emerging from the arithmetic - a mark that happens to come out
 * right is not the same as one that was decided.
 */
export function calculateGroup(
  group: GroupInput,
  config: CalculationConfig = DEFAULT_CONFIG,
  limits: AssessmentLimits = {},
): StudentResult[] {
  const { memberIds, baseMark } = group;
  // With self-ratings off, they are dropped here, before anything reads them,
  // so no step below can count one by accident.
  const ratings = config.countSelfRatings
    ? group.ratings
    : group.ratings.filter((rating) => rating.evaluatorId !== rating.evaluatedId);
  const submitted = new Set(group.submittedIds);
  const unmatched = new Set(group.unmatchedIds ?? []);

  // Step 1: what each member received.
  const received = new Map<string, number[]>(memberIds.map((id) => [id, []]));
  for (const rating of ratings) {
    // A rating for somebody outside the group cannot count towards it. The
    // database already refuses to store one (BR-01); ignoring it here means a
    // stray row could never silently move a mark.
    received.get(rating.evaluatedId)?.push(rating.value);
  }

  const means = new Map<string, number | null>(
    memberIds.map((id) => [id, mean(received.get(id) ?? [])]),
  );

  // Step 2: the group mean, over the members who have one. A member nobody
  // rated contributes nothing rather than counting as zero - zero is a rating
  // somebody gave, and no rating is not.
  const groupMean = mean(
    memberIds.flatMap((id) => (means.get(id) === null ? [] : [means.get(id)!])),
  );

  return memberIds.map((studentId) => {
    const values = received.get(studentId) ?? [];
    const meanReceived = means.get(studentId) ?? null;
    const flags = new Set<ResultFlag>();

    // FR-23 case eight: unmatched at closure.
    if (unmatched.has(studentId)) flags.add("unmatched");

    // FR-23 case one: submitted nothing. Their own mark still comes from what
    // their peers said - withholding it would be a penalty, and FR-20 is
    // explicit that indicators are advisory and never alter a mark.
    if (!submitted.has(studentId)) flags.add("no-submission");

    // FR-23 case four: a group of one. Nobody to rate them and nobody to
    // compare against, so the factor is neutral. Its own flag, not the
    // group-of-two one: the lecturer is being told something different.
    if (memberIds.length === 1) flags.add("group-of-one");
    // FR-23 case three: a group of two. Each member is rated exactly once, so a
    // single opinion decides the whole factor.
    else if (memberIds.length === 2) flags.add("group-of-two");

    // FR-20: fewer than half the members submitted, so the ratings that did
    // arrive are a weak basis for adjusting anybody's mark. One absentee in a
    // group of five is not that, and flagging it would bury the cases that are.
    if (group.submittedIds.length * 2 < memberIds.length) flags.add("incomplete-group");

    // FR-23 case two: received nothing.
    let rawFactor: number | null;
    let adjustmentFactor: number;

    if (meanReceived === null || groupMean === null || groupMean === 0) {
      // Nothing to divide, or nothing to divide by. A group mean of zero means
      // every member was rated at the very bottom; dividing by it is undefined,
      // and the whole group already carries the base mark they earned.
      rawFactor = null;
      adjustmentFactor = config.neutralFactor;

      // FR-23 case two is flagged below, with the self-rated-only case.
      // FR-22: the whole group was rated at the bottom and receives the base
      // mark unadjusted - which the lecturer must see was not an adjustment.
      if (groupMean === 0) flags.add("zero-group-mean");
    } else {
      // Step 3: the factor itself.
      rawFactor = meanReceived / groupMean;
      // Step 4: the approved limits. No rounding here: FR-22 rounds only at
      // the final step, so the mark is computed from the factor as it is.
      adjustmentFactor = clamp(rawFactor, config.minFactor, config.maxFactor);
    }

    // FR-23 case two: no peer rated this student, so their mark was not peer
    // assessed. That includes a member whose only rating is their own - their
    // factor then rests on their own opinion alone, which the lecturer must
    // see. A group of one already says so in its own flag.
    const peerRatings = ratings.filter(
      (rating) => rating.evaluatedId === studentId && rating.evaluatorId !== studentId,
    ).length;
    if (peerRatings === 0 && memberIds.length > 1) flags.add("not-peer-assessed");

    // FR-23 case six: a base mark of zero makes every mark zero. Correct, but
    // flagged, so a mark left at zero in error is not mistaken for a decision.
    if (baseMark === 0) flags.add("zero-base-mark");

    // FR-20 indicators, all advisory.
    if (meanReceived !== null && meanReceived <= config.lowContributionThreshold) {
      flags.add("low-contribution");
    }
    // FR-20 uniform rating: this student, as an evaluator, gave every member
    // the identical option - a form completed without engagement. It takes at
    // least two ratings to be uniform; one rating is merely a rating. Where the
    // whole group did this, every member is flagged, which is FR-23 case five.
    const given = ratings.filter((rating) => rating.evaluatorId === studentId);
    if (given.length > 1 && new Set(given.map((rating) => rating.value)).size === 1) {
      flags.add("uniform-rating");
    }
    if (
      groupMean !== null &&
      values.some((v) => Math.abs(v - groupMean) >= config.outlierThreshold)
    ) {
      flags.add("isolated-outlier");
    }
    // A pair who rated each other at opposite ends usually means a dispute
    // rather than a difference in contribution.
    for (const rating of ratings) {
      // Their rating of themselves is not a dispute with anybody.
      if (rating.evaluatedId !== studentId || rating.evaluatorId === studentId) continue;
      const back = ratings.find(
        (other) => other.evaluatorId === studentId && other.evaluatedId === rating.evaluatorId,
      );
      if (back && Math.abs(back.value - rating.value) >= config.reciprocalThreshold) {
        flags.add("reciprocal-extreme");
      }
    }

    // FR-23 cases five and six fall out of the arithmetic and are correct:
    // where every rating is identical, each mean equals the group mean and every
    // factor is exactly 1; where the base mark is zero, the final mark is zero
    // whatever the factor. Step 6: the one and only rounding.
    let finalMark = baseMark === null ? null : round(baseMark * adjustmentFactor, config.roundTo);

    // BR-07: a mark never exceeds the maximum. Flagged, because the student's
    // ratings earned more than the assessment can award and the lecturer should
    // see that the ceiling, not the factor, decided this mark.
    if (finalMark !== null && limits.maxMark !== undefined && finalMark > limits.maxMark) {
      finalMark = limits.maxMark;
      flags.add("capped-at-maximum");
    }

    return {
      studentId,
      groupId: group.groupId,
      ratingsReceived: values.length,
      meanReceived,
      groupMean,
      rawFactor,
      adjustmentFactor,
      baseMark,
      finalMark,
      flags: [...flags].sort(),
    };
  });
}

/**
 * Calculates every group in an assessment.
 *
 * FR-23 case seven - a student in no group - needs no handling here: they
 * appear in no group's member list, so they get no result. A mark cannot be
 * derived for somebody with no peers, and inventing one would be worse than
 * showing the lecturer that they are unallocated.
 */
export function calculateAssessment(
  groups: GroupInput[],
  config: CalculationConfig = DEFAULT_CONFIG,
  limits: AssessmentLimits = {},
): StudentResult[] {
  return groups.flatMap((group) => calculateGroup(group, config, limits));
}
