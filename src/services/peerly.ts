/**
 * The API layer.
 *
 * Every function here now calls the Express API over HTTP. The signatures are
 * unchanged from the mock versions they replaced, which is what the file was
 * shaped for: a screen never knew whether its data crossed a network.
 *
 * Access is not decided here and never was. Every endpoint re-checks on the
 * server who is asking and whether the thing is theirs (FR-07, SR-07), so a
 * caller that forgets to filter gets a 404 rather than somebody else's class.
 *
 */
import { ApiError, get, post, request, type ApiErrorBody } from "@/lib/api";
import type {
  Assessment,
  MarkOverride,
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

/* ------------------------------- reads ------------------------------- *
 *
 * These now call the API. The signatures are unchanged from the mock versions
 * they replaced, which is what the whole file was shaped for: a screen does not
 * know or care that its data crossed a network.
 *
 * Access is not decided here. Every one of these endpoints re-checks on the
 * server who is asking and whether the thing is theirs (FR-07, SR-07), so a
 * caller that omits a filter gets a 404, not somebody else's class.
 */

/**
 * An id that has not been chosen yet.
 *
 * "Nothing selected" is a real state - a lecturer with no assessments, a
 * screen rendering before its context resolved - and it is not an error. It
 * used to become `/api/assessments//results`, which is a 404 and looks like a
 * fault. These helpers let a read answer emptily instead of asking.
 */
const unset = (id: string | undefined): id is undefined | "" => !id;

/**
 * The lecturer's classes.
 *
 * `lecturerId` is ignored: the server scopes to the signed-in account, and
 * passing an id that the server does not honour would be an invitation to
 * believe it did. Kept in the signature so the callers need not all change at
 * once, and removed when they have.
 */
export const getClasses = async (_lecturerId?: string): Promise<Class[]> => {
  const { classes } = await get<{ classes: Array<{ klass: Class }> }>("/api/classes");
  return classes.map((entry) => entry.klass);
};

export const getClass = async (classId: string): Promise<Class | null> => {
  if (unset(classId)) return null;
  try {
    const { klass } = await get<{ klass: Class }>(`/api/classes/${classId}`);
    return klass;
  } catch (error) {
    // SR-07 refuses "not yours" and "does not exist" identically, so both
    // arrive here as a 404 and both mean the same thing to a screen: nothing
    // to show.
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
};

export const getEnrolments = async (classId: string): Promise<Enrolment[]> =>
  unset(classId)
    ? []
    : (await get<{ enrolments: EnrolmentRow[] }>(`/api/classes/${classId}/enrolments`)).enrolments;

/**
 * Everyone in a class's groups, so a screen can put a name to a student id.
 *
 * Lecturer-only, and it carries the e-mail because FR-18 asks the lecturer to
 * chase outstanding submissions - a name alone is not something you can contact.
 */
export const getClassRoster = async (classId: string): Promise<User[]> =>
  unset(classId)
    ? []
    : (await get<{ students: User[] }>(`/api/classes/${classId}/roster`)).students;

export const getGroups = async (classId: string): Promise<Group[]> =>
  unset(classId) ? [] : (await get<{ groups: Group[] }>(`/api/classes/${classId}/groups`)).groups;

export const getAssessments = async (classId?: string): Promise<Assessment[]> => {
  if (!classId) return [];
  const rows = await getAssessmentRows(classId);
  return rows.map((row) => row.assessment);
};

export const getAssessment = async (assessmentId: string): Promise<Assessment | null> => {
  if (unset(assessmentId)) return null;
  try {
    const { assessment } = await get<{ assessment: Assessment }>(
      `/api/assessments/${assessmentId}`,
    );
    return assessment;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
};

export const getRatingOptions = async (): Promise<RatingOption[]> =>
  (await get<{ options: RatingOption[] }>("/api/assessments/rating-options")).options;

export const getSubmissions = async (assessmentId: string): Promise<Submission[]> =>
  unset(assessmentId)
    ? []
    : (await get<{ submissions: Submission[] }>(`/api/assessments/${assessmentId}/submissions`))
        .submissions;

export const getPeerRatings = async (assessmentId: string): Promise<PeerRating[]> =>
  unset(assessmentId)
    ? []
    : (await get<{ ratings: PeerRating[] }>(`/api/assessments/${assessmentId}/ratings`)).ratings;

export const getGroupMarks = async (assessmentId: string): Promise<GroupMark[]> =>
  unset(assessmentId)
    ? []
    : (await get<{ marks: GroupMark[] }>(`/api/assessments/${assessmentId}/marks`)).marks;

export const getResults = async (assessmentId: string): Promise<CalculatedResult[]> =>
  (await getResultRows(assessmentId)).map((row) => row.result);

/**
 * The audit log (FR-27).
 *
 * Scoping is the server's: a lecturer is given their own classes' entries, an
 * administrator the whole trail. The filters run there too, over every entry:
 * filtering in the browser only ever saw the newest page, so older entries
 * could not be found at all.
 */
export interface AuditQuery {
  eventType?: AuditEventType;
  /** e.g. "account." for every account event. */
  eventPrefix?: string;
  /** `YYYY-MM-DD`, inclusive, a South African calendar day. */
  fromDate?: string;
  toDate?: string;
  classId?: string;
  /** `nextCursor` from the previous page. */
  cursor?: string;
  limit?: number;
}

export interface AuditPage {
  entries: AuditEntry[];
  /** Every entry that matches the filters, not only those on this page. */
  total: number;
  nextCursor?: string;
}

export const getAuditPage = async (filters: AuditQuery = {}): Promise<AuditPage> => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const search = params.toString();
  return get<AuditPage>(`/api/audit${search ? `?${search}` : ""}`);
};

export const getStaffAccounts = async (): Promise<User[]> =>
  (await get<{ accounts: User[] }>("/api/accounts")).accounts;

/* ------------------------------ class list import ------------------------ *
 *
 * Three steps, each sending the file itself. The file is never held on the
 * server between them: SR-10 says an upload is not retained, so the browser
 * keeps the only copy and hands it over each time it needs an answer about it.
 * ------------------------------------------------------------------------- */

export interface ImportRow {
  rowNumber: number;
  studentNumber: string;
  name: string;
  surname: string;
  email: string;
  groupNumber?: string;
  groupName?: string;
  groupLeader?: string;
  errors: Array<{ field: string; reason: string }>;
}

export interface ColumnMapping {
  studentNumber: string;
  name: string;
  surname: string;
  email?: string;
  groupNumber?: string;
  groupName?: string;
  groupLeader?: string;
}

export interface FileInspection {
  headers: string[];
  rowCount: number;
  /** What the server thinks each column is, for the lecturer to confirm (FR-08). */
  suggested: Partial<ColumnMapping>;
  sample: string[][];
}

/** Sends the file and reports its columns, before any mapping is chosen. */
export const inspectClassList = async (classId: string, file: File): Promise<FileInspection> => {
  const body = new FormData();
  body.append("file", file);
  return uploadJson<FileInspection>(`/api/classes/${classId}/import/inspect`, body);
};

/** A row the server refused, with what the row held so the student can be recognised. */
export interface PreviewError {
  row: number;
  field: string;
  message: string;
  values?: {
    studentNumber: string;
    name: string;
    surname: string;
    email: string;
    groupNumber?: string;
    groupName?: string;
    groupLeader?: string;
  };
}

/**
 * The good rows and the bad ones as one list in file order.
 *
 * A bad row keeps what the file said, so the lecturer can tell which student
 * it is, and a row with more than one problem appears once with each reason.
 */
export function mergePreviewRows(
  valid: Array<{
    row: number;
    studentNumber: string;
    name: string;
    surname: string;
    email?: string;
    groupNumber?: number;
    groupName?: string;
    groupLeader?: boolean;
  }>,
  errors: PreviewError[],
): ImportRow[] {
  const broken = new Map<number, ImportRow>();
  for (const error of errors) {
    const existing = broken.get(error.row);
    const reason = { field: error.field, reason: error.message };
    if (existing) {
      existing.errors.push(reason);
      continue;
    }
    broken.set(error.row, {
      rowNumber: error.row,
      studentNumber: error.values?.studentNumber ?? "",
      name: error.values?.name ?? "",
      surname: error.values?.surname ?? "",
      email: error.values?.email ?? "",
      ...(error.values?.groupNumber !== undefined ? { groupNumber: error.values.groupNumber } : {}),
      ...(error.values?.groupName !== undefined ? { groupName: error.values.groupName } : {}),
      ...(error.values?.groupLeader !== undefined ? { groupLeader: error.values.groupLeader } : {}),
      errors: [reason],
    });
  }

  return [
    ...valid.map((row) => ({
      rowNumber: row.row,
      studentNumber: row.studentNumber,
      name: row.name,
      surname: row.surname,
      email: row.email ?? "",
      ...(row.groupNumber !== undefined ? { groupNumber: String(row.groupNumber) } : {}),
      ...(row.groupName !== undefined ? { groupName: row.groupName } : {}),
      ...(row.groupLeader ? { groupLeader: "x" } : {}),
      errors: [],
    })),
    ...broken.values(),
  ].sort((a, b) => a.rowNumber - b.rowNumber);
}

export interface ImportPreview {
  rows: ImportRow[];
  validCount: number;
  errorCount: number;
  duplicatesInFile: number;
  totalRows: number;
}

/**
 * The validation preview (FR-09).
 *
 * The server returns the good rows and the bad ones separately; the screen
 * shows one list in file order, so they are merged back here rather than in the
 * API - the API's shape is the one the commit uses, and they should not drift.
 */
export const previewClassList = async (
  classId: string,
  file: File,
  mapping: ColumnMapping,
): Promise<ImportPreview> => {
  const body = new FormData();
  body.append("file", file);
  body.append("mapping", JSON.stringify(mapping));

  const preview = await uploadJson<{
    preview: {
      valid: Array<{
        row: number;
        studentNumber: string;
        name: string;
        surname: string;
        email?: string;
        groupNumber?: number;
        groupName?: string;
        groupLeader?: boolean;
      }>;
      errors: PreviewError[];
      duplicatesInFile: number;
      totalRows: number;
    };
  }>(`/api/classes/${classId}/import/preview`, body);

  const { valid, errors } = preview.preview;

  return {
    rows: mergePreviewRows(valid, errors),
    validCount: valid.length,
    errorCount: errors.length,
    duplicatesInFile: preview.preview.duplicatesInFile,
    totalRows: preview.preview.totalRows,
  };
};

export interface ImportResult {
  imported: number;
  updated: number;
  removed: number;
  matched: number;
  unmatched: number;
  conflicts: number;
  groupsCreated: number;
  groupAssignments: number;
}

/** Commits the list and runs the class-list match (FR-04, FR-09). */
export const commitClassList = async (
  classId: string,
  file: File,
  mapping: ColumnMapping,
  mode: "extend" | "replace" = "extend",
): Promise<ImportResult> => {
  const body = new FormData();
  body.append("file", file);
  body.append("mapping", JSON.stringify(mapping));
  body.append("mode", mode);

  return (await uploadJson<{ result: ImportResult }>(`/api/classes/${classId}/import/commit`, body))
    .result;
};

/**
 * Posts multipart and returns JSON.
 *
 * Separate from `request` because the body is FormData: setting a content-type
 * header here would omit the multipart boundary the browser generates, and the
 * server would refuse a body it could not split.
 */
async function uploadJson<T>(path: string, body: FormData): Promise<T> {
  const response = await fetch(path, { method: "POST", credentials: "include", body });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload as { error?: ApiErrorBody } | null)?.error;
    throw new ApiError(
      response.status,
      error ?? { code: "error", message: "We couldn't read that file." },
    );
  }
  return payload as T;
}

