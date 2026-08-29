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
  ResultFlag,
  Submission,
  User,
} from "./types";

/* ------------------------------------------------------------------ *
 * Deterministic pseudo-random helpers (stable data across reloads)
 * ------------------------------------------------------------------ */
function makeRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/* ------------------------------------------------------------------ *
 * Rating scale — exact student-facing copy. Order is fixed.
 * ------------------------------------------------------------------ */
export const ratingOptions: RatingOption[] = [
  {
    id: "ro-1",
    label: "Excellent",
    description:
      "Consistently went above and beyond what was asked, took the lead, carried more than their share.",
    hiddenValue: 100,
    order: 1,
  },
  {
    id: "ro-2",
    label: "Very good",
    description: "Consistently did everything they were asked to do, and did it well.",
    hiddenValue: 87.5,
    order: 2,
  },
  {
    id: "ro-3",
    label: "Satisfactory",
    description: "Usually did what they were asked to do, at an acceptable standard.",
    hiddenValue: 75,
    order: 3,
  },
  {
    id: "ro-4",
    label: "Ordinary",
    description: "Often did what they were asked to do, but needed reminding.",
    hiddenValue: 62.5,
    order: 4,
  },
  {
    id: "ro-5",
    label: "Marginal",
    description: "Sometimes failed to attend meetings or to complete what was asked.",
    hiddenValue: 50,
    order: 5,
  },
  {
    id: "ro-6",
    label: "Deficient",
    description: "Often failed to attend meetings or to complete what was asked.",
    hiddenValue: 37.5,
    order: 6,
  },
  {
    id: "ro-7",
    label: "Unsatisfactory",
    description: "Consistently failed to attend meetings or to complete what was asked.",
    hiddenValue: 25,
    order: 7,
  },
  {
    id: "ro-8",
    label: "Superficial",
    description: "Contributed practically nothing to the work of the group.",
    hiddenValue: 12.5,
    order: 8,
  },
  {
    id: "ro-9",
    label: "No contribution",
    description: "Never attended and contributed nothing at all.",
    hiddenValue: 0,
    order: 9,
  },
];

/* ------------------------------------------------------------------ *
 * Staff accounts
 * ------------------------------------------------------------------ */
export const staffUsers: User[] = [
  {
    id: "u-admin-1",
    role: "admin",
    name: "Riaan",
    surname: "Botha",
    email: "riaan.botha@nwu.ac.za",
    status: "active",
    createdAt: "2025-11-04T08:12:00Z",
  },
  {
    id: "u-admin-2",
    role: "admin",
    name: "Lerato",
    surname: "Mokoena",
    email: "lerato.mokoena@nwu.ac.za",
    status: "active",
    createdAt: "2026-01-16T09:40:00Z",
  },
  {
    id: "u-lec-1",
    role: "lecturer",
    name: "Anneke",
    surname: "van der Merwe",
    email: "anneke.vdmerwe@nwu.ac.za",
    status: "active",
    createdAt: "2025-11-04T08:20:00Z",
  },
  {
    id: "u-lec-2",
    role: "lecturer",
    name: "Sipho",
    surname: "Ndlovu",
    email: "sipho.ndlovu@nwu.ac.za",
    status: "active",
    createdAt: "2025-12-02T11:05:00Z",
  },
  {
    id: "u-lec-3",
    role: "lecturer",
    name: "Marina",
    surname: "Petrova",
    email: "marina.petrova@nwu.ac.za",
    status: "active",
    createdAt: "2026-02-11T07:55:00Z",
  },
  {
    id: "u-lec-4",
    role: "lecturer",
    name: "Johan",
    surname: "Steyn",
    email: "johan.steyn@nwu.ac.za",
    status: "inactive",
    createdAt: "2025-08-19T13:30:00Z",
  },
  {
    id: "u-lec-5",
    role: "lecturer",
    name: "Fatima",
    surname: "Patel",
    email: "fatima.patel@nwu.ac.za",
    status: "unverified",
    createdAt: "2026-08-14T06:45:00Z",
  },
  {
    id: "u-lec-6",
    role: "lecturer",
    name: "Kobus",
    surname: "Fourie",
    email: "kobus.fourie@nwu.ac.za",
    status: "active",
    createdAt: "2026-03-03T10:15:00Z",
  },
  {
    id: "u-lec-7",
    role: "lecturer",
    name: "Nomvula",
    surname: "Dlamini",
    email: "nomvula.dlamini@nwu.ac.za",
    status: "inactive",
    createdAt: "2025-09-27T15:20:00Z",
  },
];

