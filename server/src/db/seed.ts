import { env } from "../config/env.ts";
import { hashPassword } from "../lib/password.ts";
import { closePool, query, withTransaction } from "./pool.ts";

/**
 * Development data.
 *
 * Mirrors the fixtures in `src/mocks/data.ts` so the portals show the same
 * shape of thing once they read from the API instead: two classes, a class list
 * with a deliberate unmatched row and a deliberate conflict, confirmed groups,
 * one open assessment part-submitted and one closed one with marks.
 *
 * Reference data does NOT live here - the rating scale is seeded by migration
 * 0002, because an assessment cannot be rated without it and production never
 * runs this file.
 *
 * Deterministic on purpose. Re-running rebuilds exactly the same database, so a
 * screenshot or a bug report still means something tomorrow.
 */

/**
 * The password every seeded account shares.
 *
 * `peerly-dev-password` on a laptop, where the database is unreachable from
 * anywhere else. A seeded database behind a public URL is a different thing
 * entirely - 33 accounts, one password, published in this repository - so a
 * shared test deployment sets SEED_PASSWORD to its own.
 */
const DEV_PASSWORD = env.seedPassword;

const staff = [
  { role: "admin" as const, name: "Riaan", surname: "Botha", email: "riaan.botha@nwu.ac.za" },
  {
    role: "lecturer" as const,
    name: "Anneke",
    surname: "van der Merwe",
    email: "anneke.vdmerwe@nwu.ac.za",
  },
  {
    role: "lecturer" as const,
    name: "Sipho",
    surname: "Dlamini",
    email: "sipho.dlamini@nwu.ac.za",
  },
];

/** Thirty students, matching the fixture count the screens were built against. */
const firstNames = [
  "Lerato",
  "Thandi",
  "Johan",
  "Aisha",
  "Kabelo",
  "Chloe",
  "Sizwe",
  "Nadia",
  "Tebogo",
  "Ruan",
  "Zanele",
  "Michael",
  "Palesa",
  "Werner",
  "Nomsa",
  "Dewald",
  "Refilwe",
  "Karel",
  "Ayanda",
  "Marlise",
  "Bongani",
  "Elsabe",
  "Katlego",
  "Pieter",
  "Naledi",
  "Stefan",
  "Mpho",
  "Anja",
  "Lwazi",
  "Carien",
];
const surnames = [
  "Mokoena",
  "Nkosi",
  "Pretorius",
  "Patel",
  "Mahlangu",
  "van Wyk",
  "Ndlovu",
  "Fourie",
  "Sithole",
  "Coetzee",
  "Khumalo",
  "Botha",
  "Molefe",
  "Steyn",
  "Dube",
  "Kruger",
  "Mabaso",
  "Venter",
  "Zulu",
  "Nel",
  "Mthembu",
  "Swanepoel",
  "Maluleke",
  "Joubert",
  "Radebe",
  "Erasmus",
  "Baloyi",
  "Meyer",
  "Gumede",
  "du Toit",
];

const students = firstNames.map((name, i) => ({
  name,
  surname: surnames[i]!,
  studentNumber: String(41200345 + i * 37),
}));

/** Sums to 28 - the matched students. */
const groupSizes = [5, 5, 5, 5, 4, 4];

/**
 * A comment that agrees with the rating it is attached to.
 *
 * One fixed sentence used to be attached to three ratings in ten whatever they
 * said, so the export showed "Pulled their weight and kept the group moving"
 * beside a rating of Superficial. Nothing depended on it, but anyone reading
 * the raw-ratings sheet in a demo saw the system contradicting itself.
 *
 * Indexed by the option's position in display order, strongest first.
 */
const COMMENTS: string[][] = [
  // Excellent, Very good
  [
    "Pulled their weight and kept the group moving.",
    "Took the lead on the parts nobody else wanted.",
    "Always came prepared and did what they said they would.",
  ],
  // Satisfactory, Ordinary
  [
    "Did their share, though it sometimes needed chasing.",
    "Fine once the work was allocated, less so before that.",
    "Reliable on the parts they took on.",
  ],
  // Marginal, Deficient
  [
    "Missed a few meetings and handed things in late.",
    "Needed reminding more often than the rest of us.",
    "Contributed, but well below what the others put in.",
  ],
  // Unsatisfactory, Superficial, No contribution
  [
    "Did almost none of the work the rest of us shared.",
    "Missed nearly every meeting and submitted nothing.",
    "We could not get hold of them for most of the project.",
  ],
];