/* ------------------------------- writes ------------------------------ *
 * Prototype writes mutate the in-memory mock arrays only.
 * ------------------------------------------------------------------- */
/**
 * Activates or deactivates a staff account (FR-01).
 *
 * Deactivating ends every session the account holds, server-side, so access
 * stops now rather than whenever the token would have expired (SR-05).
 */
export const setStaffAccountStatus = async (userId: string, status: User["status"]) =>
  (await post<{ account: User }>(`/api/accounts/${userId}/status`, { status })).account;

/**
 * Sends a staff account's activation link again (FR-01, FR-03).
 *
 * Only for an account that has never been activated. Each new link kills the
 * one before it, so an older message that turns up later is already useless.
 */
export const resendActivationLink = async (userId: string) =>
  (await post<{ account: User }>(`/api/accounts/${userId}/activation`, {})).account;

/**
 * Creates a staff account and emails its activation link (FR-01, FR-03).
 *
 * No password is set here or anywhere else by the administrator - the holder
 * chooses one from the emailed link, so nobody else ever knows it.
 */
export const createStaffAccount = async (input: Omit<User, "id" | "createdAt" | "status">) =>
  (
    await post<{ account: User }>("/api/accounts", {
      role: input.role,
      name: input.name,
      surname: input.surname,
      email: input.email,
    })
  ).account;