/* ------------------------------------------------------------------ *
 * Students (class list for CMPG323)
 * ------------------------------------------------------------------ */
const studentNames: Array<[string, string]> = [
  ["Amahle", "Zulu"],
  ["Bianca", "Coetzee"],
  ["Chad", "Naidoo"],
  ["Dineo", "Molefe"],
  ["Ethan", "Pretorius"],
  ["Fatima", "Ismail"],
  ["Gerhard", "Kruger"],
  ["Hlengiwe", "Mthembu"],
  ["Imran", "Kader"],
  ["Jana", "Viljoen"],
  ["Karabo", "Sithole"],
  ["Liam", "O'Connell"],
  ["Mbali", "Nkosi"],
  ["Nadia", "Rossouw"],
  ["Oscar", "Mahlangu"],
  ["Pieter", "Swanepoel"],
  ["Refilwe", "Motaung"],
  ["Sarah", "Bekker"],
  ["Tumelo", "Mabaso"],
  ["Ursula", "Meyer"],
  ["Vusi", "Khumalo"],
  ["Wendy", "Grobler"],
  ["Xolani", "Dube"],
  ["Yolanda", "Steenkamp"],
  ["Zaid", "Ebrahim"],
  ["Anele", "Mokwena"],
  ["Brendon", "Le Roux"],
  ["Chantelle", "Du Plessis"],
  ["Dumisani", "Ngcobo"],
  ["Elsabe", "Joubert"],
];

export const studentUsers: User[] = studentNames.map(([name, surname], i) => {
  const studentNumber = `4${(1200345 + i * 137).toString().padStart(7, "0")}`;
  return {
    id: `u-stu-${String(i + 1).padStart(2, "0")}`,
    role: "student" as const,
    name,
    surname,
    email: `${studentNumber}@mynwu.ac.za`,
    studentNumber,
    status: i === 28 ? ("unverified" as const) : ("active" as const),
    createdAt: `2026-08-0${(i % 5) + 1}T07:${String(10 + (i % 45)).padStart(2, "0")}:00Z`,
  };
});

export const users: User[] = [...staffUsers, ...studentUsers];

export const byId = <T extends { id: string }>(items: T[], id: string) =>
  items.find((item) => item.id === id);

export const userName = (user?: Pick<User, "name" | "surname">) =>
  user ? `${user.name} ${user.surname}` : "Unknown student";

/* ------------------------------------------------------------------ *
 * Classes
 * ------------------------------------------------------------------ */
export const classes: Class[] = [
  {
    id: "cls-1",
    moduleCode: "CMPG323",
    name: "Development of Information Systems III",
    lecturerId: "u-lec-1",
    academicPeriod: "2026 Semester 2",
  },
  {
    id: "cls-2",
    moduleCode: "CMPG315",
    name: "Computer Networks II",
    lecturerId: "u-lec-1",
    academicPeriod: "2026 Semester 2",
  },
];

/* ------------------------------------------------------------------ *
 * Enrolments — 30 rows, 28 matched, 1 unmatched, 1 conflict
 * ------------------------------------------------------------------ */
export const enrolments: Enrolment[] = studentUsers.map((student, i) => {
  const matchStatus =
    i === 28 ? ("unmatched" as const) : i === 29 ? ("conflict" as const) : ("matched" as const);
  return {
    id: `enr-${String(i + 1).padStart(2, "0")}`,
    classId: "cls-1",
    studentNumber: student.studentNumber!,
    importedName: student.name,
    importedSurname: student.surname,
    matchStatus,
    userId: matchStatus === "matched" ? student.id : undefined,
    matchNote:
      matchStatus === "unmatched"
        ? "No registered Peerly account uses this student number yet."
        : matchStatus === "conflict"
          ? "Two accounts claim this student number — surname on the class list does not match either."
          : undefined,
  };
});

