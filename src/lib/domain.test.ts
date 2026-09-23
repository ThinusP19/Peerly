import { describe, expect, it } from "vitest";

import {
  buildMatrix,
  deviationFrom,
  enrolmentForUser,
  groupForStudent,
  studentAssessmentState,
  submissionProgress,
} from "./domain";
import type {
  Assessment,
  Enrolment,
  Group,
  PeerRating,
  RatingOption,
  Submission,
  User,
} from "@/mocks/types";

/* ------------------------------------------------------------------ *
 * Fixtures - deliberately small so an expected value can be worked out
 * by hand and checked against the FSD rather than against the code.
 * ------------------------------------------------------------------ */

const options: RatingOption[] = [
  { id: "ro-1", label: "Excellent", description: "", hiddenValue: 100, order: 1 },
  { id: "ro-3", label: "Satisfactory", description: "", hiddenValue: 75, order: 3 },
  { id: "ro-5", label: "Marginal", description: "", hiddenValue: 50, order: 5 },
  { id: "ro-9", label: "No contribution", description: "", hiddenValue: 0, order: 9 },
];

const group: Group = {
  id: "g1",
  classId: "c1",
  groupNumber: 1,
  memberStudentIds: ["s1", "s2", "s3"],
};

const submission = (evaluator: string, status: Submission["status"] = "submitted"): Submission => ({
  id: `sub-${evaluator}`,
  assessmentId: "a1",
  evaluatorStudentId: evaluator,
  status,
  submittedAt: status === "submitted" ? "2026-08-27T10:00:00Z" : undefined,
  updatedAt: "2026-08-27T10:00:00Z",
});

const rating = (evaluator: string, evaluated: string, optionId: string): PeerRating => ({
  submissionId: `sub-${evaluator}`,
  evaluatedStudentId: evaluated,
  ratingOptionId: optionId,
});

const assessment = (status: Assessment["status"]): Assessment => ({
  id: "a1",
  classId: "c1",
  name: "Phase 2",
  description: "",
  groupIds: ["g1"],
  status,
  opensAt: "2026-08-24T08:00:00Z",
  closesAt: "2026-09-04T22:00:00Z",
  maxMark: 100,
});

/* ------------------------------------------------------------------ *
 * buildMatrix - FR-19
 * ------------------------------------------------------------------ */

describe("buildMatrix (FR-19)", () => {
  // s1 and s2 submit; s3 does not. Every rating is "Excellent" (100) except
  // s2 -> s1, which is "Marginal" (50).
  const submissions = [submission("s1"), submission("s2")];
  const ratings = [
    rating("s1", "s2", "ro-1"),
    rating("s1", "s3", "ro-1"),
    rating("s2", "s1", "ro-5"),
    rating("s2", "s3", "ro-1"),
  ];
  const matrix = buildMatrix(group, submissions, ratings, options);

  it("produces one row per member, in membership order", () => {
    expect(matrix.rows.map((row) => row.evaluatorId)).toEqual(["s1", "s2", "s3"]);
    expect(matrix.memberIds).toEqual(["s1", "s2", "s3"]);
  });

  it("marks the diagonal as self and never rates it", () => {
    matrix.rows.forEach((row, index) => {
      const diagonal = row.cells[index];
      expect(diagonal.isSelf).toBe(true);
      expect(diagonal.ratingOption).toBeUndefined();
    });
  });

  it("distinguishes a non-submitting evaluator from a low rating (user story 9)", () => {
    const missing = matrix.rows.find((row) => row.evaluatorId === "s3")!;
    expect(missing.submitted).toBe(false);
    // Its cells must be empty rather than zero - a blank readable as 0 would
    // silently drag the evaluated students' means down.
    expect(missing.cells.every((cell) => cell.ratingOption === undefined)).toBe(true);
    expect(missing.rowMean).toBeNull();
  });

  it("computes the mean given by each evaluator", () => {
    expect(matrix.rows.find((r) => r.evaluatorId === "s1")!.rowMean).toBe(100); // 100, 100
    expect(matrix.rows.find((r) => r.evaluatorId === "s2")!.rowMean).toBe(75); // 50, 100
  });

  it("computes the mean received per member, excluding missing responses", () => {
    const [s1, s2, s3] = matrix.columnMeans;
    expect(s1).toBe(50); // only s2 rated s1
    expect(s2).toBe(100); // only s1 rated s2
    expect(s3).toBe(100); // s1 and s2 both rated s3 at 100
  });

  it("computes the group mean over every rating actually given", () => {
    expect(matrix.groupMean).toBe(87.5); // (100 + 100 + 50 + 100) / 4
  });

  it("returns a null group mean when nobody submitted", () => {
    const empty = buildMatrix(group, [], [], options);
    expect(empty.groupMean).toBeNull();
    expect(empty.columnMeans).toEqual([null, null, null]);
  });
});

/* ------------------------------------------------------------------ *
 * deviationFrom - FR-19 highlighting
 * ------------------------------------------------------------------ */