/**
 * Records a group's base mark (FR-21).
 *
 * Null clears it, and null is not zero: zero is a mark the group earned, and
 * null is one the lecturer has not entered yet.
 */
export const setGroupBaseMark = (assessmentId: string, groupId: string, baseMark: number | null) =>
  // invalidatedCalculation: the change made the calculated marks out of date,
  // and they have to be calculated again before results or an export (FR-13).
  request<{ ok: true; invalidatedCalculation: boolean }>(
    `/api/assessments/${assessmentId}/marks/${groupId}`,
    { method: "PUT", body: { baseMark } },
  );

/**
 * Activates, closes or re-opens an assessment (FR-13).
 *
 * Named transitions rather than a target status, because "open" means two
 * different things - activating a draft, and re-opening something that already
 * ran - and only one of them can invalidate a calculation. The server decides
 * which moves are legal; these just say which one was asked for.
 *
 * `invalidatedCalculation` comes back true when re-opening has discarded
 * results, so the screen can say so rather than leaving stale marks on display.
 */
interface StatusChange {
  assessment: Assessment;
  invalidatedCalculation: boolean;
}

const changeStatus = (
  assessmentId: string,
  transition: "open" | "close" | "reopen",
  closesAt?: string,
) =>
  post<StatusChange>(`/api/assessments/${assessmentId}/status`, {
    transition,
    ...(closesAt ? { closesAt } : {}),
  });