/* ------------------------------------------------------------------ *
 * Groups — 6 groups for CMPG323 (matched students only)
 * ------------------------------------------------------------------ */
const matchedStudentIds = enrolments
  .filter((e) => e.matchStatus === "matched")
  .map((e) => e.userId!);

const groupSizes = [5, 5, 5, 5, 4, 4];
export const groups: Group[] = (() => {
  const out: Group[] = [];
  let cursor = 0;
  groupSizes.forEach((size, index) => {
    out.push({
      id: `grp-${index + 1}`,
      classId: "cls-1",
      groupNumber: index + 1,
      memberStudentIds: matchedStudentIds.slice(cursor, cursor + size),
    });
    cursor += size;
  });
  return out;
})();

/* Second class: small confirmed set so the lecturer has 2 real classes. */
export const secondClassGroups: Group[] = [
  {
    id: "grp-c2-1",
    classId: "cls-2",
    groupNumber: 1,
    memberStudentIds: matchedStudentIds.slice(0, 4),
  },
  {
    id: "grp-c2-2",
    classId: "cls-2",
    groupNumber: 2,
    memberStudentIds: matchedStudentIds.slice(4, 8),
  },
  {
    id: "grp-c2-3",
    classId: "cls-2",
    groupNumber: 3,
    memberStudentIds: matchedStudentIds.slice(8, 11),
  },
];

export const allGroups: Group[] = [...groups, ...secondClassGroups];

/* ------------------------------------------------------------------ *
 * Assessments
 * ------------------------------------------------------------------ */
export const assessments: Assessment[] = [
  {
    id: "asm-1",
    classId: "cls-1",
    name: "Project Phase 2 — Peer Assessment",
    description:
      "Rate each member of your group on their contribution to the Phase 2 system design and implementation.",
    groupIds: groups.map((g) => g.id),
    status: "open",
    opensAt: "2026-08-24T08:00:00Z",
    closesAt: "2026-09-04T22:00:00Z",
    maxMark: 100,
  },
  {
    id: "asm-2",
    classId: "cls-1",
    name: "Project Phase 1 — Peer Assessment",
    description: "Peer assessment for the Phase 1 requirements and analysis deliverable.",
    groupIds: groups.map((g) => g.id),
    status: "closed",
    opensAt: "2026-07-13T08:00:00Z",
    closesAt: "2026-07-24T22:00:00Z",
    maxMark: 100,
    calculatedAt: "2026-07-26T09:14:00Z",
    calculationRunId: "run-2026-07-26-01",
  },
  {
    id: "asm-3",
    classId: "cls-1",
    name: "Project Phase 3 — Peer Assessment",
    description: "Final phase peer assessment. Not yet opened to students.",
    groupIds: groups.slice(0, 4).map((g) => g.id),
    status: "draft",
    opensAt: "2026-09-21T08:00:00Z",
    closesAt: "2026-10-02T22:00:00Z",
    maxMark: 100,
  },
  {
    id: "asm-4",
    classId: "cls-2",
    name: "Network Design Practical — Peer Assessment",
    description: "Peer assessment for the subnetting and routing practical.",
    groupIds: secondClassGroups.map((g) => g.id),
    status: "draft",
    opensAt: "2026-09-07T08:00:00Z",
    closesAt: "2026-09-18T22:00:00Z",
    maxMark: 100,
  },
];

/* ------------------------------------------------------------------ *
 * Submissions + peer ratings for the open assessment (asm-1)
 * ------------------------------------------------------------------ */
const rng = makeRng(20260829);

/** Evaluators who have not submitted, so "outstanding" states are visible. */
export const outstandingEvaluatorIds = [
  groups[0].memberStudentIds[4],
  groups[2].memberStudentIds[1],
  groups[2].memberStudentIds[3],
  groups[4].memberStudentIds[2],
  groups[5].memberStudentIds[0],
];

