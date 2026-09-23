import { describe, expect, it } from "vitest";

import {
  DEFAULT_CONFIG,
  calculateAssessment,
  calculateGroup,
  round,
  type GroupInput,
  type Rating,
} from "./felder.ts";

/**
 * FR-22 and FR-23.
 *
 * The FSD says an error here is an academic-integrity failure rather than a
 * cosmetic defect, so these tests check arithmetic against figures that can be
 * worked out by hand, and name each FR-23 case where it is covered.
 */

/** Everybody rates everybody else at `value`, so the group is perfectly uniform. */
const uniformRatings = (memberIds: string[], value: number): Rating[] =>
  memberIds.flatMap((evaluatorId) =>
    memberIds
      .filter((evaluatedId) => evaluatedId !== evaluatorId)
      .map((evaluatedId) => ({ evaluatorId, evaluatedId, value })),
  );

const group = (overrides: Partial<GroupInput> = {}): GroupInput => {
  const memberIds = overrides.memberIds ?? ["a", "b", "c", "d"];
  return {
    groupId: "g1",
    baseMark: 70,
    ...overrides,
    // After the spread, so the defaults below are derived from the final member
    // list rather than from the placeholder one.
    memberIds,
    // Satisfactory on the banded scale (0004).
    ratings: overrides.ratings ?? uniformRatings(memberIds, 89),
    submittedIds: overrides.submittedIds ?? memberIds,
  };
};

const byId = (results: ReturnType<typeof calculateGroup>, id: string) =>
  results.find((r) => r.studentId === id)!;

describe("round", () => {
  it("rounds half away from zero", () => {
    expect(round(2.5, 0)).toBe(3);
    expect(round(3.5, 0)).toBe(4);
    expect(round(-2.5, 0)).toBe(-3);
  });

  it("handles the values binary floating point represents just below the midpoint", () => {
    // (1.005).toFixed(2) gives "1.00" because 1.005 is stored slightly low.
    expect(round(1.005, 2)).toBe(1.01);
    expect(round(70 * 1.005, 2)).toBe(70.35);
  });

  it("leaves an exact value alone", () => {
    expect(round(66.5, 2)).toBe(66.5);
    expect(round(70, 2)).toBe(70);
  });
});