/**
 * Opening and re-opening take an optional new closing time. The server refuses
 * either once the closing time has passed (BR-05 would refuse every student),
 * so the screen asks for a new one in the same step.
 */
export const activateAssessment = (assessmentId: string, closesAt?: string) =>
  changeStatus(assessmentId, "open", closesAt);
export const closeAssessment = (assessmentId: string) => changeStatus(assessmentId, "close");
export const reopenAssessment = (assessmentId: string, closesAt?: string) =>
  changeStatus(assessmentId, "reopen", closesAt);

/**
 * Overrides a calculated mark (FR-24, BR-08).
 *
 * The calculated mark is kept alongside, never replaced, so the two can be
 * shown together and the difference accounted for. The reason is mandatory
 * server-side and in the database.
 */
export const overrideMark = async (
  assessmentId: string,
  studentId: string,
  mark: number,
  reason: string,
  _by: string,
): Promise<void> => {
  await post(`/api/assessments/${assessmentId}/override`, { studentId, mark, reason });
};

/**
 * Withdraws one student's override so their calculated mark stands again
 * (FR-24). The reason is required and kept in the audit log.
 */
export const removeOverride = async (
  assessmentId: string,
  studentId: string,
  reason: string,
): Promise<void> => {
  await request(`/api/assessments/${assessmentId}/override/${studentId}`, {
    method: "DELETE",
    body: { reason },
  });
};

export interface OverrideSummary {
  studentId: string;
  name: string;
  surname: string;
  mark: number;
  reason: string;
}

/**
 * Every override on an assessment, whether or not its results are current -
 * the ones a recalculation will ask to keep or withdraw (FR-24).
 */
export const getOverrides = async (assessmentId: string): Promise<OverrideSummary[]> =>
  unset(assessmentId)
    ? []
    : (await get<{ overrides: OverrideSummary[] }>(`/api/assessments/${assessmentId}/overrides`))
        .overrides;

/**
 * Runs the Felder calculation (FR-22).
 *
 * Refuses unless every participating group has a base mark - a factor with
 * nothing to multiply is not a mark.
 */
export const calculateMarks = async (
  assessmentId: string,
  /** Required by the server once overrides exist (FR-24): none is dropped silently. */
  overrides?: "keep" | "withdraw",
) => {
  const { run } = await post<{
    run: { runId: string; calculatedAt: string; students: number; flagged: number };
  }>(`/api/assessments/${assessmentId}/calculate`, overrides ? { overrides } : undefined);
  return { assessmentId, calculationRunId: run.runId, ...run };
};

/* Groups helpers used by generation/review screens. */
export const getGroupsEditable = async (
  classId: string,
): Promise<{ editable: boolean; reason: string | null }> =>
  unset(classId)
    ? { editable: false, reason: "Select a class first." }
    : get<{ editable: boolean; reason: string | null }>(`/api/classes/${classId}/groups/editable`);