/** Group 4 member 1 gives everyone the same rating (uniform-rating flag). */
const uniformEvaluatorId = groups[3].memberStudentIds[0];
/** Weak contributor who receives low ratings (low-contribution flag). */
const weakContributorId = groups[1].memberStudentIds[3];
/** Reciprocal extremes pair inside group 3. */
const reciprocalA = groups[2].memberStudentIds[0];
const reciprocalB = groups[2].memberStudentIds[2];

const optionByValue = (value: number) =>
  ratingOptions.reduce((best, option) =>
    Math.abs(option.hiddenValue - value) < Math.abs(best.hiddenValue - value) ? option : best,
  );

const comments = [
  "Always on time for meetings and delivered the API layer early.",
  "Good work overall, communication could be a bit quicker on WhatsApp.",
  "Did the parts they were assigned but rarely volunteered for extra work.",
  "Had to be reminded twice about the documentation section.",
  "Missed two of our four planning meetings without letting us know.",
  "",
  "",
];

export const submissions: Submission[] = [];
export const peerRatings: PeerRating[] = [];

groups.forEach((group) => {
  group.memberStudentIds.forEach((evaluatorId, evaluatorIndex) => {
    const isOutstanding = outstandingEvaluatorIds.includes(evaluatorId);
    const isDraft = !isOutstanding && evaluatorIndex === 1 && group.groupNumber === 5;
    const submissionId = `sub-${group.id}-${evaluatorId}`;

    if (isOutstanding) return;

    submissions.push({
      id: submissionId,
      assessmentId: "asm-1",
      evaluatorStudentId: evaluatorId,
      status: isDraft ? "draft" : "submitted",
      submittedAt: isDraft
        ? undefined
        : `2026-08-2${6 + (evaluatorIndex % 3)}T1${evaluatorIndex % 8}:${String(
            5 + ((evaluatorIndex * 7) % 50),
          ).padStart(2, "0")}:00Z`,
      updatedAt: `2026-08-2${6 + (evaluatorIndex % 3)}T1${evaluatorIndex % 8}:12:00Z`,
    });

    group.memberStudentIds
      .filter((id) => id !== evaluatorId)
      .forEach((evaluatedId, i) => {
        let value: number;
        if (evaluatorId === uniformEvaluatorId) {
          value = 87.5;
        } else if (evaluatedId === weakContributorId) {
          value = [37.5, 25, 50, 37.5][i % 4];
        } else if (evaluatorId === reciprocalA && evaluatedId === reciprocalB) {
          value = 0;
        } else if (evaluatorId === reciprocalB && evaluatedId === reciprocalA) {
          value = 100;
        } else {
          value = [100, 87.5, 87.5, 75, 75, 62.5][Math.floor(rng() * 6)];
        }
        if (isDraft && i > 0) return;
        peerRatings.push({
          submissionId,
          evaluatedStudentId: evaluatedId,
          ratingOptionId: optionByValue(value).id,
          comment: comments[Math.floor(rng() * comments.length)] || undefined,
        });
      });
  });
});

/* ------------------------------------------------------------------ *
 * Group marks — group 5 deliberately missing a base mark
 * ------------------------------------------------------------------ */
export const groupMarks: GroupMark[] = groups.map((group) => ({
  assessmentId: "asm-1",
  groupId: group.id,
  baseMark:
    group.groupNumber === 5 ? null : ([74, 68, 81, 77, null, 63][group.groupNumber - 1] ?? 70),
}));

/* ------------------------------------------------------------------ *
 * Calculated results (derived from the ratings above)
 * ------------------------------------------------------------------ */
const ratingValue = (ratingOptionId: string) =>
  ratingOptions.find((option) => option.id === ratingOptionId)?.hiddenValue ?? 0;

export function ratingsReceivedBy(studentId: string, assessmentId = "asm-1") {
  return peerRatings
    .filter((rating) => rating.evaluatedStudentId === studentId)
    .map((rating) => {
      const submission = submissions.find((s) => s.id === rating.submissionId);
      return { rating, submission };
    })
    .filter(({ submission }) => submission?.assessmentId === assessmentId);
}

