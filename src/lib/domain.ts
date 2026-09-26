/**
 * Derived domain logic shared across screens.
 *
 * Nothing here touches the network - it reshapes what `src/services/peerly.ts`
 * returns into the views the UI needs (student assessment state, the evaluation
 * matrix, flag copy). Keeping it separate means the screens stay presentational.
 */
import type {
  Assessment,
  AuditEventType,
  Enrolment,
  Group,
  PeerRating,
  RatingOption,
  ResultFlag,
  Submission,
  User,
} from "@/mocks/types";

/* ------------------------------------------------------------------ *
 * Result flags - every flag needs plain-language copy for the tooltip
 * ------------------------------------------------------------------ */
export const resultFlagMeta: Record<
  ResultFlag,
  { label: string; description: string; tone: "warning" | "danger" | "neutral" }
> = {
  "uniform-rating": {
    label: "Uniform rating",
    description:
      "This student gave every group member exactly the same rating, so their scores carry little information about who did what.",
    tone: "warning",
  },
  "reciprocal-extreme": {
    label: "Reciprocal extremes",
    description:
      "This student and another member rated each other at opposite ends of the scale, which usually points to a dispute rather than a difference in contribution.",
    tone: "danger",
  },
  "isolated-outlier": {
    label: "Isolated outlier",
    description:
      "One evaluator rated this student far away from what everyone else in the group said.",
    tone: "warning",
  },
  "incomplete-group": {
    label: "Incomplete group",
    description:
      "Fewer than half of this group submitted, so the ratings that did arrive are a weak basis for adjusting anyone's mark.",
    tone: "warning",
  },
  "low-contribution": {
    label: "Low contribution",
    description:
      "On average the group rated this student Marginal or lower - they sometimes failed to attend or to complete what was asked.",
    tone: "danger",
  },
  "no-submission": {
    label: "Did not submit",
    description: "This student did not rate their group members before the assessment closed.",
    tone: "danger",
  },
  "group-of-two": {
    label: "Group of two",
    description:
      "With only two members, each student is rated once, so the mean is very sensitive to a single opinion.",
    tone: "warning",
  },
  "group-of-one": {
    label: "Group of one",
    description:
      "This student has nobody else in their group, so there are no peer ratings to adjust their mark by. They receive the group mark unchanged.",
    tone: "warning",
  },
  unmatched: {
    label: "Unmatched",
    description:
      "This student could not be matched to the imported class list, so their result may be incomplete.",
    tone: "warning",
  },
  "not-peer-assessed": {
    label: "Not peer assessed",
    description:
      "Nobody in the group rated this student, so there is no factor to apply. They receive the group mark unchanged, which is not a peer-assessed mark.",
    tone: "danger",
  },
  "zero-base-mark": {
    label: "Group mark of zero",
    description:
      "This group's base mark is zero, so every member's mark is zero. Check it was entered deliberately.",
    tone: "danger",
  },
  "zero-group-mean": {
    label: "Whole group rated lowest",
    description:
      "Every rating in this group was the lowest option, so no factor can be calculated. Every member receives the group mark unchanged.",
    tone: "danger",
  },
  "capped-at-maximum": {
    label: "Capped at the maximum",
    description:
      "The adjusted mark came out above the assessment's maximum, so it was recorded as the maximum. A mark is never higher than what the assessment is out of.",
    tone: "neutral",
  },
};

/* ------------------------------------------------------------------ *
 * Audit events
 * ------------------------------------------------------------------ */
export const auditEventMeta: Record<AuditEventType, string> = {
  "account.created": "Account created",
  "account.updated": "Account changed",
  "account.activated": "Account activated",
  "account.deactivated": "Account deactivated",
  "class.imported": "Class list imported",
  "groups.confirmed": "Groups confirmed",
  "assessment.created": "Assessment created",
  "assessment.updated": "Assessment changed",
  "assessment.opened": "Assessment opened",
  "assessment.closed": "Assessment closed",
  "assessment.reopened": "Assessment re-opened",
  "marks.entered": "Group mark entered",
  "marks.calculated": "Marks calculated",
  "mark.overridden": "Mark overridden",
  "results.exported": "Results exported",
  "class.created": "Class created",
  "class.deleted": "Class deleted",
  "assessment.deleted": "Assessment deleted",
  "enrolment.resolved": "Match conflict resolved",
  "password.changed": "Password changed",
  "reminders.sent": "Reminders sent",
  "account.activation_resent": "Activation link resent",
};

/* ------------------------------------------------------------------ *
 * Enrolment + group lookups
 * ------------------------------------------------------------------ */

/**
 * Enrolments for unmatched/conflict students deliberately have no `userId`
 * (that is the whole point of those states), so match on student number.
 */
export const enrolmentForUser = (enrolments: Enrolment[], user: User | null) =>
  user?.studentNumber ? enrolments.find((e) => e.studentNumber === user.studentNumber) : undefined;

export const groupForStudent = (groups: Group[], studentId: string) =>
  groups.find((g) => g.memberStudentIds.includes(studentId));

/* ------------------------------------------------------------------ *
 * Student-facing assessment state
 * ------------------------------------------------------------------ */
