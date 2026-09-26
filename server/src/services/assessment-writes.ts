import { query, withTransaction } from "../db/pool.ts";
import { ONE_DECIMAL_MESSAGE, hasAtMostOneDecimal } from "../lib/marks.ts";
import { badRequest, conflict, notFoundOrForbidden } from "../middleware/errors.ts";
import type { SessionUser } from "../domain/types.ts";
import { getAssessment, type AssessmentRecord } from "./assessments.ts";
import { record } from "./audit.ts";
import { getClass, type Asker } from "./classes.ts";

/**
 * Setting up and running an assessment (FR-12, FR-13, FR-21).
 *
 * Every function here records what it did on the audit trail, in the same
 * transaction as the change (FR-27). That is why they take the whole
 * SessionUser rather than an Asker: the log stores who acted by name, and a
 * bare id would leave the entry unreadable once the account changed.
 */

const actorOf = (user: SessionUser) => ({
  id: user.id,
  name: user.name,
  surname: user.surname,
  role: user.role,
});

export interface CreateAssessmentInput {
  classId: string;
  name: string;
  description?: string;
  groupIds: string[];
  opensAt: string;
  closesAt: string;
  maxMark?: number;
}

/**
 * Creates an assessment, always as a draft (FR-12).
 *
 * Never straight to open: an assessment that went live on creation would be
 * visible to students before its group selection had been checked, and FR-13
 * makes activation a deliberate, separate act.
 */
export async function createAssessment(
  input: CreateAssessmentInput,
  user: SessionUser,
): Promise<AssessmentRecord> {
  const klass = await getClass(input.classId, user);

  if (new Date(input.closesAt) <= new Date(input.opensAt)) {
    // Also a CHECK constraint; named here so the field can be marked.
    throw badRequest("The closing time must be after the opening time.", {
      closesAt: "The closing time must be after the opening time.",
    });
  }
  if (input.groupIds.length === 0) {
    throw badRequest("Choose at least one group to take part.", {
      groupIds: "Choose at least one group to take part.",
    });
  }

  const id = await withTransaction(async (sql) => {
    const { rows } = await sql.query<{ id: string }>(
      `INSERT INTO assessments
         (class_id, name, description, status, opens_at, closes_at, max_mark, created_by)
       VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7) RETURNING id`,
      [
        input.classId,
        input.name.trim(),
        input.description?.trim() ?? "",
        input.opensAt,
        input.closesAt,
        input.maxMark ?? 100,
        user.id,
      ],
    );
    const assessmentId = rows[0]!.id;

    for (const groupId of input.groupIds) {
      // The composite foreign key refuses a group from another class, so a
      // hand-made request cannot pull an outsider's group into an assessment.
      await sql.query(
        "INSERT INTO assessment_groups (assessment_id, group_id, class_id) VALUES ($1, $2, $3)",
        [assessmentId, groupId, input.classId],
      );
    }

    await record(
      {
        actor: actorOf(user),
        eventType: "assessment.created",
        objectDescription: `${klass.moduleCode} · ${input.name.trim()}`,
        detail: `Created as a draft over ${input.groupIds.length} group(s).`,
        classId: input.classId,
        assessmentId,
      },
      sql,
    );

    return assessmentId;
  });

  return getAssessment(id, user);
}

/** True when both lists name the same groups, in any order. */
const sameGroups = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

export interface AssessmentChanges {
  name?: string;
  description?: string;
  opensAt?: string;
  closesAt?: string;
  maxMark?: number;
  groupIds?: string[];
}

/**
 * Edits an assessment, and extends its closing time (FR-13).
 *
 * The group selection may only change while the assessment is a draft. Once it
 * has opened, students have already been told who they are rating, and some
 * have submitted - changing the membership underneath them would orphan
 * ratings that BR-01 says must belong to a group both parties are in.
 */