describe("FR-22 - the calculation itself", () => {
  it("gives everyone a factor of exactly 1 when all ratings are identical", () => {
    // FR-23 case five. Each mean equals the group mean, so nothing moves.
    const results = calculateGroup(group());

    for (const result of results) {
      expect(result.adjustmentFactor).toBe(1);
      expect(result.finalMark).toBe(70);
    }
  });

  it("is individual mean divided by group mean", () => {
    // a receives 100,100,100 -> 100.  b, c, d each receive 50 from everyone.
    const ratings: Rating[] = [
      ...["b", "c", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "a", value: 100 })),
      ...["a", "c", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "b", value: 50 })),
      ...["a", "b", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "c", value: 50 })),
      ...["a", "b", "c"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "d", value: 50 })),
    ];
    const results = calculateGroup(group({ ratings }));

    // Group mean = (100 + 50 + 50 + 50) / 4 = 62.5
    expect(byId(results, "a").groupMean).toBe(62.5);
    expect(byId(results, "a").rawFactor).toBe(1.6);
    expect(byId(results, "b").rawFactor).toBe(0.8);
  });

  it("clamps the factor to the approved limits, keeping the raw one (OR-09)", () => {
    const ratings: Rating[] = [
      ...["b", "c", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "a", value: 100 })),
      ...["a", "c", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "b", value: 50 })),
      ...["a", "b", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "c", value: 50 })),
      ...["a", "b", "c"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "d", value: 50 })),
    ];
    const a = byId(calculateGroup(group({ ratings })), "a");

    expect(a.rawFactor).toBe(1.6);
    expect(a.adjustmentFactor).toBe(DEFAULT_CONFIG.maxFactor);
    // The unclamped figure is retained so the mark can still be explained.
    expect(a.finalMark).toBe(round(70 * DEFAULT_CONFIG.maxFactor, DEFAULT_CONFIG.roundTo));
  });

  it("clamps at the floor too", () => {
    const ratings: Rating[] = [
      ...["b", "c", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "a", value: 0 })),
      ...["a", "c", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "b", value: 100 })),
      ...["a", "b", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "c", value: 100 })),
      ...["a", "b", "c"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "d", value: 100 })),
    ];
    const a = byId(calculateGroup(group({ ratings })), "a");

    expect(a.rawFactor).toBe(0);
    expect(a.adjustmentFactor).toBe(DEFAULT_CONFIG.minFactor);
  });

  it("respects configured limits rather than hard-coded ones (OR-19)", () => {
    const ratings: Rating[] = [
      ...["b", "c", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "a", value: 100 })),
      ...["a", "c", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "b", value: 50 })),
      ...["a", "b", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "c", value: 50 })),
      ...["a", "b", "c"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "d", value: 50 })),
    ];
    const results = calculateGroup(group({ ratings }), {
      ...DEFAULT_CONFIG,
      minFactor: 0.5,
      maxFactor: 1.5,
    });

    expect(byId(results, "a").adjustmentFactor).toBe(1.5);
  });

  it("applies the configured rounding", () => {
    const ratings: Rating[] = [
      ...["b", "c", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "a", value: 87.5 })),
      ...["a", "c", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "b", value: 75 })),
      ...["a", "b", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "c", value: 62.5 })),
      ...["a", "b", "c"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "d", value: 75 })),
    ];
    const whole = calculateGroup(group({ ratings }), { ...DEFAULT_CONFIG, roundTo: 0 });

    for (const result of whole) expect(Number.isInteger(result.finalMark)).toBe(true);
  });
});

describe("the agreed scale, end to end", () => {
  // Group mark 70. a: Excellent from all (100). b, c: Very good (94).
  // d: Marginal (79). Group mean = (100 + 94 + 94 + 79) / 4 = 91.75.
  const ratings: Rating[] = [
    ...["b", "c", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "a", value: 100 })),
    ...["a", "c", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "b", value: 94 })),
    ...["a", "b", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "c", value: 94 })),
    ...["a", "b", "c"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "d", value: 79 })),
  ];
  const results = calculateGroup(group({ ratings, baseMark: 70 }));

  it("gives the figures a lecturer would work out by hand", () => {
    // 100 / 91.75 = 1.089918... x 70 = 76.294278... -> 76.3
    expect(byId(results, "a").finalMark).toBe(76.3);
    // 94 / 91.75 = 1.024523... x 70 = 71.716621... -> 71.7
    expect(byId(results, "b").finalMark).toBe(71.7);
    // 79 / 91.75 = 0.861035... x 70 = 60.272480... -> 60.3
    expect(byId(results, "d").finalMark).toBe(60.3);
  });

  it("flags the Marginal student as low contribution, and nobody else", () => {
    expect(byId(results, "d").flags).toContain("low-contribution");
    for (const id of ["a", "b", "c"]) {
      expect(byId(results, id).flags).not.toContain("low-contribution");
    }
  });

  it("cannot take a factor below 0.6 even when everyone says No contribution", () => {
    // 59 / ((59 + 100 x 3) / 4) = 0.657 - the compressed scale keeps even the
    // worst rating inside the limits. The floor is still there for a group
    // whose other members are all rated Excellent and the scale changes.
    const harsh: Rating[] = [
      ...["b", "c", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "a", value: 59 })),
      ...["a", "c", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "b", value: 100 })),
      ...["a", "b", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "c", value: 100 })),
      ...["a", "b", "c"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "d", value: 100 })),
    ];
    const a = byId(calculateGroup(group({ ratings: harsh, baseMark: 70 })), "a");
    expect(a.adjustmentFactor).toBeGreaterThanOrEqual(DEFAULT_CONFIG.minFactor);
    expect(a.finalMark).toBe(round(70 * (59 / 89.75), DEFAULT_CONFIG.roundTo));
  });
});

