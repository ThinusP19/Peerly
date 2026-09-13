/**
 * Peerly domain types.
 *
 * These mirror the shape a real Node.js/Express + PostgreSQL API would return,
 * so swapping `src/mocks/*` for HTTP calls in `src/services/*` is a small change.
 */

export type Role = "admin" | "lecturer" | "student";
export type UserStatus = "active" | "inactive" | "unverified";

export interface User {
  id: string;
  role: Role;
  name: string;
  surname: string;
  email: string;
  studentNumber?: string;
  status: UserStatus;
  createdAt: string;
}

export interface Class {
  id: string;
  moduleCode: string;
  name: string;
  lecturerId: string;
  academicPeriod: string;
}

export type MatchStatus = "matched" | "unmatched" | "conflict";

export interface Enrolment {
  id: string;
  classId: string;
  studentNumber: string;
  importedName: string;
  importedSurname: string;
  matchStatus: MatchStatus;
  userId?: string;
  matchNote?: string;
}

export interface Group {
  id: string;
  classId: string;
  groupNumber: number;
  memberStudentIds: string[];
}

export type AssessmentStatus = "draft" | "open" | "closed";

export interface Assessment {
  id: string;
  classId: string;
  name: string;
  description: string;
  groupIds: string[];
  status: AssessmentStatus;
  opensAt: string;
  closesAt: string;
  maxMark: number;
  calculatedAt?: string;
  calculationRunId?: string;
}

export interface RatingOption {
  id: string;
  label: string;
  description: string;
  /** Lecturer-facing only. Never render this in a student-facing screen. */
  hiddenValue: number;
  order: number;
}

export type SubmissionStatus = "draft" | "submitted";

export interface Submission {
  id: string;
  assessmentId: string;
  evaluatorStudentId: string;
  status: SubmissionStatus;
  submittedAt?: string;
  updatedAt: string;
}

export interface PeerRating {
  submissionId: string;
  evaluatedStudentId: string;
  ratingOptionId: string;
  comment?: string;
}

export interface GroupMark {
  assessmentId: string;
  groupId: string;
  baseMark: number | null;
}

export type ResultFlag =
  | "uniform-rating"
  | "reciprocal-extreme"
  | "isolated-outlier"
  | "incomplete-group"
  | "low-contribution"
  | "no-submission"
  | "group-of-two"
  | "unmatched";

export interface MarkOverride {
  mark: number;
  reason: string;
  by: string;
  at: string;
}

export interface CalculatedResult {
  studentId: string;
  assessmentId: string;
  meanReceived: number;
  adjustmentFactor: number;
  finalMark: number;
  flags: ResultFlag[];
  override?: MarkOverride;
}

export type AuditEventType =
  | "account.created"
  | "account.activated"
  | "account.deactivated"
  | "class.imported"
  | "groups.confirmed"
  | "assessment.created"
  | "assessment.opened"
  | "assessment.closed"
  | "assessment.reopened"
  | "marks.entered"
  | "marks.calculated"
  | "mark.overridden"
  | "results.exported";

export interface AuditEntry {
  id: string;
  timestamp: string;
  actorName: string;
  actorRole: Role;
  eventType: AuditEventType;
  objectDescription: string;
  detail: string;
  classId?: string;
}

/**
 * The rating option shape a student is allowed to see.
 *
 * `hiddenValue` is deliberately absent: the numeric scale behind each label is
 * lecturer-only and must not appear in any student-facing screen - or in the
 * API response a student role receives.
 */
export type StudentRatingOption = Omit<RatingOption, "hiddenValue">;