export type StudentAssessmentState =
  "not-open" | "not-started" | "in-progress" | "submitted" | "closed-missed";

export const studentAssessmentStateLabel: Record<StudentAssessmentState, string> = {
  "not-open": "Not yet open",
  "not-started": "Not started",
  "in-progress": "In progress",
  submitted: "Submitted",
  "closed-missed": "Closed - not submitted",
};

export function studentAssessmentState(
  assessment: Assessment,
  submission: Submission | undefined,
  /** Injectable so the state can be tested without waiting for a deadline. */
  now: Date = new Date(),
): StudentAssessmentState {
  if (submission?.status === "submitted") return "submitted";
  if (assessment.status === "draft") return "not-open";
  if (assessment.status === "closed") return "closed-missed";
  // BR-05: the closing time closes it, whether or not the lecturer has pressed
  // the button yet. The API refuses work past this point, so offering "Start
  // evaluation" here would be inviting the student into a dead end.
  if (new Date(assessment.closesAt) <= now) return "closed-missed";
  if (submission?.status === "draft") return "in-progress";
  return "not-started";
}

/* ------------------------------------------------------------------ *
 * Evaluation matrix
 * ------------------------------------------------------------------ */
export interface MatrixCell {
  evaluatedId: string;
  isSelf: boolean;
  ratingOption?: RatingOption;
  comment?: string;
}

export interface MatrixRow {
  evaluatorId: string;
  submitted: boolean;
  cells: MatrixCell[];
  /** Mean of the values this evaluator handed out. */
  rowMean: number | null;
}

export interface Matrix {
  memberIds: string[];
  rows: MatrixRow[];
  /** Mean each member received, in `memberIds` order. */
  columnMeans: Array<number | null>;
  groupMean: number | null;
}

const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

export function buildMatrix(
  group: Group,
  submissions: Submission[],
  ratings: PeerRating[],
  ratingOptions: RatingOption[],
): Matrix {
  const memberIds = group.memberStudentIds;
  const optionById = new Map(ratingOptions.map((o) => [o.id, o]));

  const rows: MatrixRow[] = memberIds.map((evaluatorId) => {
    const submission = submissions.find((s) => s.evaluatorStudentId === evaluatorId);
    const given = submission ? ratings.filter((r) => r.submissionId === submission.id) : [];

    const cells: MatrixCell[] = memberIds.map((evaluatedId) => {
      if (evaluatedId === evaluatorId) return { evaluatedId, isSelf: true };
      const rating = given.find((r) => r.evaluatedStudentId === evaluatedId);
      return {
        evaluatedId,
        isSelf: false,
        ratingOption: rating ? optionById.get(rating.ratingOptionId) : undefined,
        comment: rating?.comment,
      };
    });

    return {
      evaluatorId,
      submitted: submission?.status === "submitted",
      cells,
      rowMean: mean(cells.flatMap((c) => (c.ratingOption ? [c.ratingOption.hiddenValue] : []))),
    };
  });

  const columnMeans = memberIds.map((_, columnIndex) =>
    mean(
      rows.flatMap((row) => {
        const cell = row.cells[columnIndex];
        return cell?.ratingOption ? [cell.ratingOption.hiddenValue] : [];
      }),
    ),
  );

  const allValues = rows.flatMap((row) =>
    row.cells.flatMap((c) => (c.ratingOption ? [c.ratingOption.hiddenValue] : [])),
  );

  return { memberIds, rows, columnMeans, groupMean: mean(allValues) };
}

/** How far a cell sits from the group mean, for the up/down highlight. */
export type Deviation = "above" | "below" | "normal";

export function deviationFrom(
  value: number | undefined,
  groupMean: number | null,
  // One step on the banded scale (0004), whose options sit about five apart.
  threshold = 5,
): Deviation {
  if (value == null || groupMean == null) return "normal";
  if (value >= groupMean + threshold) return "above";
  if (value <= groupMean - threshold) return "below";
  return "normal";
}

/* ------------------------------------------------------------------ *
 * Submission progress
 * ------------------------------------------------------------------ */
export interface SubmissionProgress {
  submitted: number;
  outstanding: number;
  total: number;
  percent: number;
}

export function submissionProgress(groups: Group[], submissions: Submission[]): SubmissionProgress {
  const expected = groups.flatMap((g) => g.memberStudentIds);
  const submitted = expected.filter((id) =>
    submissions.some((s) => s.evaluatorStudentId === id && s.status === "submitted"),
  ).length;
  const total = expected.length;
  return {
    submitted,
    outstanding: total - submitted,
    total,
    percent: total ? (submitted / total) * 100 : 0,
  };
}

/** How a student-facing assessment state renders as a status badge. */
export const studentStateBadge: Record<
  StudentAssessmentState,
  { status: "draft" | "not-started" | "in-progress" | "submitted" | "missed"; label: string }
> = {
  "not-open": { status: "draft", label: "Not yet open" },
  "not-started": { status: "not-started", label: "Not started" },
  "in-progress": { status: "in-progress", label: "In progress" },
  submitted: { status: "submitted", label: "Submitted" },
  "closed-missed": { status: "missed", label: "Closed - not submitted" },
};