describe("FR-23 - the edge cases, each named", () => {
  it("case 1: a student who submitted nothing is still marked on what they received", () => {
    // Withholding their mark would be a penalty, and FR-20 says indicators are
    // advisory and never alter a mark. The fact is flagged instead.
    const results = calculateGroup(group({ submittedIds: ["b", "c", "d"] }));
    const a = byId(results, "a");

    expect(a.flags).toContain("no-submission");
    expect(a.finalMark).toBe(70);
  });

  it("case 2: a student nobody rated gets the neutral factor, not zero", () => {
    const ratings = uniformRatings(["b", "c", "d"], 75);
    const a = byId(calculateGroup(group({ ratings })), "a");

    expect(a.ratingsReceived).toBe(0);
    expect(a.meanReceived).toBeNull();
    expect(a.adjustmentFactor).toBe(DEFAULT_CONFIG.neutralFactor);
    expect(a.finalMark).toBe(70);
  });

  it("case 2: a student nobody rated is flagged as not peer assessed", () => {
    const results = calculateGroup(group({ ratings: uniformRatings(["b", "c", "d"], 75) }));

    expect(byId(results, "a").flags).toContain("not-peer-assessed");
    // Everyone else was rated, so only the one student carries it.
    expect(byId(results, "b").flags).not.toContain("not-peer-assessed");
  });

  it("case 2: a group where nobody submitted flags every member as not peer assessed", () => {
    const results = calculateGroup(group({ ratings: [], submittedIds: [] }));

    for (const result of results) {
      expect(result.flags).toContain("not-peer-assessed");
      expect(result.finalMark).toBe(70);
    }
  });

  it("case 2: an unrated member does not drag the group mean down", () => {
    // Counting them as zero would penalise everybody else for one person's
    // absence. No rating is not a rating of zero.
    const ratings = uniformRatings(["b", "c", "d"], 75);
    expect(byId(calculateGroup(group({ ratings })), "b").groupMean).toBe(75);
  });

  it("case 3: a group of two is flagged, since one opinion decides the factor", () => {
    const memberIds = ["a", "b"];
    const results = calculateGroup(
      group({ memberIds, ratings: uniformRatings(memberIds, 75), submittedIds: memberIds }),
    );

    expect(results[0]!.flags).toContain("group-of-two");
  });

  it("case 4: a group of one gets the neutral factor and its own flag", () => {
    const results = calculateGroup(group({ memberIds: ["a"], ratings: [], submittedIds: ["a"] }));

    expect(results[0]!.flags).toContain("group-of-one");
    expect(results[0]!.flags).not.toContain("group-of-two");
    // Its own flag already says there is nobody to rate them.
    expect(results[0]!.flags).not.toContain("not-peer-assessed");
    expect(results[0]!.adjustmentFactor).toBe(1);
    expect(results[0]!.finalMark).toBe(70);
  });

  it("case 5: identical ratings give every member exactly the group mark", () => {
    for (const result of calculateGroup(group())) expect(result.finalMark).toBe(70);
  });

  it("case 5: identical ratings flag every member as a uniform rater", () => {
    // Arithmetically correct, but FR-23 says it is flagged under FR-20: every
    // evaluator gave every member the same option.
    for (const result of calculateGroup(group())) {
      expect(result.adjustmentFactor).toBe(1);
      expect(result.flags).toContain("uniform-rating");
    }
  });

  it("case 6: a base mark of zero gives zero, whatever the factor", () => {
    const ratings: Rating[] = [
      ...["b", "c", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "a", value: 100 })),
      ...["a", "c", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "b", value: 50 })),
      ...["a", "b", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "c", value: 50 })),
      ...["a", "b", "c"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "d", value: 50 })),
    ];
    const results = calculateGroup(group({ ratings, baseMark: 0 }));

    for (const result of results) expect(result.finalMark).toBe(0);
    // The factor is still computed, so the lecturer can see what it would be.
    expect(byId(results, "a").adjustmentFactor).toBe(DEFAULT_CONFIG.maxFactor);
  });

  it("case 6: a base mark of zero is flagged, so a zero left in error is not mistaken for a decision", () => {
    for (const result of calculateGroup(group({ baseMark: 0 }))) {
      expect(result.flags).toContain("zero-base-mark");
    }
    for (const result of calculateGroup(group({ baseMark: 70 }))) {
      expect(result.flags).not.toContain("zero-base-mark");
    }
  });

  it("case 6b: no base mark yet gives no final mark, rather than a mark of zero", () => {
    const results = calculateGroup(group({ baseMark: null }));

    expect(results[0]!.finalMark).toBeNull();
    // The factor is still known - only the mark is waiting on the lecturer.
    expect(results[0]!.adjustmentFactor).toBe(1);
    // No mark yet is not a mark of zero.
    expect(results[0]!.flags).not.toContain("zero-base-mark");
  });

  it("case 7: a student in no group gets no result at all", () => {
    const results = calculateAssessment([group({ memberIds: ["a", "b"] })]);

    expect(results.map((r) => r.studentId).sort()).toEqual(["a", "b"]);
    expect(results.find((r) => r.studentId === "z")).toBeUndefined();
  });

  it("case 8: an unmatched student is flagged but still calculated", () => {
    const results = calculateGroup(group({ unmatchedIds: ["a"] }));

    expect(byId(results, "a").flags).toContain("unmatched");
    expect(byId(results, "a").finalMark).toBe(70);
  });

  it("a group mean of zero does not divide by zero", () => {
    const results = calculateGroup(group({ ratings: uniformRatings(["a", "b", "c", "d"], 0) }));

    for (const result of results) {
      expect(Number.isFinite(result.adjustmentFactor)).toBe(true);
      expect(result.adjustmentFactor).toBe(DEFAULT_CONFIG.neutralFactor);
      expect(result.finalMark).toBe(70);
      // FR-22: "flag the group", since the mark was not adjusted.
      expect(result.flags).toContain("zero-group-mean");
    }
  });
});