export const calculatedResults: CalculatedResult[] = groups.flatMap((group) => {
  const baseMark = groupMarks.find((m) => m.groupId === group.id)?.baseMark;
  return group.memberStudentIds.map((studentId) => {
    const received = ratingsReceivedBy(studentId).map(({ rating }) =>
      ratingValue(rating.ratingOptionId),
    );
    const meanReceived = received.length
      ? received.reduce((a, b) => a + b, 0) / received.length
      : 0;
    const adjustmentFactor = Number(
      Math.min(1.1, Math.max(0.6, 0.7 + (meanReceived / 100) * 0.4)).toFixed(2),
    );
    const flags: ResultFlag[] = [];
    if (meanReceived < 50 && received.length) flags.push("low-contribution");
    if (studentId === uniformEvaluatorId) flags.push("uniform-rating");
    if (studentId === reciprocalA || studentId === reciprocalB) flags.push("reciprocal-extreme");
    if (outstandingEvaluatorIds.includes(studentId)) flags.push("no-submission");
    if (group.memberStudentIds.some((id) => outstandingEvaluatorIds.includes(id)))
      flags.push("incomplete-group");
    if (group.memberStudentIds.length <= 2) flags.push("group-of-two");
    const finalMark =
      baseMark == null ? 0 : Number(Math.min(100, baseMark * adjustmentFactor).toFixed(1));
    return {
      studentId,
      assessmentId: "asm-1",
      meanReceived: Number(meanReceived.toFixed(1)),
      adjustmentFactor,
      finalMark,
      flags,
      override:
        studentId === weakContributorId
          ? {
              mark: 52,
              reason:
                "Student submitted a medical certificate for the two weeks of Phase 2; adjustment softened after discussion with the group.",
              by: "Anneke van der Merwe",
              at: "2026-08-28T13:40:00Z",
            }
          : undefined,
    };
  });
});

/* Isolated outlier flag for one student to demonstrate the badge. */
const outlierResult = calculatedResults.find(
  (result) => result.studentId === groups[5].memberStudentIds[1],
);
if (outlierResult) outlierResult.flags.push("isolated-outlier");

/* ------------------------------------------------------------------ *
 * Audit log
 * ------------------------------------------------------------------ */
