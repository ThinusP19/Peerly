/**
 * Mock "API" layer.
 *
 * Every function here is async and artificially delayed so loading and skeleton
 * states are visible. To move to the real Node.js/Express backend, replace the
 * bodies with `fetch()` calls — the signatures and return types stay the same.
 */
import {
  allGroups,
  assessments,
  auditEntries,
  calculatedResults,
  classes,
  enrolments,
  groupMarks,
  groups,
  importPreviewRows,
  peerRatings,
  ratingOptions,
  staffUsers,
  studentUsers,
  submissions,
  users,
} from "@/mocks/data";
import type {
  Assessment,
  AuditEntry,
  CalculatedResult,
  Class,
  Enrolment,
  Group,
  GroupMark,
  PeerRating,
  RatingOption,
  Submission,
  User,
} from "@/mocks/types";

export const NETWORK_DELAY = 550;

export function delay<T>(value: T, ms = NETWORK_DELAY): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/* ------------------------------- reads ------------------------------- */
export const getClasses = (lecturerId?: string): Promise<Class[]> =>
  delay(lecturerId ? classes.filter((c) => c.lecturerId === lecturerId) : classes);

export const getClass = (classId: string): Promise<Class | undefined> =>
  delay(classes.find((c) => c.id === classId));

export const getEnrolments = (classId: string): Promise<Enrolment[]> =>
  delay(enrolments.filter((e) => e.classId === classId));

export const getGroups = (classId: string): Promise<Group[]> =>
  delay(allGroups.filter((g) => g.classId === classId));

export const getAssessments = (classId?: string): Promise<Assessment[]> =>
  delay(classId ? assessments.filter((a) => a.classId === classId) : assessments);

export const getAssessment = (assessmentId: string): Promise<Assessment | undefined> =>
  delay(assessments.find((a) => a.id === assessmentId));

export const getRatingOptions = (): Promise<RatingOption[]> => delay(ratingOptions, 200);

export const getSubmissions = (assessmentId: string): Promise<Submission[]> =>
  delay(submissions.filter((s) => s.assessmentId === assessmentId));

export const getPeerRatings = (assessmentId: string): Promise<PeerRating[]> => {
  const ids = new Set(
    submissions.filter((s) => s.assessmentId === assessmentId).map((s) => s.id),
  );
  return delay(peerRatings.filter((r) => ids.has(r.submissionId)));
};

export const getGroupMarks = (assessmentId: string): Promise<GroupMark[]> =>
  delay(groupMarks.filter((m) => m.assessmentId === assessmentId));

export const getResults = (assessmentId: string): Promise<CalculatedResult[]> =>
  delay(calculatedResults.filter((r) => r.assessmentId === assessmentId));

export const getAuditEntries = (): Promise<AuditEntry[]> =>
  delay([...auditEntries].sort((a, b) => b.timestamp.localeCompare(a.timestamp)));

export const getStaffAccounts = (): Promise<User[]> => delay(staffUsers);

export const getStudents = (): Promise<User[]> => delay(studentUsers);

export const getUsers = (): Promise<User[]> => delay(users);

export const getImportPreview = () => delay(importPreviewRows, 900);

/* ------------------------------- writes ------------------------------ *
 * Prototype writes mutate the in-memory mock arrays only.
 * ------------------------------------------------------------------- */
export const setStaffAccountStatus = (userId: string, status: User["status"]) => {
  const account = staffUsers.find((u) => u.id === userId);
  if (account) account.status = status;
  return delay(account);
};

export const createStaffAccount = (input: Omit<User, "id" | "createdAt" | "status">) => {
  const account: User = {
    ...input,
    id: `u-${Math.random().toString(36).slice(2, 8)}`,
    status: "unverified",
    createdAt: new Date().toISOString(),
  };
  staffUsers.push(account);
  return delay(account);
};

export const setGroupBaseMark = (assessmentId: string, groupId: string, baseMark: number | null) => {
  const mark = groupMarks.find((m) => m.assessmentId === assessmentId && m.groupId === groupId);
  if (mark) mark.baseMark = baseMark;
  return delay(mark, 350);
};

export const setAssessmentStatus = (assessmentId: string, status: Assessment["status"]) => {
  const assessment = assessments.find((a) => a.id === assessmentId);
  if (assessment) assessment.status = status;
  return delay(assessment);
};

export const overrideMark = (
  assessmentId: string,
  studentId: string,
  mark: number,
  reason: string,
  by: string,
) => {
  const result = calculatedResults.find(
    (r) => r.assessmentId === assessmentId && r.studentId === studentId,
  );
  if (result) {
    result.override = { mark, reason, by, at: new Date().toISOString() };
  }
  return delay(result);
};

export const calculateMarks = (assessmentId: string) =>
  delay({ assessmentId, calculationRunId: `run-${new Date().toISOString().slice(0, 10)}-02` }, 1200);

/* Groups helpers used by generation/review screens. */
export const proposeGroups = (
  classId: string,
  mode: "count" | "size",
  value: number,
): Promise<Group[]> => {
  const memberIds = enrolments
    .filter((e) => e.classId === classId && e.matchStatus === "matched")
    .map((e) => e.userId!);
  const groupCount =
    mode === "count" ? Math.max(1, value) : Math.max(1, Math.ceil(memberIds.length / Math.max(1, value)));
  const proposed: Group[] = Array.from({ length: groupCount }, (_, i) => ({
    id: `proposed-${i + 1}`,
    classId,
    groupNumber: i + 1,
    memberStudentIds: [],
  }));
  memberIds.forEach((id, index) => {
    proposed[index % groupCount].memberStudentIds.push(id);
  });
  return delay(proposed, 900);
};

export const confirmedGroups = (classId: string) => groups.filter((g) => g.classId === classId);