describe("FR-20 - indicators, which never alter a mark", () => {
  it("flags a consistently low-rated student", () => {
    const ratings: Rating[] = [
      ...["b", "c", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "a", value: 25 })),
      ...["a", "c", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "b", value: 100 })),
      ...["a", "b", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "c", value: 100 })),
      ...["a", "b", "c"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "d", value: 100 })),
    ];
    const results = calculateGroup(group({ ratings }));

    expect(byId(results, "a").flags).toContain("low-contribution");
    expect(byId(results, "b").flags).not.toContain("low-contribution");
  });

  it("flags an incomplete group when fewer than half the members submitted", () => {
    const results = calculateGroup(group({ submittedIds: ["a"] }));
    for (const result of results) expect(result.flags).toContain("incomplete-group");
  });

  it("does not flag a group where exactly half submitted", () => {
    // FR-20 says "fewer than half". Two of four is half, not fewer.
    for (const result of calculateGroup(group({ submittedIds: ["a", "b"] }))) {
      expect(result.flags).not.toContain("incomplete-group");
    }
  });

  it("does not flag a group missing only one submission", () => {
    for (const result of calculateGroup(group({ submittedIds: ["a", "b", "c"] }))) {
      expect(result.flags).not.toContain("incomplete-group");
    }
  });

  it("does not flag an incomplete group when everybody submitted", () => {
    for (const result of calculateGroup(group())) {
      expect(result.flags).not.toContain("incomplete-group");
    }
  });

  it("flags the evaluator who gave everybody the same option, not the student rated", () => {
    // a rates everyone 75. b, c and d each discriminate. a also RECEIVES
    // identical ratings, which says nothing about how a filled in the form.
    const ratings: Rating[] = [
      ...["b", "c", "d"].map((evaluatedId) => ({ evaluatorId: "a", evaluatedId, value: 75 })),
      { evaluatorId: "b", evaluatedId: "a", value: 87.5 },
      { evaluatorId: "b", evaluatedId: "c", value: 62.5 },
      { evaluatorId: "b", evaluatedId: "d", value: 75 },
      { evaluatorId: "c", evaluatedId: "a", value: 87.5 },
      { evaluatorId: "c", evaluatedId: "b", value: 100 },
      { evaluatorId: "c", evaluatedId: "d", value: 50 },
      { evaluatorId: "d", evaluatedId: "a", value: 87.5 },
      { evaluatorId: "d", evaluatedId: "b", value: 75 },
      { evaluatorId: "d", evaluatedId: "c", value: 62.5 },
    ];
    const results = calculateGroup(group({ ratings }));

    expect(byId(results, "a").flags).toContain("uniform-rating");
    for (const id of ["b", "c", "d"]) {
      expect(byId(results, id).flags).not.toContain("uniform-rating");
    }
  });

  it("does not call a single rating uniform", () => {
    // In a group of two each member gives exactly one rating.
    const memberIds = ["a", "b"];
    const results = calculateGroup(
      group({ memberIds, ratings: uniformRatings(memberIds, 75), submittedIds: memberIds }),
    );

    for (const result of results) expect(result.flags).not.toContain("uniform-rating");
  });

  it("flags an isolated outlier", () => {
    const ratings: Rating[] = [
      { evaluatorId: "b", evaluatedId: "a", value: 100 },
      { evaluatorId: "c", evaluatedId: "a", value: 100 },
      { evaluatorId: "d", evaluatedId: "a", value: 0 },
      ...["a", "c", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "b", value: 75 })),
      ...["a", "b", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "c", value: 75 })),
      ...["a", "b", "c"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "d", value: 75 })),
    ];
    expect(byId(calculateGroup(group({ ratings })), "a").flags).toContain("isolated-outlier");
  });

  it("flags a reciprocal pair at opposite ends", () => {
    const ratings: Rating[] = [
      { evaluatorId: "a", evaluatedId: "b", value: 0 },
      { evaluatorId: "b", evaluatedId: "a", value: 100 },
      { evaluatorId: "c", evaluatedId: "a", value: 75 },
      { evaluatorId: "d", evaluatedId: "a", value: 75 },
      { evaluatorId: "c", evaluatedId: "b", value: 75 },
      { evaluatorId: "d", evaluatedId: "b", value: 75 },
    ];
    expect(byId(calculateGroup(group({ ratings })), "a").flags).toContain("reciprocal-extreme");
  });

  /**
   * The thresholds are configuration (OR-19), and the tests above prove only
   * that an extreme case trips them - they would pass at any value. These pin
   * the boundary, so a change to either default has to be deliberate.
   */
  describe("the thresholds are honoured, and are the approved ones", () => {
    it("uses the configured outlier threshold rather than a fixed one", () => {
      // a is rated Excellent once among Satisfactory: 10.08 from the group mean.
      const ratings: Rating[] = [
        { evaluatorId: "b", evaluatedId: "a", value: 100 },
        { evaluatorId: "c", evaluatedId: "a", value: 89 },
        { evaluatorId: "d", evaluatedId: "a", value: 89 },
        ...["a", "c", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "b", value: 89 })),
        ...["a", "b", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "c", value: 89 })),
        ...["a", "b", "c"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "d", value: 89 })),
      ];
      const at = (outlierThreshold: number) =>
        byId(calculateGroup(group({ ratings }), { ...DEFAULT_CONFIG, outlierThreshold }), "a")
          .flags;

      expect(at(10)).toContain("isolated-outlier");
      // One band's disagreement is not an outlier at the approved threshold.
      expect(at(20)).not.toContain("isolated-outlier");
    });

    it("uses the configured reciprocal threshold rather than double the outlier one", () => {
      // a and b are 25 apart on each other - four bands, not opposite ends.
      const ratings: Rating[] = [
        { evaluatorId: "a", evaluatedId: "b", value: 69 },
        { evaluatorId: "b", evaluatedId: "a", value: 94 },
        { evaluatorId: "c", evaluatedId: "a", value: 89 },
        { evaluatorId: "d", evaluatedId: "a", value: 89 },
        { evaluatorId: "c", evaluatedId: "b", value: 89 },
        { evaluatorId: "d", evaluatedId: "b", value: 89 },
      ];
      const at = (reciprocalThreshold: number) =>
        byId(calculateGroup(group({ ratings }), { ...DEFAULT_CONFIG, reciprocalThreshold }), "a")
          .flags;

      expect(at(20)).toContain("reciprocal-extreme");
      expect(at(40)).not.toContain("reciprocal-extreme");
    });

    it("carries the approved values (IS-04, provisional)", () => {
      // Changed 2026-09-23: at 10 and 20 these flagged 27 of 28 students on the
      // seeded data, which tells a lecturer nothing. 20 is four bands; 40 is
      // effectively opposite ends of a scale running 59 to 100.
      expect(DEFAULT_CONFIG.outlierThreshold).toBe(20);
      expect(DEFAULT_CONFIG.reciprocalThreshold).toBe(40);
      expect(DEFAULT_CONFIG.lowContributionThreshold).toBe(79);
    });
  });

  it("flags never change the mark", () => {
    const flagged = calculateGroup(group({ submittedIds: ["b"], unmatchedIds: ["a"] }));
    const clean = calculateGroup(group());

    expect(byId(flagged, "a").flags.length).toBeGreaterThan(0);
    expect(byId(flagged, "a").finalMark).toBe(byId(clean, "a").finalMark);
  });
});