export const auditEntries: AuditEntry[] = [
  {
    id: "aud-01",
    timestamp: "2026-08-29T08:42:00Z",
    actorName: "Anneke van der Merwe",
    actorRole: "lecturer",
    eventType: "marks.entered",
    objectDescription: "CMPG323 · Phase 2 · Group 4 base mark",
    detail: "Base mark changed from — to 77.0",
    classId: "cls-1",
  },
  {
    id: "aud-02",
    timestamp: "2026-08-28T13:40:00Z",
    actorName: "Anneke van der Merwe",
    actorRole: "lecturer",
    eventType: "mark.overridden",
    objectDescription: `CMPG323 · Phase 2 · ${userName(byId(users, weakContributorId))}`,
    detail: "Final mark changed from 41.3 to 52.0 — medical certificate on file",
    classId: "cls-1",
  },
  {
    id: "aud-03",
    timestamp: "2026-08-24T08:00:00Z",
    actorName: "Anneke van der Merwe",
    actorRole: "lecturer",
    eventType: "assessment.opened",
    objectDescription: "CMPG323 · Project Phase 2 — Peer Assessment",
    detail: "Status changed from Draft to Open · closes 4 Sep 2026 22:00",
    classId: "cls-1",
  },
  {
    id: "aud-04",
    timestamp: "2026-08-22T15:22:00Z",
    actorName: "Anneke van der Merwe",
    actorRole: "lecturer",
    eventType: "groups.confirmed",
    objectDescription: "CMPG323 · 6 groups",
    detail: "28 students allocated to 6 groups (sizes 5,5,5,5,4,4)",
    classId: "cls-1",
  },
  {
    id: "aud-05",
    timestamp: "2026-08-22T14:03:00Z",
    actorName: "Anneke van der Merwe",
    actorRole: "lecturer",
    eventType: "class.imported",
    objectDescription: "CMPG323 · cmpg323_classlist_s2.xlsx",
    detail: "30 rows imported · 28 matched · 1 unmatched · 1 conflict",
    classId: "cls-1",
  },
  {
    id: "aud-06",
    timestamp: "2026-07-26T09:14:00Z",
    actorName: "Anneke van der Merwe",
    actorRole: "lecturer",
    eventType: "marks.calculated",
    objectDescription: "CMPG323 · Project Phase 1 — Peer Assessment",
    detail: "Calculation run run-2026-07-26-01 · 28 individual marks produced",
    classId: "cls-1",
  },
  {
    id: "aud-07",
    timestamp: "2026-07-26T09:20:00Z",
    actorName: "Anneke van der Merwe",
    actorRole: "lecturer",
    eventType: "results.exported",
    objectDescription: "peerly_CMPG323_phase1_export.xlsx",
    detail: "Results + Raw Ratings worksheets · 28 students",
    classId: "cls-1",
  },
  {
    id: "aud-08",
    timestamp: "2026-08-14T06:45:00Z",
    actorName: "Riaan Botha",
    actorRole: "admin",
    eventType: "account.created",
    objectDescription: "Lecturer account · Fatima Patel",
    detail: "Role lecturer · activation link sent to fatima.patel@nwu.ac.za",
  },
  {
    id: "aud-09",
    timestamp: "2026-08-12T10:11:00Z",
    actorName: "Riaan Botha",
    actorRole: "admin",
    eventType: "account.deactivated",
    objectDescription: "Lecturer account · Nomvula Dlamini",
    detail: "Status changed from Active to Deactivated — end of contract",
  },
  {
    id: "aud-10",
    timestamp: "2026-08-11T07:32:00Z",
    actorName: "Lerato Mokoena",
    actorRole: "admin",
    eventType: "account.activated",
    objectDescription: "Lecturer account · Kobus Fourie",
    detail: "Status changed from Unverified to Active",
  },
  {
    id: "aud-11",
    timestamp: "2026-07-24T22:00:00Z",
    actorName: "System",
    actorRole: "lecturer",
    eventType: "assessment.closed",
    objectDescription: "CMPG323 · Project Phase 1 — Peer Assessment",
    detail: "Status changed from Open to Closed at the scheduled closing time",
    classId: "cls-1",
  },
  {
    id: "aud-12",
    timestamp: "2026-08-19T11:48:00Z",
    actorName: "Anneke van der Merwe",
    actorRole: "lecturer",
    eventType: "assessment.created",
    objectDescription: "CMPG323 · Project Phase 3 — Peer Assessment",
    detail: "Draft created · 4 groups selected",
    classId: "cls-1",
  },
];

/* ------------------------------------------------------------------ *
 * Import preview fixture (Class List Import screens)
 * ------------------------------------------------------------------ */
export interface ImportRow {
  rowNumber: number;
  studentNumber: string;
  name: string;
  surname: string;
  email: string;
  errors: Array<{ field: string; reason: string }>;
}

export const importPreviewRows: ImportRow[] = studentUsers.map((student, i) => {
  const errors: Array<{ field: string; reason: string }> = [];
  let email = student.email;
  let studentNumber = student.studentNumber!;
  if (i === 6) {
    email = "";
    errors.push({
      field: "Email",
      reason: "This row has no email address, so the student cannot be invited.",
    });
  }
  if (i === 17) {
    studentNumber = studentUsers[3].studentNumber!;
    errors.push({
      field: "Student number",
      reason: `Student number ${studentNumber} already appears on row 4 of this file.`,
    });
  }
  if (i === 23) {
    errors.push({
      field: "Surname",
      reason: "Surname contains a number, which is usually a typing error.",
    });
  }
  return {
    rowNumber: i + 1,
    studentNumber,
    name: student.name,
    surname: i === 23 ? "Steenkamp2" : student.surname,
    email,
    errors,
  };
});
