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
  StudentRatingOption,
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

export const getClass = (classId: string): Promise<Class | null> =>
  delay(classes.find((c) => c.id === classId) ?? null);

export const getEnrolments = (classId: string): Promise<Enrolment[]> =>
  delay(enrolments.filter((e) => e.classId === classId));

export const getGroups = (classId: string): Promise<Group[]> =>
  delay(allGroups.filter((g) => g.classId === classId));

export const getAssessments = (classId?: string): Promise<Assessment[]> =>
  delay(classId ? assessments.filter((a) => a.classId === classId) : assessments);

export const getAssessment = (assessmentId: string): Promise<Assessment | null> =>
  delay(assessments.find((a) => a.id === assessmentId) ?? null);

export const getRatingOptions = (): Promise<RatingOption[]> => delay(ratingOptions, 200);

export const getSubmissions = (assessmentId: string): Promise<Submission[]> =>
  delay(submissions.filter((s) => s.assessmentId === assessmentId));

export const getPeerRatings = (assessmentId: string): Promise<PeerRating[]> => {
  const ids = new Set(submissions.filter((s) => s.assessmentId === assessmentId).map((s) => s.id));
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

export const setGroupBaseMark = (
  assessmentId: string,
  groupId: string,
  baseMark: number | null,
) => {
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
  delay(
    { assessmentId, calculationRunId: `run-${new Date().toISOString().slice(0, 10)}-02` },
    1200,
  );

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
    mode === "count"
      ? Math.max(1, value)
      : Math.max(1, Math.ceil(memberIds.length / Math.max(1, value)));
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

export const updateStaffAccount = (
  userId: string,
  changes: Pick<User, "name" | "surname" | "email" | "role">,
) => {
  const account = staffUsers.find((u) => u.id === userId);
  if (account) Object.assign(account, changes);
  return delay(account, 450);
};

/** An institution must always keep at least one administrator who can sign in. */
export const activeAdminCount = () =>
  staffUsers.filter((u) => u.role === "admin" && u.status === "active").length;

/**
 * Records a student's evaluation against the in-memory mock data so the
 * lecturer-facing screens reflect it in the same session. A real backend would
 * POST the ratings and return the persisted submission.
 */
export const submitEvaluation = (
  assessmentId: string,
  evaluatorStudentId: string,
  entries: Array<{ evaluatedStudentId: string; ratingOptionId: string; comment?: string }>,
) => {
  const submissionId = `sub-${assessmentId}-${evaluatorStudentId}`;
  const now = new Date().toISOString();

  const existing = submissions.find(
    (s) => s.assessmentId === assessmentId && s.evaluatorStudentId === evaluatorStudentId,
  );

  if (existing) {
    existing.status = "submitted";
    existing.submittedAt = now;
    existing.updatedAt = now;
  } else {
    submissions.push({
      id: submissionId,
      assessmentId,
      evaluatorStudentId,
      status: "submitted",
      submittedAt: now,
      updatedAt: now,
    });
  }

  const id = existing?.id ?? submissionId;
  for (let i = peerRatings.length - 1; i >= 0; i -= 1) {
    if (peerRatings[i].submissionId === id) peerRatings.splice(i, 1);
  }
  entries.forEach((entry) => peerRatings.push({ submissionId: id, ...entry }));

  return delay({ submissionId: id, submittedAt: now }, 900);
};

/* --------------------------- student portal -------------------------- */

export interface StudentAssessmentView {
  assessment: Assessment;
  klass: Class;
  group: Group;
  /** Everyone in the group except the student themselves. */
  members: User[];
  submission?: Submission;
}

/** The enrolment row a student maps to, matched on student number. */
export const getStudentEnrolment = (studentId: string): Promise<Enrolment | null> => {
  const student = users.find((u) => u.id === studentId);
  return delay(
    (student?.studentNumber
      ? enrolments.find((e) => e.studentNumber === student.studentNumber)
      : undefined) ?? null,
  );
};

/** Every assessment a student can see, with the group context they need. */
export const getStudentAssessments = (studentId: string): Promise<StudentAssessmentView[]> => {
  const memberGroups = allGroups.filter((g) => g.memberStudentIds.includes(studentId));

  const views = assessments
    .flatMap((assessment) => {
      const group = memberGroups.find((g) => assessment.groupIds.includes(g.id));
      const klass = classes.find((c) => c.id === assessment.classId);
      if (!group || !klass) return [];
      return [
        {
          assessment,
          klass,
          group,
          members: group.memberStudentIds
            .filter((id) => id !== studentId)
            .map((id) => users.find((u) => u.id === id))
            .filter((u): u is User => Boolean(u)),
          submission: submissions.find(
            (s) => s.assessmentId === assessment.id && s.evaluatorStudentId === studentId,
          ),
        },
      ];
    })
    .sort((a, b) => {
      // Open assessments first, then drafts by opening date, then closed.
      const rank = (status: Assessment["status"]) =>
        status === "open" ? 0 : status === "draft" ? 1 : 2;
      return (
        rank(a.assessment.status) - rank(b.assessment.status) ||
        a.assessment.closesAt.localeCompare(b.assessment.closesAt)
      );
    });

  return delay(views);
};

export const getStudentAssessment = (
  studentId: string,
  assessmentId: string,
): Promise<StudentAssessmentView | null> =>
  getStudentAssessments(studentId).then(
    (views) => views.find((view) => view.assessment.id === assessmentId) ?? null,
  );

/* --------------------------- lecturer portal ------------------------- */

export interface ClassSummary {
  klass: Class;
  studentCount: number;
  matchedCount: number;
  unmatchedCount: number;
  conflictCount: number;
  groupCount: number;
  assessmentCount: number;
  activeAssessment?: Assessment;
}

/** Everything the lecturer dashboard shows on each class card. */
export const getClassSummaries = (lecturerId: string): Promise<ClassSummary[]> => {
  const owned = classes.filter((c) => c.lecturerId === lecturerId);

  return delay(
    owned.map((klass) => {
      const classEnrolments = enrolments.filter((e) => e.classId === klass.id);
      const classGroups = allGroups.filter((g) => g.classId === klass.id);
      const classAssessments = assessments.filter((a) => a.classId === klass.id);

      // A class list has been imported for cls-1 only; other classes fall back
      // to counting distinct students across their confirmed groups.
      const studentCount = classEnrolments.length
        ? classEnrolments.length
        : new Set(classGroups.flatMap((g) => g.memberStudentIds)).size;

      return {
        klass,
        studentCount,
        matchedCount: classEnrolments.filter((e) => e.matchStatus === "matched").length,
        unmatchedCount: classEnrolments.filter((e) => e.matchStatus === "unmatched").length,
        conflictCount: classEnrolments.filter((e) => e.matchStatus === "conflict").length,
        groupCount: classGroups.length,
        assessmentCount: classAssessments.length,
        activeAssessment:
          classAssessments.find((a) => a.status === "open") ??
          classAssessments.find((a) => a.status === "draft"),
      };
    }),
  );
};

/** Enrolments joined to the account they matched to, for the class list screen. */
export interface EnrolmentRow extends Enrolment {
  account?: User;
  groupNumber?: number;
}

export const getEnrolmentRows = (classId: string): Promise<EnrolmentRow[]> =>
  delay(
    enrolments
      .filter((e) => e.classId === classId)
      .map((enrolment) => {
        const account = enrolment.userId
          ? users.find((u) => u.id === enrolment.userId)
          : users.find((u) => u.studentNumber === enrolment.studentNumber);
        const group = account
          ? allGroups.find((g) => g.classId === classId && g.memberStudentIds.includes(account.id))
          : undefined;
        return { ...enrolment, account, groupNumber: group?.groupNumber };
      }),
  );

/** Submission monitor: per-group breakdown plus who is still outstanding. */
export interface GroupProgressRow {
  group: Group;
  members: User[];
  submittedIds: string[];
  draftIds: string[];
  outstanding: User[];
}

export const getGroupProgress = (assessmentId: string): Promise<GroupProgressRow[]> => {
  const assessment = assessments.find((a) => a.id === assessmentId);
  if (!assessment) return delay([]);

  const assessmentSubmissions = submissions.filter((s) => s.assessmentId === assessmentId);

  return delay(
    allGroups
      .filter((g) => assessment.groupIds.includes(g.id))
      .map((group) => {
        const members = group.memberStudentIds
          .map((id) => users.find((u) => u.id === id))
          .filter((u): u is User => Boolean(u));

        const submittedIds = members
          .filter((m) =>
            assessmentSubmissions.some(
              (s) => s.evaluatorStudentId === m.id && s.status === "submitted",
            ),
          )
          .map((m) => m.id);

        const draftIds = members
          .filter((m) =>
            assessmentSubmissions.some(
              (s) => s.evaluatorStudentId === m.id && s.status === "draft",
            ),
          )
          .map((m) => m.id);

        return {
          group,
          members,
          submittedIds,
          draftIds,
          outstanding: members.filter((m) => !submittedIds.includes(m.id)),
        };
      }),
  );
};

export const createAssessment = (
  input: Omit<Assessment, "id" | "calculatedAt" | "calculationRunId">,
) => {
  const assessment: Assessment = { ...input, id: `asm-${Math.random().toString(36).slice(2, 7)}` };
  assessments.push(assessment);
  return delay(assessment, 700);
};

export const updateAssessment = (
  assessmentId: string,
  changes: Partial<Omit<Assessment, "id" | "classId">>,
) => {
  const assessment = assessments.find((a) => a.id === assessmentId);
  if (assessment) Object.assign(assessment, changes);
  return delay(assessment, 700);
};

/** Replaces the confirmed groups for a class with a proposed allocation. */
export const confirmGroups = (classId: string, proposed: Group[]) => {
  for (let i = allGroups.length - 1; i >= 0; i -= 1) {
    if (allGroups[i].classId === classId) allGroups.splice(i, 1);
  }
  proposed.forEach((group, index) =>
    allGroups.push({
      id: `grp-${classId}-${index + 1}`,
      classId,
      groupNumber: index + 1,
      memberStudentIds: [...group.memberStudentIds],
    }),
  );
  return delay(
    allGroups.filter((g) => g.classId === classId),
    800,
  );
};

export interface AssessmentRow {
  assessment: Assessment;
  groupCount: number;
  submitted: number;
  expected: number;
}

/** Assessment list rows, each with the submission progress bar's numbers. */
export const getAssessmentRows = (classId: string): Promise<AssessmentRow[]> =>
  delay(
    assessments
      .filter((a) => a.classId === classId)
      .map((assessment) => {
        const assessmentGroups = allGroups.filter((g) => assessment.groupIds.includes(g.id));
        const expectedIds = assessmentGroups.flatMap((g) => g.memberStudentIds);
        const submitted = submissions.filter(
          (s) =>
            s.assessmentId === assessment.id &&
            s.status === "submitted" &&
            expectedIds.includes(s.evaluatorStudentId),
        ).length;
        return {
          assessment,
          groupCount: assessmentGroups.length,
          submitted,
          expected: expectedIds.length,
        };
      })
      .sort((a, b) => b.assessment.opensAt.localeCompare(a.assessment.opensAt)),
  );

export interface ResultRow {
  result: CalculatedResult;
  student: User;
  group: Group;
  baseMark: number | null;
  /** Every rating this student received, with who gave it. */
  received: Array<{ evaluator: User; ratingOptionId: string; comment?: string }>;
}

/** Results summary rows, joined to everything the drill-down needs. */
export const getResultRows = (assessmentId: string): Promise<ResultRow[]> => {
  const assessment = assessments.find((a) => a.id === assessmentId);
  if (!assessment) return delay([]);

  const assessmentSubmissions = submissions.filter((s) => s.assessmentId === assessmentId);
  const submissionById = new Map(assessmentSubmissions.map((s) => [s.id, s]));

  const rows = calculatedResults
    .filter((result) => result.assessmentId === assessmentId)
    .flatMap((result) => {
      const student = users.find((u) => u.id === result.studentId);
      const group = allGroups.find((g) => g.memberStudentIds.includes(result.studentId));
      if (!student || !group) return [];

      const received = peerRatings
        .filter((rating) => rating.evaluatedStudentId === result.studentId)
        .flatMap((rating) => {
          const submission = submissionById.get(rating.submissionId);
          const evaluator = submission
            ? users.find((u) => u.id === submission.evaluatorStudentId)
            : undefined;
          return evaluator
            ? [{ evaluator, ratingOptionId: rating.ratingOptionId, comment: rating.comment }]
            : [];
        });

      return [
        {
          result,
          student,
          group,
          baseMark:
            groupMarks.find((m) => m.assessmentId === assessmentId && m.groupId === group.id)
              ?.baseMark ?? null,
          received,
        },
      ];
    });

  return delay(rows);
};

/**
 * Rating options for the student portal, with the numeric scale stripped out.
 * Student screens must use this, never `getRatingOptions`.
 */
export const getStudentRatingOptions = (): Promise<StudentRatingOption[]> =>
  delay(
    ratingOptions.map(({ hiddenValue: _hiddenValue, ...option }) => option),
    200,
  );