describe("deviationFrom (FR-19)", () => {
  it("flags a value materially above the group mean", () => {
    expect(deviationFrom(100, 89)).toBe("above");
  });

  it("flags a value materially below the group mean", () => {
    expect(deviationFrom(79, 89)).toBe("below");
  });

  it("treats a value inside the threshold as normal", () => {
    expect(deviationFrom(91, 89)).toBe("normal");
  });

  it("treats the threshold itself as material, at both ends", () => {
    // One step either side of Satisfactory (89) on the banded scale.
    expect(deviationFrom(94, 89)).toBe("above");
    expect(deviationFrom(84, 89)).toBe("below");
  });

  it("is normal when there is nothing to compare against", () => {
    expect(deviationFrom(undefined, 75)).toBe("normal");
    expect(deviationFrom(100, null)).toBe("normal");
  });
});

/* ------------------------------------------------------------------ *
 * submissionProgress - FR-18
 * ------------------------------------------------------------------ */

describe("submissionProgress (FR-18)", () => {
  it("counts only submitted evaluations, not drafts", () => {
    const progress = submissionProgress([group], [submission("s1"), submission("s2", "draft")]);
    expect(progress).toEqual({ submitted: 1, outstanding: 2, total: 3, percent: (1 / 3) * 100 });
  });

  it("reports complete when everyone has submitted", () => {
    const progress = submissionProgress(
      [group],
      [submission("s1"), submission("s2"), submission("s3")],
    );
    expect(progress.outstanding).toBe(0);
    expect(progress.percent).toBe(100);
  });

  it("does not divide by zero when there are no members", () => {
    const progress = submissionProgress([], []);
    expect(progress).toEqual({ submitted: 0, outstanding: 0, total: 0, percent: 0 });
  });
});

/* ------------------------------------------------------------------ *
 * studentAssessmentState - FR-14
 * ------------------------------------------------------------------ */

describe("studentAssessmentState (FR-14)", () => {
  it("reports a draft assessment as not yet open", () => {
    expect(studentAssessmentState(assessment("draft"), undefined)).toBe("not-open");
  });

  it("reports an open assessment with no submission as not started", () => {
    expect(studentAssessmentState(assessment("open"), undefined)).toBe("not-started");
  });

  it("reports an open assessment with a draft as in progress", () => {
    expect(studentAssessmentState(assessment("open"), submission("s1", "draft"))).toBe(
      "in-progress",
    );
  });

  it("reports a submitted evaluation as submitted", () => {
    expect(studentAssessmentState(assessment("open"), submission("s1"))).toBe("submitted");
  });

  it("reports a closed assessment with nothing submitted as missed", () => {
    expect(studentAssessmentState(assessment("closed"), undefined)).toBe("closed-missed");
  });

  it("keeps a submitted state after closure - closing must not erase a submission", () => {
    expect(studentAssessmentState(assessment("closed"), submission("s1"))).toBe("submitted");
  });
});

/* ------------------------------------------------------------------ *
 * Enrolment and group lookup - FR-04, BR-10
 * ------------------------------------------------------------------ */

describe("enrolmentForUser (FR-04)", () => {
  const enrolments: Enrolment[] = [
    {
      id: "e1",
      classId: "c1",
      studentNumber: "41200345",
      importedName: "Amahle",
      importedSurname: "Zulu",
      matchStatus: "matched",
      userId: "s1",
    },
    {
      id: "e2",
      classId: "c1",
      studentNumber: "41204181",
      importedName: "Dumisani",
      importedSurname: "Ngcobo",
      matchStatus: "unmatched",
    },
  ];

  const student = (id: string, studentNumber?: string): User => ({
    id,
    role: "student",
    name: "Test",
    surname: "Student",
    email: "t@mynwu.ac.za",
    studentNumber,
    status: "active",
    createdAt: "2026-08-01T00:00:00Z",
  });

  it("matches on student number, which is the FSD's designated key", () => {
    expect(enrolmentForUser(enrolments, student("s1", "41200345"))?.id).toBe("e1");
  });

  it("finds an unmatched enrolment even though it carries no userId", () => {
    // The whole point of the unmatched state is that no userId is set, so a
    // lookup by userId would wrongly report the student as not enrolled at all.
    expect(enrolmentForUser(enrolments, student("s9", "41204181"))?.matchStatus).toBe("unmatched");
  });

  it("returns undefined for a user with no student number", () => {
    expect(enrolmentForUser(enrolments, student("u-lec-1"))).toBeUndefined();
    expect(enrolmentForUser(enrolments, null)).toBeUndefined();
  });
});

describe("groupForStudent (BR-10)", () => {
  const groups: Group[] = [
    group,
    { id: "g2", classId: "c1", groupNumber: 2, memberStudentIds: ["s4", "s5"] },
  ];

  it("finds the one group a student belongs to", () => {
    expect(groupForStudent(groups, "s4")?.id).toBe("g2");
  });

  it("returns undefined for an unallocated student (FR-23)", () => {
    expect(groupForStudent(groups, "s99")).toBeUndefined();
  });
});