const commentFor = (optionIndex: number, roll: number): string => {
  const band = optionIndex <= 1 ? 0 : optionIndex <= 3 ? 1 : optionIndex <= 5 ? 2 : 3;
  const choices = COMMENTS[band]!;
  return choices[Math.min(choices.length - 1, Math.floor(roll * choices.length))]!;
};

/**
 * A timestamp `days` from now, at 20:00 UTC.
 *
 * The rest of this file is deterministic, and the dates deliberately are not:
 * an assessment seeded as open has to still be open next month, or the demo
 * contradicts itself. Only the clock moves; who is in which group and who
 * rated whom stay identical between runs.
 */
const daysFromNow = (days: number) => {
  const when = new Date();
  when.setUTCDate(when.getUTCDate() + days);
  when.setUTCHours(20, 0, 0, 0);
  return when.toISOString();
};

/**
 * A small deterministic generator, so the ratings look varied but never change
 * between runs. Nothing here needs to be unpredictable.
 */
function sequence(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

async function seed() {
  const name = env.databaseUrl.split("/").pop()?.split("?")[0] ?? "";
  if (env.isProduction || !/(_dev|_test)$/.test(name)) {
    throw new Error(
      `Refusing to seed "${name}". Seeding only runs against a database whose name ends in _dev or _test, and never in production.`,
    );
  }

  // One hash for every account: they share a password, and at cost 12 doing it
  // per row would make a rebuild slow for no benefit. bcrypt still salts, so the
  // stored hashes differ anyway.
  const passwordHash = await hashPassword(DEV_PASSWORD);

  await withTransaction(async (sql) => {
    // Rebuild from scratch so the result is the same every time. Users are
    // rewritten too, since groups and enrolments point at them.
    await sql.query("TRUNCATE users, classes RESTART IDENTITY CASCADE");

    const staffIds = new Map<string, string>();
    for (const person of staff) {
      const { rows } = await sql.query<{ id: string }>(
        `INSERT INTO users (role, name, surname, email, password_hash, status)
         VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id`,
        [person.role, person.name, person.surname, person.email, passwordHash],
      );
      staffIds.set(person.email, rows[0]!.id);
    }

    const studentIds: string[] = [];
    for (const student of students) {
      const { rows } = await sql.query<{ id: string }>(
        `INSERT INTO users (role, name, surname, email, student_number, password_hash, status)
         VALUES ('student', $1, $2, $3, $4, $5, 'active') RETURNING id`,
        [
          student.name,
          student.surname,
          `${student.studentNumber}@mynwu.ac.za`,
          student.studentNumber,
          passwordHash,
        ],
      );
      studentIds.push(rows[0]!.id);
    }

    const anneke = staffIds.get("anneke.vdmerwe@nwu.ac.za")!;

    const classRows = await Promise.all(
      [
        ["CMPG323", "Development of Information Systems III"],
        ["CMPG315", "Computer Networks II"],
      ].map(([code, title]) =>
        sql.query<{ id: string }>(
          `INSERT INTO classes (module_code, name, academic_period, lecturer_id)
           VALUES ($1, $2, '2026 Semester 2', $3) RETURNING id`,
          [code, title, anneke],
        ),
      ),
    );
    const [cmpg323, cmpg315] = classRows.map((r) => r.rows[0]!.id) as [string, string];

    /* Class list: 28 matched, one unmatched, one conflict - the three states
       the class-list screen and the student explanation page are built for. */
    for (const [i, student] of students.entries()) {
      const status = i === 28 ? "unmatched" : i === 29 ? "conflict" : "matched";
      await sql.query(
        `INSERT INTO enrolments
           (class_id, student_number, imported_name, imported_surname, imported_email,
            match_status, user_id, match_note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          cmpg323,
          student.studentNumber,
          student.name,
          // The conflict row carries a DIFFERENT surname on the class list.
          // Seeding it identical to the account made the student's explanation
          // screen useless: it said the details needed checking and then showed
          // the same name twice. A real conflict is usually exactly this - a
          // surname changed or recorded differently since the list was drawn up.
          status === "conflict" ? "Odendaal" : student.surname,
          `${student.studentNumber}@mynwu.ac.za`,
          status,
          status === "matched" ? studentIds[i] : null,
          status === "unmatched"
            ? "No registered Peerly account uses this student number yet."
            : status === "conflict"
              ? "A registered account uses this student number, but its details need checking before it's linked."
              : null,
        ],
      );
    }

    const matched = studentIds.slice(0, 28);

    /** Creates numbered groups from consecutive slices of `members`. */
    async function makeGroups(classId: string, sizes: number[], members: string[]) {
      const ids: string[] = [];
      let cursor = 0;
      for (const [index, size] of sizes.entries()) {
        const { rows } = await sql.query<{ id: string }>(
          "INSERT INTO groups (class_id, group_number) VALUES ($1, $2) RETURNING id",
          [classId, index + 1],
        );
        const groupId = rows[0]!.id;
        for (const studentId of members.slice(cursor, cursor + size)) {
          await sql.query(
            "INSERT INTO group_members (group_id, class_id, student_id) VALUES ($1, $2, $3)",
            [groupId, classId, studentId],
          );
        }
        cursor += size;
        ids.push(groupId);
      }
      return ids;
    }

    const groups323 = await makeGroups(cmpg323, groupSizes, matched);

    // CMPG315 gets its own class list before its groups. Seeding groups whose
    // members are not on the class list produced a class that could never be
    // re-grouped - the allocator draws from matched enrolments, and there were
    // none. A fixture that cannot do what the screens offer is a bad fixture.
    const cmpg315Students = matched.slice(0, 11);
    for (const [offset, studentId] of cmpg315Students.entries()) {
      const student = students[offset]!;
      await sql.query(
        `INSERT INTO enrolments
           (class_id, student_number, imported_name, imported_surname, imported_email,
            match_status, user_id)
         VALUES ($1, $2, $3, $4, $5, 'matched', $6)`,
        [
          cmpg315,
          student.studentNumber,
          student.name,
          student.surname,
          `${student.studentNumber}@mynwu.ac.za`,
          studentId,
        ],
      );
    }
    await makeGroups(cmpg315, [4, 4, 3], cmpg315Students);

    /** Creates an assessment over every group given. */
    async function makeAssessment(input: {
      classId: string;
      name: string;
      description: string;
      status: "draft" | "open" | "closed";
      opensAt: string;
      closesAt: string;
      groupIds: string[];
    }) {
      const { rows } = await sql.query<{ id: string }>(
        // A closed one was closed at its scheduled time (closed_at, FR-13).
        `INSERT INTO assessments
           (class_id, name, description, status, opens_at, closes_at, closed_at, max_mark, created_by)
         VALUES ($1, $2, $3, $4::assessment_status, $5, $6::timestamptz,
                 CASE WHEN $4::assessment_status = 'closed' THEN $6::timestamptz END, 100, $7)
         RETURNING id`,
        [
          input.classId,
          input.name,
          input.description,
          input.status,
          input.opensAt,
          input.closesAt,
          anneke,
        ],
      );
      const assessmentId = rows[0]!.id;
      for (const groupId of input.groupIds) {
        await sql.query(
          "INSERT INTO assessment_groups (assessment_id, group_id, class_id) VALUES ($1, $2, $3)",
          [assessmentId, groupId, input.classId],
        );
      }
      return assessmentId;
    }

    const open = await makeAssessment({
      classId: cmpg323,
      name: "Project Phase 2 - Peer Assessment",
      description:
        "Rate each member of your group on their contribution to the Phase 2 system design and implementation.",
      status: "open",
      // Relative to today, so the open assessment is genuinely open whenever
      // this is run. Fixed dates rotted: the seed was written in September and
      // by the end of the month a student saw "needs you" on something whose
      // deadline had passed three weeks earlier.
      opensAt: daysFromNow(-10),
      closesAt: daysFromNow(11),
      groupIds: groups323,
    });

    const closed = await makeAssessment({
      classId: cmpg323,
      name: "Project Phase 1 - Peer Assessment",
      description: "Peer assessment for the Phase 1 requirements and analysis deliverable.",
      status: "closed",
      opensAt: daysFromNow(-72),
      closesAt: daysFromNow(-61),
      groupIds: groups323,
    });

    const { rows: options } = await sql.query<{ id: string; hidden_value: string }>(
      "SELECT id, hidden_value FROM rating_options ORDER BY display_order",
    );

    /**
     * Fills in submissions and ratings.
     *
     * `skipEvaluators` leaves some people outstanding, which is what the
     * submission monitor exists to show - a fully-submitted assessment would
     * make that screen look broken rather than empty.
     */
    async function rate(assessmentId: string, groupIds: string[], skipEvery: number) {
      const next = sequence(20260904);
      let submitted = 0;

      for (const groupId of groupIds) {
        // Ordered by student NUMBER, not by id. Ids are random uuids, so
        // ordering by them shuffled the members on every run and the skip rule
        // below then left a different person outstanding each time - which made
        // "re-running rebuilds exactly the same database" untrue, and any
        // document naming a student who has not submitted wrong within a day.
        const { rows: members } = await sql.query<{ student_id: string }>(
          `SELECT gm.student_id
             FROM group_members gm
             JOIN users u ON u.id = gm.student_id
            WHERE gm.group_id = $1
            ORDER BY u.student_number`,
          [groupId],
        );
        const memberIds = members.map((m) => m.student_id);

        for (const [index, evaluator] of memberIds.entries()) {
          if (skipEvery > 0 && (index + memberIds.length) % skipEvery === 0) continue;

          const { rows: submission } = await sql.query<{ id: string }>(
            `INSERT INTO submissions (assessment_id, evaluator_id, status, submitted_at)
             VALUES ($1, $2, 'submitted', now()) RETURNING id`,
            [assessmentId, evaluator],
          );
          submitted += 1;

          for (const evaluated of memberIds) {
            if (evaluated === evaluator) continue;
            // Weighted towards the upper half of the scale, which is what real
            // peer ratings look like, with enough spread to make the matrix and
            // the free-rider flags worth looking at.
            const pick = Math.min(options.length - 1, Math.floor(next() ** 2 * options.length));
            await sql.query(
              `INSERT INTO peer_ratings
                 (submission_id, assessment_id, group_id, evaluator_id, evaluated_id, rating_option_id, comment)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [
                submission[0]!.id,
                assessmentId,
                groupId,
                evaluator,
                evaluated,
                options[pick]!.id,
                next() < 0.3 ? commentFor(pick, next()) : null,
              ],
            );
          }
        }
      }
      return submitted;
    }

    const openSubmissions = await rate(open, groups323, 7);
    await rate(closed, groups323, 0);

    // The closed assessment has its group marks in, so the marks screen and the
    // results screen have something to work with (FR-21).
    for (const [index, groupId] of groups323.entries()) {
      await sql.query(
        `INSERT INTO group_marks (assessment_id, group_id, base_mark, entered_by)
         VALUES ($1, $2, $3, $4)`,
        [closed, groupId, 62 + index * 4, anneke],
      );
    }

    console.log(`  ${openSubmissions} submissions on the open assessment`);
  });

  const counts = await query<{ label: string; count: string }>(
    `SELECT 'users' AS label, count(*)::text FROM users
     UNION ALL SELECT 'classes', count(*)::text FROM classes
     UNION ALL SELECT 'enrolments', count(*)::text FROM enrolments
     UNION ALL SELECT 'groups', count(*)::text FROM groups
     UNION ALL SELECT 'assessments', count(*)::text FROM assessments
     UNION ALL SELECT 'submissions', count(*)::text FROM submissions
     UNION ALL SELECT 'peer ratings', count(*)::text FROM peer_ratings`,
  );

  console.log(`\nSeeded ${name}:`);
  for (const row of counts.rows) console.log(`  ${row.label.padEnd(13)} ${row.count}`);
  // Printed in full only when it is the published default, which is no secret.
  // A configured one is echoed nowhere: this runs on a server, into a log.
  console.log(
    DEV_PASSWORD === "peerly-dev-password"
      ? `\nEvery seeded account uses the password: ${DEV_PASSWORD}`
      : "\nEvery seeded account uses the configured SEED_PASSWORD.",
  );
}

try {
  await seed();
} catch (error) {
  console.error(`\nSeeding failed: ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await closePool();
}