describe("FR-22 - rounding happens only at the final step", () => {
  // On the banded scale: a is rated Excellent (100) by everyone; b, c and d
  // Very good (94). Group mean = (100 + 94 x 3) / 4 = 95.5, so a's factor is
  // 100 / 95.5 = 1.047120... and with a base mark of 71 the mark is
  // 74.3455... Rounding the factor to 1.0471 first gives 71 x 1.0471 =
  // 74.3441: the accumulated rounding error FR-22 and the Tester's Checklist
  // ("Approved rounding is applied only at the final step") both forbid.
  const ratings: Rating[] = [
    ...["b", "c", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "a", value: 100 })),
    ...["a", "c", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "b", value: 94 })),
    ...["a", "b", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "c", value: 94 })),
    ...["a", "b", "c"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "d", value: 94 })),
  ];

  // Pinned at two decimal places rather than the configured one.
  //
  // The rule being tested - that the factor is never rounded before it is
  // multiplied - is independent of the precision. But the error it prevents is
  // smaller than the rounding step, so at one decimal place both routes give
  // 74.3 and the test would pass no matter which way the code did it. Two
  // places is where this particular group makes the difference visible. The
  // test below covers the configured precision.
  it("computes the mark from the unrounded factor", () => {
    const twoPlaces = { ...DEFAULT_CONFIG, roundTo: 2 };
    const a = byId(calculateGroup(group({ ratings, baseMark: 71 }), twoPlaces), "a");

    expect(a.finalMark).toBe(74.35);
    // What rounding the factor first would have produced.
    expect(round(71 * round(a.adjustmentFactor, 4), 2)).toBe(74.34);
  });

  it("rounds to the approved precision, and only there", () => {
    // AS-08: one decimal place, confirmed 2026-09-23. A silent change to this
    // moves every student's mark, so it is asserted rather than assumed.
    expect(DEFAULT_CONFIG.roundTo).toBe(1);

    const a = byId(calculateGroup(group({ ratings, baseMark: 71 })), "a");
    expect(a.finalMark).toBe(74.3);
    // The factor itself is untouched: full precision, as FR-22 requires.
    expect(a.adjustmentFactor).toBe(100 / 95.5);
  });

  it("keeps every intermediate figure at full precision", () => {
    const a = byId(calculateGroup(group({ ratings, baseMark: 71 })), "a");

    expect(a.meanReceived).toBe(100);
    expect(a.groupMean).toBe(95.5);
    expect(a.rawFactor).toBe(100 / 95.5);
    // Inside the limits, the factor applied IS the raw factor, digit for digit.
    expect(a.adjustmentFactor).toBe(a.rawFactor);
  });

  it("makes the final mark exactly base x stored factor, rounded once", () => {
    for (const baseMark of [37, 58.5, 62, 74, 81.25, 99]) {
      for (const value of [12.5, 37.5, 62.5, 87.5, 100]) {
        const ratings: Rating[] = [
          ...["b", "c", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "a", value })),
          ...["a", "c", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "b", value: 61 })),
          ...["a", "b", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "c", value: 67 })),
          ...["a", "b", "c"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "d", value: 73 })),
        ];
        for (const result of calculateGroup(group({ ratings, baseMark }))) {
          expect(result.finalMark, `base ${baseMark}, factor ${result.adjustmentFactor}`).toBe(
            round(baseMark * result.adjustmentFactor, DEFAULT_CONFIG.roundTo),
          );
        }
      }
    }
  });

  it("still respects the limits", () => {
    const ratings: Rating[] = [
      ...["b", "c", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "a", value: 100 })),
      ...["a", "c", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "b", value: 25 })),
      ...["a", "b", "d"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "c", value: 25 })),
      ...["a", "b", "c"].map((evaluatorId) => ({ evaluatorId, evaluatedId: "d", value: 25 })),
    ];
    const a = byId(calculateGroup(group({ ratings })), "a");
    expect(a.adjustmentFactor).toBeLessThanOrEqual(DEFAULT_CONFIG.maxFactor);
  });
});