/**
 * Proposes an allocation (FR-10). Writes nothing, so it can be re-drawn freely.
 *
 * The server allocates round-robin and deterministically, so asking twice with
 * the same numbers gives the same answer - a re-draw is a choice, not a shuffle.
 */
export const proposeGroups = async (
  classId: string,
  mode: "count" | "size",
  value: number,
): Promise<Group[]> => {
  const proposal = await post<{
    groups: Array<{ groupNumber: number; memberStudentIds: string[] }>;
    warnings: string[];
    eligibleCount: number;
  }>(`/api/classes/${classId}/groups/propose`, { mode, value });

  // A proposal has no ids yet - nothing has been created. The placeholder keeps
  // the shape the review screen expects until confirmation assigns real ones.
  return proposal.groups.map((group) => ({
    id: `proposed-${group.groupNumber}`,
    classId,
    groupNumber: group.groupNumber,
    memberStudentIds: group.memberStudentIds,
  }));
};

export const updateStaffAccount = async (
  userId: string,
  changes: Pick<User, "name" | "surname" | "email" | "role">,
) =>
  (
    await request<{ account: User }>(`/api/accounts/${userId}`, {
      method: "PATCH",
      body: changes,
    })
  ).account;

/** An institution must always keep at least one administrator who can sign in. */
/**
 * How many administrators in a loaded list could still sign in.
 *
 * A pure count over what the screen already has, rather than a request: it is
 * only there to explain why a control is disabled. The server refuses to
 * deactivate or demote the last administrator whatever the browser believes.
 */
export const activeAdminCount = (accounts: User[]) =>
  accounts.filter((u) => u.role === "admin" && u.status === "active").length;

/**
 * Records a student's evaluation against the in-memory mock data so the
 * lecturer-facing screens reflect it in the same session. A real backend would
 * POST the ratings and return the persisted submission.
 */
/**
 * Submits a completed evaluation (FR-16).
 *
 * `evaluatorStudentId` is ignored: the endpoint records the evaluation against
 * the signed-in student and nobody else, so passing someone else's id here
 * cannot rate on their behalf. Kept in the signature so the calling screens did
 * not all have to change at once.
 *
 * The API refuses an incomplete submission and names who is unrated in
 * `fields.missing`, which the review screen already knows how to show.
 */
export const submitEvaluation = async (
  assessmentId: string,
  _evaluatorStudentId: string,
  entries: Array<{ evaluatedStudentId: string; ratingOptionId: string; comment?: string }>,
) => {
  const { submission } = await post<{
    submission: { id: string; submittedAt: string; ratingCount: number };
  }>(`/api/student/evaluations/${assessmentId}/submit`, { entries });

  return { submissionId: submission.id, submittedAt: submission.submittedAt };
};

/**
 * The student's own evaluation as the server holds it: whether it was
 * submitted, and every rating they have saved or submitted (CI-10).
 */
export const getMyEvaluation = (assessmentId: string) =>
  get<{
    context: {
      status: "draft" | "open" | "closed";
      submission?: { id: string; status: "draft" | "submitted"; submittedAt?: string };
    };
    entries: Array<{ evaluatedStudentId: string; ratingOptionId: string; comment?: string }>;
  }>(`/api/student/evaluations/${assessmentId}`);

/**
 * Autosaves work in progress (CI-10).
 *
 * Partial by design, and quiet by design: a failed autosave must not interrupt
 * someone mid-form, and the local draft in `lib/evaluation-draft.ts` still holds
 * everything they typed. Returns whether it reached the server so a caller can
 * show a "saved" marker honestly.
 */
export const saveEvaluationDraft = async (
  assessmentId: string,
  entries: Array<{ evaluatedStudentId: string; ratingOptionId: string; comment?: string }>,
): Promise<boolean> => {
  try {
    await request(`/api/student/evaluations/${assessmentId}/draft`, {
      method: "PUT",
      body: { entries },
    });
    return true;
  } catch {
    return false;
  }
};

/* --------------------------- student portal -------------------------- */

/**
 * A peer, as a student may see them.
 *
 * Three fields, and deliberately not a `User`: a student needs to know who to
 * rate, not their classmates' e-mail addresses or account status. SR-08 is
 * about what reaches the browser, so the narrow shape is the server's, and
 * this type only describes it honestly.
 */
export interface StudentPeer {
  id: string;
  name: string;
  surname: string;
}

