/**
 * Mock "API" layer.
 *
 * Every function here is async and artificially delayed so loading and skeleton
 * states are visible. To move to the real Node.js/Express backend, replace the
 * bodies with `fetch()` calls - the signatures and return types stay the same.
 */
import { passwordChecks } from "@/lib/password";
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
  secondClassGroups,
  staffUsers,
  studentUsers,
  submissions,
  users,
} from "@/mocks/data";
import type {
  Assessment,
  AuditEntry,
  AuditEventType,
  CalculatedResult,
  Class,
  Enrolment,
  Group,
  GroupMark,
  PeerRating,
  RatingOption,
  Role,
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
  // Only ratings from *submitted* evaluations count for the lecturer-facing
  // matrix, results and calculation - an evaluator's draft is still theirs to
  // change, and half-finished ratings must never leak into marks (see #3).
  const ids = new Set(
    submissions
      .filter((s) => s.assessmentId === assessmentId && s.status === "submitted")
      .map((s) => s.id),
  );
  return delay(peerRatings.filter((r) => ids.has(r.submissionId)));
};

export const getGroupMarks = (assessmentId: string): Promise<GroupMark[]> =>
  delay(groupMarks.filter((m) => m.assessmentId === assessmentId));

export const getResults = (
  assessmentId: string,
): Promise<CalculatedResult[]> => {
  const assessment = assessments.find(
    (a) => a.id === assessmentId,
  );

  // Do not return results without a valid calculation.
  if (!assessment?.calculatedAt) return delay([]);

  return delay(
    calculatedResults.filter(
      (result) => result.assessmentId === assessmentId,
    ),
  );
};

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
  // Keep the combined list in step too, as registerAccount does - activation and
  // sign-in look accounts up there.
  staffUsers.push(account);
  users.push(account);
  return delay(account);
};

export const setGroupBaseMark = (
  assessmentId: string,
  groupId: string,
  baseMark: number | null,
) => {
  const mark = groupMarks.find((m) => m.assessmentId === assessmentId && m.groupId === groupId);
  if (mark) {
    mark.baseMark = baseMark;
    return delay(mark, 350);
  }
  // No row existed yet for this assessment/group pair (true for every
  // assessment except the seeded asm-1) - create it instead of silently
  // discarding the mark (see #5).
  const created: GroupMark = { assessmentId, groupId, baseMark };
  groupMarks.push(created);
  return delay(created, 350);
};