describe("calculateAssessment", () => {
  it("calculates each group against its own mean, not a shared one", () => {
    const strong = group({
      groupId: "g1",
      memberIds: ["a", "b"],
      ratings: uniformRatings(["a", "b"], 100),
      submittedIds: ["a", "b"],
      baseMark: 80,
    });
    const weak = group({
      groupId: "g2",
      memberIds: ["c", "d"],
      ratings: uniformRatings(["c", "d"], 25),
      submittedIds: ["c", "d"],
      baseMark: 60,
    });

    const results = calculateAssessment([strong, weak]);
    // Within each group everyone is equal, so every factor is 1 - a group rated
    // generously overall does not thereby out-earn one rated harshly.
    for (const result of results) expect(result.adjustmentFactor).toBe(1);
    expect(results.find((r) => r.studentId === "a")!.finalMark).toBe(80);
    expect(results.find((r) => r.studentId === "c")!.finalMark).toBe(60);
  });

  it("returns one result per member across every group", () => {
    const results = calculateAssessment([
      group({
        groupId: "g1",
        memberIds: ["a", "b"],
        ratings: uniformRatings(["a", "b"], 75),
        submittedIds: ["a", "b"],
      }),
      group({
        groupId: "g2",
        memberIds: ["c", "d"],
        ratings: uniformRatings(["c", "d"], 75),
        submittedIds: ["c", "d"],
      }),
    ]);

    expect(results).toHaveLength(4);
    expect(new Set(results.map((r) => r.groupId))).toEqual(new Set(["g1", "g2"]));
  });

  it("is deterministic", () => {
    const input = [group()];
    expect(calculateAssessment(input)).toEqual(calculateAssessment(input));
  });
});