export interface StudentAssessmentView {
  assessment: Assessment;
  klass: Class;
  group: Group;
  /** Everyone in the group except the student themselves (BR-02). */
  members: StudentPeer[];
  submission?: Submission;
}

/**
 * One class-list row a student maps to, with the module it belongs to so the
 * student can tell their lecturer which list needs attention. Carries no match
 * note: that is the lecturer's wording, and false for the student reading it.
 */
export interface StudentEnrolment {
  id: string;
  classId: string;
  moduleCode: string;
  className: string;
  studentNumber: string;
  importedName: string;
  importedSurname: string;
  matchStatus: Enrolment["matchStatus"];
}

/**
 * Every class-list row a student maps to, matched on student number, oldest
 * first. All of them: a problem on one list must not hide another list's work.
 */
export const getStudentEnrolments = async (_studentId: string): Promise<StudentEnrolment[]> => {
  // No id crosses the wire: the endpoint answers for the signed-in student and
  // nobody else, so there is no parameter to tamper with (SR-07).
  const { enrolments } = await get<{ enrolments: StudentEnrolment[] }>("/api/student/enrolments");
  return enrolments;
};
export const getStudentAssessments = async (
  _studentId: string,
): Promise<StudentAssessmentView[]> => {
  const { assessments: views } = await get<{ assessments: StudentAssessmentView[] }>(
    "/api/student/assessments",
  );
  return views;
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
  /** Students in a confirmed group, which is what an average group size divides. */
  groupedCount: number;
  assessmentCount: number;
  activeAssessment?: Assessment;
}

/** Everything the lecturer dashboard shows on each class card. */
export const getClassSummaries = async (_lecturerId: string): Promise<ClassSummary[]> =>
  (await get<{ classes: ClassSummary[] }>("/api/classes")).classes;
export interface EnrolmentRow extends Enrolment {
  account?: User;
  groupNumber?: number;
}

export const getEnrolmentRows = async (classId: string): Promise<EnrolmentRow[]> =>
  unset(classId)
    ? []
    : (await get<{ enrolments: EnrolmentRow[] }>(`/api/classes/${classId}/enrolments`)).enrolments;
export interface GroupProgressRow {
  group: Group;
  members: User[];
  submittedIds: string[];
  draftIds: string[];
  outstanding: User[];
}

export const getGroupProgress = async (assessmentId: string): Promise<GroupProgressRow[]> =>
  unset(assessmentId)
    ? []
    : (await get<{ progress: GroupProgressRow[] }>(`/api/assessments/${assessmentId}/progress`))
        .progress;
/** Creates an assessment. Always lands as a draft - FR-13 makes activation separate. */
export const createAssessment = async (
  input: Omit<Assessment, "id" | "calculatedAt" | "calculationRunId">,
): Promise<Assessment> =>
  (
    await post<{ assessment: Assessment }>("/api/assessments", {
      classId: input.classId,
      name: input.name,
      description: input.description,
      groupIds: input.groupIds,
      opensAt: input.opensAt,
      closesAt: input.closesAt,
      maxMark: input.maxMark,
    })
  ).assessment;

export const updateAssessment = async (
  assessmentId: string,
  changes: Partial<Omit<Assessment, "id" | "classId">>,
): Promise<Assessment> =>
  (
    await request<{ assessment: Assessment }>(`/api/assessments/${assessmentId}`, {
      method: "PATCH",
      // Only the fields the server accepts; status is changed through its own
      // transition endpoint, not by assignment.
      body: {
        ...(changes.name !== undefined && { name: changes.name }),
        ...(changes.description !== undefined && { description: changes.description }),
        ...(changes.groupIds !== undefined && { groupIds: changes.groupIds }),
        ...(changes.opensAt !== undefined && { opensAt: changes.opensAt }),
        ...(changes.closesAt !== undefined && { closesAt: changes.closesAt }),
        ...(changes.maxMark !== undefined && { maxMark: changes.maxMark }),
      },
    })
  ).assessment;

/** Replaces the confirmed groups for a class with a proposed allocation. */
/** Replaces the class's groups with the confirmed allocation (FR-11). */
export const confirmGroups = async (classId: string, proposed: Group[]): Promise<Group[]> => {
  await request(`/api/classes/${classId}/groups`, {
    method: "PUT",
    body: {
      groups: proposed.map((group) => ({
        groupNumber: group.groupNumber,
        memberStudentIds: group.memberStudentIds,
      })),
    },
  });
  // Read back rather than trusting the echo: the server assigns the real ids.
  return getGroups(classId);
};