export async function updateAssessment(
  assessmentId: string,
  changes: AssessmentChanges,
  user: SessionUser,
): Promise<AssessmentRecord> {
  const before = await getAssessment(assessmentId, user);

  const opensAt = changes.opensAt ?? before.opensAt;
  const closesAt = changes.closesAt ?? before.closesAt;
  if (new Date(closesAt) <= new Date(opensAt)) {
    throw badRequest("The closing time must be after the opening time.", {
      closesAt: "The closing time must be after the opening time.",
    });
  }

  // The same set of groups is not a change. An edit form sends back the whole
  // setup, and refusing an unchanged selection used to make every open or
  // closed assessment impossible to rename or extend.
  const groupsChanged =
    changes.groupIds !== undefined && !sameGroups(changes.groupIds, before.groupIds);

  if (groupsChanged && before.status !== "draft") {
    // Closing does not unlock them either: ratings already given belong to the
    // groups as they were (BR-01), so the only way to assess other groups is a
    // new assessment.
    throw conflict(
      "Groups can't be changed once an assessment has opened. Create a new assessment for a different set of groups.",
    );
  }

  // BR-07: a mark is never above the assessment's maximum, so the maximum can't
  // be lowered underneath marks already entered, calculated or overridden. The
  // database refuses it too (0005); asking here first names the highest mark.
  const newMaxMark = changes.maxMark ?? before.maxMark;
  if (newMaxMark < before.maxMark) {
    const { rows } = await query<{ highest: string | null }>(
      `SELECT max(mark) AS highest FROM (
         SELECT base_mark AS mark FROM group_marks WHERE assessment_id = $1
         UNION ALL
         SELECT final_mark FROM calculated_results WHERE assessment_id = $1
         UNION ALL
         SELECT override_mark FROM mark_overrides WHERE assessment_id = $1
       ) marks`,
      [assessmentId],
    );
    const highest = rows[0]?.highest == null ? null : Number(rows[0].highest);
    if (highest !== null && highest > newMaxMark) {
      const message =
        `A mark of ${highest} has already been entered or calculated, so the maximum ` +
        `can't be lower than that. Change those marks first, or keep the maximum at ${highest} or more.`;
      throw badRequest(message, { maxMark: message });
    }
  }
  // Every mark was capped at the old maximum, so a different one makes the
  // calculated marks out of date, as re-opening does (FR-13).
  const invalidatesCalculation = newMaxMark !== before.maxMark && Boolean(before.calculatedAt);

  await withTransaction(async (sql) => {
    await sql.query(
      `UPDATE assessments
          SET name = $2, description = $3, opens_at = $4, closes_at = $5, max_mark = $6,
              calculated_at = CASE WHEN $7 THEN NULL ELSE calculated_at END,
              calculation_run_id = CASE WHEN $7 THEN NULL ELSE calculation_run_id END
        WHERE id = $1`,
      [
        assessmentId,
        changes.name?.trim() ?? before.name,
        changes.description?.trim() ?? before.description,
        opensAt,
        closesAt,
        newMaxMark,
        invalidatesCalculation,
      ],
    );

    if (changes.groupIds && groupsChanged) {
      await sql.query("DELETE FROM assessment_groups WHERE assessment_id = $1", [assessmentId]);
      for (const groupId of changes.groupIds) {
        await sql.query(
          "INSERT INTO assessment_groups (assessment_id, group_id, class_id) VALUES ($1, $2, $3)",
          [assessmentId, groupId, before.classId],
        );
      }
    }

    /**
     * One entry naming every field that actually moved (FR-27).
     *
     * This used to record a change only when the closing time moved, so a
     * rename, a different maximum mark, a new opening time or a change to which
     * groups take part all happened with no trail at all - and the last two
     * decide who is assessed and what their mark is out of. FR-27 is "every
     * write", not "the write we thought was interesting".
     *
     * Both values are kept for each field, because knowing that something moved
     * without knowing what it moved from is not an account of anything. An
     * extension still reads in full, which is the change most often queried.
     */
    const moved: string[] = [];
    const wasValues: Record<string, unknown> = {};
    const nowValues: Record<string, unknown> = {};

    const note = (field: string, was: unknown, now: unknown, sentence: string) => {
      moved.push(sentence);
      wasValues[field] = was;
      nowValues[field] = now;
    };

    const name = changes.name?.trim() ?? before.name;
    if (name !== before.name) note("name", before.name, name, `Renamed from "${before.name}".`);

    const description = changes.description?.trim() ?? before.description;
    if (description !== before.description) {
      note("description", before.description, description, "Description changed.");
    }

    if (opensAt !== before.opensAt) {
      note("opensAt", before.opensAt, opensAt, `Opening time changed from ${before.opensAt}.`);
    }

    if (closesAt !== before.closesAt) {
      note(
        "closesAt",
        before.closesAt,
        closesAt,
        `Closing time changed from ${before.closesAt} to ${closesAt}.`,
      );
    }

    const maxMark = changes.maxMark ?? before.maxMark;
    if (maxMark !== before.maxMark) {
      note(
        "maxMark",
        before.maxMark,
        maxMark,
        `Maximum mark changed from ${before.maxMark} to ${maxMark}.` +
          (invalidatesCalculation ? " The calculated marks need calculating again." : ""),
      );
    }

    if (changes.groupIds) {
      const was = [...before.groupIds].sort();
      const now = [...changes.groupIds].sort();
      if (was.join() !== now.join()) {
        note(
          "groupIds",
          before.groupIds,
          changes.groupIds,
          `Participating groups changed from ${was.length} to ${now.length}.`,
        );
      }
    }

    if (moved.length > 0) {
      await record(
        {
          actor: actorOf(user),
          eventType: "assessment.updated",
          objectDescription: name,
          detail: moved.join(" "),
          classId: before.classId,
          assessmentId,
          before: wasValues,
          after: nowValues,
        },
        sql,
      );
    }
  });

  return getAssessment(assessmentId, user);
}

