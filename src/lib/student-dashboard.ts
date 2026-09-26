import { formatDate } from "@/lib/format";
import type { Assessment, MatchStatus, Submission } from "@/mocks/types";

/**
 * The decisions behind the student's dashboard and evaluation form, kept free
 * of React so each one can be tested without a browser or a clock.
 */

/**
 * Whether an assessment still takes work from a student right now.
 *
 * BR-05: the closing time closes it, whether or not the lecturer has pressed
 * Close yet. The API refuses drafts and submissions past this point, so a form
 * that stays editable only collects answers that can never be sent.
 */
export function acceptsWork(
  assessment: Pick<Assessment, "status" | "closesAt">,
  now: Date = new Date(),
): boolean {
  return assessment.status === "open" && new Date(assessment.closesAt) > now;
}

/** What this browser knows about a draft, as the dashboard reads it. */
export interface LocalDraftState {
  submittedAt?: string;
  ratedCount: number;
  /** The student opened a submitted evaluation to change it on this device. */
  reopened?: boolean;
}

/**
 * The submission the dashboard should believe, combining the server's with
 * whatever this browser holds.
 *
 * The server's "submitted" always stands. Opening a submitted evaluation to
 * amend it keeps unsent changes on this device, but the server still holds the
 * submitted version and that is the one that counts - so the dashboard must not
 * start calling it "In progress", as if the submission had been withdrawn.
 */
export function dashboardSubmission(
  server: Submission | undefined,
  local: LocalDraftState | undefined,
): Submission | undefined {
  if (server?.status === "submitted") return server;
  if (!local) return server;
  if (local.submittedAt) {
    return { ...server, status: "submitted", submittedAt: local.submittedAt } as Submission;
  }
  if (local.ratedCount > 0) return { ...server, status: "draft" } as Submission;
  return server;
}

/** The line under a submitted assessment: past tense once it has closed. */
export function submittedMeta(
  assessment: Pick<Assessment, "status" | "closesAt">,
  options: { unsentChanges?: boolean } = {},
  now: Date = new Date(),
): string {
  const closed = assessment.status === "closed" || new Date(assessment.closesAt) <= now;
  const when = `${closed ? "closed" : "closes"} ${formatDate(assessment.closesAt)}`;
  // Only while it can still be sent: after the close the changes are moot.
  const unsent = options.unsentChanges && !closed ? " · your changes aren't sent yet" : "";
  return `Submitted · ${when}${unsent}`;
}

/**
 * Whether the dashboard should give way to a full-page explanation.
 *
 * Only when the student has nothing else to see: no assessment at all and no
 * class list that matched. A problem on one list never hides the assessments
 * open on another - those are shown with a notice beside them instead.
 */
export function needsEnrolmentExplanation(
  enrolments: ReadonlyArray<{ matchStatus: MatchStatus }>,
  assessmentCount: number,
): boolean {
  if (assessmentCount > 0) return false;
  return !enrolments.some((enrolment) => enrolment.matchStatus === "matched");
}

/** The class-list entries the student needs telling about, in the order given. */
export function enrolmentProblems<T extends { matchStatus: MatchStatus }>(
  enrolments: ReadonlyArray<T>,
): T[] {
  return enrolments.filter((enrolment) => enrolment.matchStatus !== "matched");
}