export interface AssessmentRow {
  assessment: Assessment;
  groupCount: number;
  submitted: number;
  expected: number;
}

/** Assessment list rows, each with the submission progress bar's numbers. */
export const getAssessmentRows = async (classId: string): Promise<AssessmentRow[]> =>
  unset(classId)
    ? []
    : (await get<{ assessments: AssessmentRow[] }>(`/api/classes/${classId}/assessments`))
        .assessments;
export interface ResultRow {
  result: CalculatedResult;
  student: User;
  group: Group;
  baseMark: number | null;
  /** Every rating this student received, with who gave it. */
  received: Array<{ evaluator: User; ratingOptionId: string; comment?: string }>;
}

/** Results summary rows, joined to everything the drill-down needs. */
/**
 * Results rows with everything the drill-down needs (FR-26).
 *
 * Lecturer-only: the ratings behind a mark are visible to the responsible
 * lecturer and their author, and to nobody else (OR-16).
 */
export const getResultRows = async (assessmentId: string): Promise<ResultRow[]> => {
  if (unset(assessmentId)) return [];
  const { results } = await get<{ results: ApiResultRow[] }>(
    `/api/assessments/${assessmentId}/results`,
  );

  return results.map((row) => ({
    result: {
      studentId: row.studentId,
      assessmentId,
      // Null where nobody rated them, which the screen shows as a dash: a mean
      // of 0.0 would read as the lowest rating somebody gave.
      meanReceived: row.meanReceived,
      adjustmentFactor: row.adjustmentFactor,
      finalMark: row.finalMark ?? 0,
      flags: row.flags,
      ...(row.override ? { override: row.override } : {}),
    },
    student: row.student as unknown as User,
    group: {
      id: row.groupId,
      classId: "",
      groupNumber: row.groupNumber,
      memberStudentIds: [],
    },
    baseMark: row.baseMark,
    received: row.received.map((entry) => ({
      evaluator: entry.evaluator as unknown as User,
      ratingOptionId: entry.ratingOptionId,
      ...(entry.comment ? { comment: entry.comment } : {}),
    })),
  }));
};

/** The shape the API returns, before it is reshaped for the screens. */
interface ApiResultRow {
  studentId: string;
  groupId: string;
  groupNumber: number;
  student: { id: string; name: string; surname: string; studentNumber: string | null };
  ratingsReceived: number;
  meanReceived: number | null;
  groupMean: number | null;
  rawFactor: number | null;
  adjustmentFactor: number;
  baseMark: number | null;
  finalMark: number | null;
  flags: CalculatedResult["flags"];
  override?: MarkOverride;
  received: Array<{
    evaluator: { id: string; name: string; surname: string };
    ratingOptionId: string;
    comment?: string;
  }>;
}

/**
 * Rating options for the student portal, with the numeric scale stripped out.
 * Student screens must use this, never `getRatingOptions`.
 */
/**
 * Reminds the students who have not submitted (FR-18).
 *
 * The server decides who is outstanding and how many were written to; the
 * screen reports what it is told rather than counting the rows it happens to be
 * displaying, which could be a refetch behind.
 */
export const sendSubmissionReminders = async (assessmentId: string): Promise<{ sent: number }> =>
  post<{ sent: number }>(`/api/assessments/${assessmentId}/reminders`, {});

export const getStudentRatingOptions = async (): Promise<StudentRatingOption[]> =>
  // The server strips the numeric value for a student role; nothing is removed
  // here, because removing it here would mean it had already arrived (SR-08).
  (await get<{ options: StudentRatingOption[] }>("/api/assessments/rating-options")).options;
/* ------------------------------- classes ----------------------------- */

/**
 * Creates a class (FR-08, BR-11).
 *
 * `lecturer` is ignored: a class is owned by whoever created it, taken from the
 * session, so there is no way to create one on somebody else's behalf.
 */
export const createClass = async (
  input: { moduleCode: string; name: string; academicPeriod: string },
  _lecturer: User,
): Promise<Class> => (await post<{ klass: Class }>("/api/classes", input)).klass;

/* ---------------------------- match conflicts ------------------------ */

/**
 * A registered account that claims an enrolment's student number. Its status is
 * what the dialog's badge shows, so a verified account reads as verified.
 */