type Transition = "open" | "close" | "reopen";

const TRANSITIONS: Record<
  Transition,
  { from: AssessmentRecord["status"][]; to: "open" | "closed" }
> = {
  open: { from: ["draft"], to: "open" },
  close: { from: ["open"], to: "closed" },
  reopen: { from: ["closed"], to: "open" },
};

export interface StatusChangeResult {
  assessment: AssessmentRecord;
  /** True when reopening has invalidated a completed calculation (FR-13). */
  invalidatedCalculation: boolean;
}

/**
 * Activates, closes or re-opens an assessment (FR-13).
 *
 * Transitions are explicit rather than "set the status to whatever you like":
 * a draft that jumped straight to closed, or an open one re-opened again, are
 * both meaningless, and allowing them would make the audit trail describe
 * states the system never really passed through.
 *
 * Opening or re-opening needs a closing time still in the future. BR-05 refuses
 * every submission once the closing time has passed, so an assessment opened
 * after it would be "open" to nobody - and every screen would say otherwise.
 * `closesAt` lets the lecturer choose a new closing time in the same step, so
 * a closed assessment whose time has passed can still be re-opened.
 */
export async function changeAssessmentStatus(
  assessmentId: string,
  transition: Transition,
  user: SessionUser,
  options: { closesAt?: string | undefined } = {},
): Promise<StatusChangeResult> {
  const before = await getAssessment(assessmentId, user);
  const rule = TRANSITIONS[transition];

  if (!rule.from.includes(before.status)) {
    throw conflict(
      transition === "open"
        ? "Only a draft assessment can be opened."
        : transition === "close"
          ? "Only an open assessment can be closed."
          : "Only a closed assessment can be re-opened.",
    );
  }

  if (options.closesAt !== undefined && transition === "close") {
    throw badRequest("A new closing time can only be set when opening or re-opening.");
  }

  // Normalised, so "+02:00" and "Z" spellings of the same moment compare equal.
  const closesAt =
    options.closesAt !== undefined ? new Date(options.closesAt).toISOString() : before.closesAt;
  const closesAtMoved = closesAt !== before.closesAt;

  if (transition !== "close") {
    if (new Date(closesAt) <= new Date()) {
      const message = closesAtMoved
        ? "The new closing time has to be in the future."
        : "The closing time has already passed, so students couldn't submit anything. Choose a later closing time first.";
      throw badRequest(message, { closesAt: message });
    }
    if (new Date(closesAt) <= new Date(before.opensAt)) {
      throw badRequest("The closing time must be after the opening time.", {
        closesAt: "The closing time must be after the opening time.",
      });
    }
  }

  // FR-13: re-opening after marks were calculated invalidates them, because the
  // ratings they were derived from can now change. Reported so the interface can
  // say so plainly rather than leaving stale results on screen.
  const invalidatedCalculation = transition === "reopen" && Boolean(before.calculatedAt);

  await withTransaction(async (sql) => {
    // closed_at records when the lecturer actually closed it, which is often
    // not the scheduled closing time. Re-opening clears it.
    await sql.query(
      `UPDATE assessments
          SET status = $2::assessment_status,
              closes_at = $4,
              closed_at = CASE WHEN $2::assessment_status = 'closed' THEN now() ELSE NULL END,
              calculated_at = CASE WHEN $3 THEN NULL ELSE calculated_at END,
              calculation_run_id = CASE WHEN $3 THEN NULL ELSE calculation_run_id END
        WHERE id = $1`,
      [assessmentId, rule.to, invalidatedCalculation, closesAt],
    );

    const sentences = [
      invalidatedCalculation
        ? "Re-opened after calculation; the previous results are no longer valid."
        : `Status changed from ${before.status} to ${rule.to}.`,
      ...(closesAtMoved ? [`Closing time changed from ${before.closesAt} to ${closesAt}.`] : []),
    ];

    await record(
      {
        actor: actorOf(user),
        eventType:
          transition === "open"
            ? "assessment.opened"
            : transition === "close"
              ? "assessment.closed"
              : "assessment.reopened",
        objectDescription: before.name,
        detail: sentences.join(" "),
        classId: before.classId,
        assessmentId,
        before: { status: before.status, ...(closesAtMoved ? { closesAt: before.closesAt } : {}) },
        after: { status: rule.to, ...(closesAtMoved ? { closesAt } : {}) },
      },
      sql,
    );
  });

  return { assessment: await getAssessment(assessmentId, user), invalidatedCalculation };
}