export const setAssessmentStatus = (
  assessmentId: string,
  status: Assessment["status"],
) => {
  const assessment = assessments.find(
    (a) => a.id === assessmentId
  );

  if (assessment) {

    // Reopening invalidates the previous calculation.
    if (assessment.status === "closed" && status === "open") {

      // Clear the old calculation information.
      assessment.calculatedAt = undefined;
      assessment.calculationRunId = undefined;

      // Remove outdated calculated student results.
      removeWhere(
        calculatedResults,
        (result) => result.assessmentId === assessmentId
      );
    }

    assessment.status = status;
  }

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

export class EvaluationError extends Error {}

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
  // FR-19/BR: once an assessment is no longer open (draft = not started,
  // closed = already marked), it can't accept new or changed submissions.
  const assessment = assessments.find((a) => a.id === assessmentId);
  if (
  !assessment ||
  assessment.status !== "open" ||
  Date.now() >= new Date(assessment.closesAt).getTime()
) {
    throw new EvaluationError(
      "This assessment is no longer accepting submissions. Refresh the page to see its current status.",
    );
  }

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

export class GroupRegenerationError extends Error {}

/** Replaces the confirmed groups for a class with a proposed allocation. */
export const confirmGroups = (classId: string, proposed: Group[]) => {
  // A closed assessment's marks, ratings and audit history are keyed to its
  // groupIds. Deleting and recreating groups under new ids would silently
  // orphan every one of those references (see #4) - so it's a hard stop, not
  // just a UI hint.
  const closedAssessment = assessments.find((a) => a.classId === classId && a.status === "closed");
  if (closedAssessment) {
    throw new GroupRegenerationError(
      `"${closedAssessment.name}" is closed and its results depend on the current groups. Regenerating would disconnect them.`,
    );
  }

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

// Only return results when a valid calculation exists.
if (!assessment?.calculatedAt) return delay([]);

  const assessmentSubmissions = submissions.filter(
    (s) => s.assessmentId === assessmentId && s.status === "submitted",
  );
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

/* --------------------------- registration ---------------------------- */

export class RegistrationError extends Error {
  constructor(
    override readonly message: string,
    readonly field: "email" | "studentNumber" | "password",
  ) {
    super(message);
  }
}

/**
 * Creates a self-registered account. Students land unverified and unmatched;
 * staff land unverified. Nothing is usable until `activateAccount` runs, which
 * is what the emailed link does (FR-03).
 */
export const registerAccount = (input: {
  role: Role;
  name: string;
  surname: string;
  email: string;
  studentNumber?: string;
  password: string;
}): Promise<User> => {
  const email = input.email.trim().toLowerCase();

  if (users.some((u) => u.email.toLowerCase() === email)) {
    throw new RegistrationError("An account already uses that email address.", "email");
  }
  if (input.studentNumber && users.some((u) => u.studentNumber === input.studentNumber)) {
    throw new RegistrationError("An account already uses that student number.", "studentNumber");
  }
  const failedCheck = passwordChecks(input.password, input).find((check) => !check.ok);
  if (failedCheck) throw new RegistrationError(failedCheck.error, "password");

  const user: User = {
    id: `u-${input.role}-${Math.random().toString(36).slice(2, 8)}`,
    role: input.role,
    name: input.name.trim(),
    surname: input.surname.trim(),
    email: input.email.trim(),
    studentNumber: input.studentNumber,
    status: "unverified",
    createdAt: new Date().toISOString(),
    // Students set their password at registration (see activate.tsx); it's
    // stored now so the activation link only needs to flip the status.
    password: input.password,
  };

  // Keep the role-specific lists in step with the combined one - screens read
  // from whichever suits them.
  (user.role === "student" ? studentUsers : staffUsers).push(user);
  users.push(user);

  // FR-27: every account creation belongs in the audit log, self-registered
  // ones included - it's a self-service action, so the new account is its
  // own actor (see #8).
  recordAudit(
    user,
    "account.created",
    `${user.name} ${user.surname} · ${user.email}`,
    `Self-registered as ${user.role}${user.studentNumber ? ` (${user.studentNumber})` : ""}`,
  );

  return delay(user, 800);
};

/**
 * Updates a registration that hasn't been verified yet, e.g. when a student goes
 * back and fixes a typo in their email before entering the code. Verified
 * accounts can't be changed this way.
 */
export const updatePendingRegistration = (
  userId: string,
  input: { name: string; surname: string; email: string; studentNumber: string },
): Promise<User> => {
  const user = users.find((u) => u.id === userId);
  if (!user || user.status !== "unverified") {
    throw new RegistrationError(
      "This registration can't be changed any more. Please sign in instead.",
      "email",
    );
  }

  const email = input.email.trim().toLowerCase();
  if (users.some((u) => u.id !== userId && u.email.toLowerCase() === email)) {
    throw new RegistrationError("An account already uses that email address.", "email");
  }
  if (users.some((u) => u.id !== userId && u.studentNumber === input.studentNumber)) {
    throw new RegistrationError("An account already uses that student number.", "studentNumber");
  }

  // `users` and `studentUsers` hold the same object, so both lists see this.
  user.name = input.name.trim();
  user.surname = input.surname.trim();
  user.email = input.email.trim();
  user.studentNumber = input.studentNumber;

  return delay(user, 600);
};

/**
 * Activates an account and, for a student, immediately attempts the class-list
 * match (FR-04). A student who is not on any imported list stays unmatched and
 * sees the explanation screen rather than an empty dashboard.
 */
export const activateAccount = (email: string, password?: string): Promise<User | null> => {
  const user = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  if (!user) return delay(null, 600);

  // Staff accounts (admin/lecturer) choose their password here, on first
  // activation - students already set theirs at registration and this call
  // gets no `password` argument for them, so their stored one is untouched.
  if (password) user.password = password;

  user.status = "active";

  if (user.role === "student" && user.studentNumber) {
    const enrolment = enrolments.find((e) => e.studentNumber === user.studentNumber);
    if (enrolment && !enrolment.userId) {
      enrolment.userId = user.id;
      enrolment.matchStatus = "matched";
      enrolment.matchNote = undefined;
    }
  }

  recordAudit(
    user,
    "account.activated",
    `${user.name} ${user.surname} · ${user.email}`,
    "Activated via emailed link",
  );

  return delay(user, 600);
};

/** What an activation link needs to know about its account. */
export interface ActivationAccount {
  name: string;
  email: string;
  role: Role;
}

/**
 * Looks up the account an activation link belongs to, so the page knows whether
 * the holder sets a password now (Admin Portal accounts, FR-01/FR-03) or already
 * chose one at registration (students).
 */
export const getActivationAccount = (email: string): Promise<ActivationAccount | null> => {
  const user = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  return delay(user ? { name: user.name, email: user.email, role: user.role } : null, 700);
};

/* ------------------------------ audit log ---------------------------- */

/** Appends an audit entry (FR-27). Nothing in the app edits or removes one. */
function recordAudit(
  actor: Pick<User, "name" | "surname" | "role">,
  eventType: AuditEventType,
  objectDescription: string,
  detail: string,
  classId?: string,
) {
  auditEntries.push({
    id: `aud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    actorName: `${actor.name} ${actor.surname}`,
    actorRole: actor.role,
    eventType,
    objectDescription,
    detail,
    classId,
  });
}

/* ------------------------------- classes ----------------------------- */

export class ClassError extends Error {
  constructor(
    override readonly message: string,
    readonly field: "moduleCode" | "name" | "academicPeriod",
  ) {
    super(message);
  }
}

/** FR-08: a lecturer creates a class. Its class list is imported afterwards. */
export const createClass = (
  input: { moduleCode: string; name: string; academicPeriod: string },
  lecturer: User,
): Promise<Class> => {
  const moduleCode = input.moduleCode.trim().toUpperCase();
  const duplicate = classes.some(
    (c) =>
      c.lecturerId === lecturer.id &&
      c.moduleCode === moduleCode &&
      c.academicPeriod === input.academicPeriod,
  );
  if (duplicate) {
    throw new ClassError(
      `You already have ${moduleCode} for ${input.academicPeriod}.`,
      "moduleCode",
    );
  }

  const klass: Class = {
    id: `cls-${Math.random().toString(36).slice(2, 8)}`,
    moduleCode,
    name: input.name.trim(),
    academicPeriod: input.academicPeriod,
    lecturerId: lecturer.id,
  };
  classes.push(klass);
  recordAudit(
    lecturer,
    "class.created",
    `${klass.moduleCode} - ${klass.name}`,
    `Created for ${klass.academicPeriod}`,
    klass.id,
  );
  return delay(klass, 650);
};

/* ---------------------------- match conflicts ------------------------ */

/** Registered student accounts that claim an enrolment's student number (FR-04). */
export const getConflictCandidates = (enrolmentId: string): Promise<User[]> => {
  const enrolment = enrolments.find((e) => e.id === enrolmentId);
  return delay(
    enrolment ? studentUsers.filter((u) => u.studentNumber === enrolment.studentNumber) : [],
    350,
  );
};

export type ConflictDecision = { kind: "link"; userId: string } | { kind: "reject" };

/**
 * FR-04: a lecturer settles a Conflict by linking the class-list entry to one
 * account, or to none. Linking is what grants that account the class's data.
 */
export const resolveEnrolmentConflict = (
  enrolmentId: string,
  decision: ConflictDecision,
  lecturer: User,
): Promise<Enrolment> => {
  const enrolment = enrolments.find((e) => e.id === enrolmentId);
  if (!enrolment || enrolment.matchStatus !== "conflict") {
    throw new Error("This entry no longer has a conflict to resolve.");
  }
  const listed = `${enrolment.importedName} ${enrolment.importedSurname} (${enrolment.studentNumber})`;

  if (decision.kind === "link") {
    const account = studentUsers.find((u) => u.id === decision.userId);
    if (!account) throw new Error("That account no longer exists.");
    enrolment.matchStatus = "matched";
    enrolment.userId = account.id;
    enrolment.matchNote = undefined;
    recordAudit(
      lecturer,
      "enrolment.resolved",
      listed,
      `Linked to ${account.name} ${account.surname} (${account.email})`,
      enrolment.classId,
    );
  } else {
    enrolment.matchStatus = "unmatched";
    enrolment.userId = undefined;
    enrolment.matchNote =
      "Not linked: the conflict was reviewed and no account was matched to this entry.";
    recordAudit(
      lecturer,
      "enrolment.resolved",
      listed,
      "Reviewed and left unmatched",
      enrolment.classId,
    );
  }

  return delay(enrolment, 600);
};

/* -------------------------------- deletion --------------------------- */

/** Removes every item matching `predicate` from `list`, in place. */
function removeWhere<T>(list: T[], predicate: (item: T) => boolean) {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (predicate(list[i])) list.splice(i, 1);
  }
}

function deleteAssessmentRecords(assessmentId: string) {
  const submissionIds = new Set(
    submissions.filter((s) => s.assessmentId === assessmentId).map((s) => s.id),
  );
  removeWhere(peerRatings, (r) => submissionIds.has(r.submissionId));
  removeWhere(submissions, (s) => s.assessmentId === assessmentId);
  removeWhere(groupMarks, (m) => m.assessmentId === assessmentId);
  removeWhere(calculatedResults, (r) => r.assessmentId === assessmentId);
  removeWhere(assessments, (a) => a.id === assessmentId);
}

/**
 * Whether an assessment holds ratings or marks that were never exported, in
 * which case deleting it must be confirmed a second time (FR-28).
 */
export const hasUnexportedAssessmentData = (assessment: Assessment) =>
  !assessment.exportedAt &&
  (Boolean(assessment.calculatedAt) ||
    submissions.some((s) => s.assessmentId === assessment.id && s.status === "submitted"));

export const hasUnexportedClassData = (classId: string) =>
  assessments.some((a) => a.classId === classId && hasUnexportedAssessmentData(a));

/**
 * FR-28: permanently deletes an assessment with its submissions, ratings,
 * comments, base marks and results. The audit entry about the deletion stays.
 */
export const deleteAssessment = (assessmentId: string, lecturer: User) => {
  const assessment = assessments.find((a) => a.id === assessmentId);
  if (!assessment) return delay(null);
  const klass = classes.find((c) => c.id === assessment.classId);
  const unexported = hasUnexportedAssessmentData(assessment);

  deleteAssessmentRecords(assessmentId);
  recordAudit(
    lecturer,
    "assessment.deleted",
    `${klass?.moduleCode ?? ""} · ${assessment.name}`,
    unexported ? "Deleted without an export, confirmed twice" : "Deleted",
    assessment.classId,
  );
  return delay(assessment, 700);
};

/** FR-28: permanently deletes a class with its class list, groups and assessments. */
export const deleteClass = (classId: string, lecturer: User) => {
  const klass = classes.find((c) => c.id === classId);
  if (!klass) return delay(null);
  const classAssessments = assessments.filter((a) => a.classId === classId);
  const unexported = hasUnexportedClassData(classId);

  classAssessments.forEach((a) => deleteAssessmentRecords(a.id));
  removeWhere(enrolments, (e) => e.classId === classId);
  // Groups live in three lists; clear the class from each.
  for (const list of [groups, secondClassGroups, allGroups]) {
    removeWhere(list, (g) => g.classId === classId);
  }
  removeWhere(classes, (c) => c.id === classId);

  recordAudit(
    lecturer,
    "class.deleted",
    `${klass.moduleCode} - ${klass.name}`,
    `Deleted with its class list, groups and ${classAssessments.length} assessment(s)${
      unexported ? ", including data never exported (confirmed twice)" : ""
    }`,
    classId,
  );
  return delay(klass, 800);
};

/** FR-25: records that an assessment's results have been exported. */
export const markResultsExported = (assessmentId: string, lecturer: User) => {
  const assessment = assessments.find((a) => a.id === assessmentId);
  if (!assessment) return delay(null);
  const klass = classes.find((c) => c.id === assessment.classId);
  assessment.exportedAt = new Date().toISOString();
  recordAudit(
    lecturer,
    "results.exported",
    `${klass?.moduleCode ?? ""} · ${assessment.name}`,
    `Exported calculation run ${assessment.calculationRunId ?? "(not calculated)"}`,
    assessment.classId,
  );
  return delay(assessment, 300);
};

/* -------------------------------- passwords -------------------------- */

export class PasswordChangeError extends Error {
  constructor(
    override readonly message: string,
    readonly field: "current" | "next",
  ) {
    super(message);
  }
}

/**
 * FR-06: change a known password. The current password comes first and must
 * match the account's stored one (SR-01), the new one must meet SR-02, and
 * every other session for the account ends (SR-05).
 */
export const changePassword = (user: User, current: string, next: string) => {
  if (!current) throw new PasswordChangeError("Enter your current password.", "current");
  if (user.password === undefined || current !== user.password) {
    throw new PasswordChangeError("That's not your current password.", "current");
  }
  const failed = passwordChecks(next, user).find((check) => !check.ok);
  if (failed) throw new PasswordChangeError(failed.error, "next");
  if (current === next) {
    throw new PasswordChangeError("Choose a password different from your current one.", "next");
  }

  // Persist the new password on the same object `users`/`staffUsers`/
  // `studentUsers` share, so every screen sees it immediately.
  user.password = next;

  recordAudit(
    user,
    "password.changed",
    `${user.name} ${user.surname} · ${user.email}`,
    "Password changed; other sessions signed out",
  );
  return delay(true, 700);
};