export interface ConflictCandidate {
  id: string;
  name: string;
  surname: string;
  email: string;
  studentNumber: string | null;
  status: User["status"];
}

/** Registered student accounts that claim an enrolment's student number (FR-04). */
export const getConflictCandidates = async (enrolmentId: string): Promise<ConflictCandidate[]> =>
  (
    await get<{ candidates: ConflictCandidate[] }>(
      `/api/classes/enrolments/${enrolmentId}/candidates`,
    )
  ).candidates;

/** The two decisions, named exactly as the API names them. */
export type ConflictDecision = { kind: "link"; userId: string } | { kind: "leave-unmatched" };

/**
 * FR-04: a lecturer settles a Conflict by linking the class-list entry to one
 * account, or to none. Linking is what grants that account the class's data.
 */
/**
 * Records the lecturer's decision on a match conflict (FR-04).
 *
 * `lecturer` is ignored - the decision is attributed to the signed-in account,
 * which is also what the audit entry names.
 */
export const resolveEnrolmentConflict = async (
  enrolmentId: string,
  decision: ConflictDecision,
  _lecturer: User,
): Promise<void> => {
  await post(`/api/classes/enrolments/${enrolmentId}/resolve`, decision);
};

/* -------------------------------- deletion --------------------------- */

/**
 * What deleting would destroy, and whether any of it exists nowhere else
 * (FR-28).
 *
 * Computed on the server from what is actually stored, so the warning cannot
 * drift from the truth. `unexportedAssessments` is what makes the confirmation
 * ask twice: results never exported have no copy anywhere.
 */
export interface DeletionImpact {
  unexportedAssessments: string[];
  submissions: number;
  ratings: number;
  assessments: number;
  enrolments: number;
  groups: number;
}

const EMPTY_IMPACT: DeletionImpact = {
  unexportedAssessments: [],
  submissions: 0,
  ratings: 0,
  assessments: 0,
  enrolments: 0,
  groups: 0,
};

export const getClassDeletionImpact = async (classId: string): Promise<DeletionImpact> =>
  unset(classId)
    ? EMPTY_IMPACT
    : (await get<{ impact: DeletionImpact }>(`/api/classes/${classId}/impact`)).impact;

export const getAssessmentDeletionImpact = async (assessmentId: string): Promise<DeletionImpact> =>
  (await get<{ impact: DeletionImpact }>(`/api/assessments/${assessmentId}/impact`)).impact;

export const deleteAssessment = async (assessmentId: string, _lecturer: User): Promise<void> => {
  await request(`/api/assessments/${assessmentId}`, { method: "DELETE" });
};

/** FR-28: permanently deletes a class with its class list, groups and assessments. */
export const deleteClass = async (classId: string, _lecturer: User): Promise<void> => {
  await request(`/api/classes/${classId}`, { method: "DELETE" });
};

/** FR-25: records that an assessment's results have been exported. */
/** Records that results were exported, which is what FR-28 checks before deleting. */
export const markResultsExported = async (assessmentId: string, _lecturer: User): Promise<string> =>
  (await post<{ exportedAt: string }>(`/api/assessments/${assessmentId}/exported`)).exportedAt;

/**
 * Downloads the results workbook (FR-25, CI-04).
 *
 * The file is built on the server and arrives as a binary attachment, so the
 * hidden scale values and every rating behind the marks never pass through the
 * browser as data - only as a file the browser saves (SR-08, OR-16).
 *
 * The download also records the export, which is what FR-28 checks before
 * letting an assessment be deleted without asking twice.
 */
export const downloadResults = async (assessmentId: string): Promise<string> => {
  let response: Response;
  try {
    response = await fetch(`/api/assessments/${assessmentId}/export`, {
      credentials: "include",
    });
  } catch {
    // Offline or the server is down: the same plain sentence as every other call.
    throw new ApiError(0, {
      code: "network_error",
      message: "We couldn't reach Peerly. Check your connection and try again.",
    });
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: ApiErrorBody } | null;
    throw new ApiError(
      response.status,
      payload?.error ?? { code: "error", message: "We couldn't build that export." },
    );
  }

  // The name the server chose, so the saved file matches what the screen showed.
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "peerly-results.xlsx";

  const url = URL.createObjectURL(await response.blob());
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    // Firefox needs the element in the document for a programmatic click.
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    // Revoking immediately can cancel the download in some browsers, so it is
    // left for the next tick.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return filename;
};