/**
 * Records a group's base mark (FR-21).
 *
 * Null clears it, which is not the same as zero: zero is a mark the group
 * earned, and null is one the lecturer has not entered. The results screen
 * shows those differently, and the calculation must refuse to run on the second.
 *
 * A mark that actually changes after the marks were calculated makes those
 * marks out of date, exactly as re-opening does (FR-13): the results and the
 * export stop treating the last run as current until it is calculated again,
 * rather than carrying a base mark that is no longer the one on record.
 */
export async function setGroupBaseMark(
  assessmentId: string,
  groupId: string,
  baseMark: number | null,
  user: SessionUser,
): Promise<{ invalidatedCalculation: boolean }> {
  const assessment = await getAssessment(assessmentId, user);

  if (baseMark !== null && (baseMark < 0 || baseMark > assessment.maxMark)) {
    throw badRequest(`Enter a mark between 0 and ${assessment.maxMark}.`, {
      baseMark: `Enter a mark between 0 and ${assessment.maxMark}.`,
    });
  }
  // IS-06: one decimal place, as the marks screen asks. Enforced here because
  // the API can be called directly, and numeric(6, 2) would otherwise round a
  // third decimal away silently while the audit log recorded the original.
  if (baseMark !== null && !hasAtMostOneDecimal(baseMark)) {
    throw badRequest(ONE_DECIMAL_MESSAGE, { baseMark: ONE_DECIMAL_MESSAGE });
  }

  const { rows: participates } = await query(
    "SELECT 1 FROM assessment_groups WHERE assessment_id = $1 AND group_id = $2",
    [assessmentId, groupId],
  );
  if (participates.length === 0) throw notFoundOrForbidden();

  const { rows: previous } = await query<{ base_mark: string | null; group_number: number }>(
    `SELECT gm.base_mark, g.group_number
       FROM groups g
       LEFT JOIN group_marks gm ON gm.group_id = g.id AND gm.assessment_id = $1
      WHERE g.id = $2`,
    [assessmentId, groupId],
  );
  const before = previous[0]?.base_mark == null ? null : Number(previous[0].base_mark);

  // Leaving a mark box without changing it is not a write. Recording it anyway
  // filled the append-only log with "set to 82" entries that moved nothing,
  // and "cleared" entries for boxes that had never held a mark.
  if (before === baseMark) return { invalidatedCalculation: false };

  const invalidatedCalculation = Boolean(assessment.calculatedAt);

  await withTransaction(async (sql) => {
    await sql.query(
      `INSERT INTO group_marks (assessment_id, group_id, base_mark, entered_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (assessment_id, group_id) DO UPDATE
          SET base_mark = EXCLUDED.base_mark,
              entered_by = EXCLUDED.entered_by,
              updated_at = now()`,
      [assessmentId, groupId, baseMark, user.id],
    );

    if (invalidatedCalculation) {
      await sql.query(
        "UPDATE assessments SET calculated_at = NULL, calculation_run_id = NULL WHERE id = $1",
        [assessmentId],
      );
    }

    // OR-09: a mark that ends up on an academic record has to be explainable,
    // which means knowing what it was before somebody changed it.
    await record(
      {
        actor: actorOf(user),
        eventType: "marks.entered",
        objectDescription: `${assessment.name} · Group ${previous[0]?.group_number ?? "?"}`,
        detail:
          (baseMark === null
            ? "Group mark cleared."
            : `Group mark set to ${baseMark} out of ${assessment.maxMark}.`) +
          (invalidatedCalculation
            ? " The calculated marks are out of date until they are calculated again."
            : ""),
        classId: assessment.classId,
        assessmentId,
        before: { baseMark: before },
        after: { baseMark },
      },
      sql,
    );
  });

  return { invalidatedCalculation };
}
