import { pool, query, withTransaction, type Sql } from "../db/pool.ts";
import type { SessionUser } from "../domain/types.ts";
import { badRequest, conflict } from "../middleware/errors.ts";
import { record } from "./audit.ts";
import { getClass } from "./classes.ts";
import type { ParsedSheet } from "./class-list.ts";
import { matchEnrolments } from "./matching.ts";
import { regroupingBlockedReason } from "./groups.ts";

/**
 * Validating, previewing and committing a class list (FR-08, FR-09, FR-04).
 *
 * Validation and the commit share one function, `validateRows`, on purpose. A
 * preview that applied different rules from the commit would be worse than no
 * preview at all: the lecturer would approve one thing and get another.
 */

/** The note on a row nobody's account has claimed yet. */
const UNMATCHED_NOTE = "No registered Peerly account uses this student number yet.";

/** An 8-digit student number, as printed on a student card. */
const STUDENT_NUMBER = /^\d{8}$/;

export interface ColumnMapping {
  studentNumber: string;
  name: string;
  surname: string;
  email?: string | undefined;
  groupNumber?: string | undefined;
  groupName?: string | undefined;
  groupLeader?: string | undefined;
}

export interface RowError {
  /** 1-based, and counting the header, so it matches what the file shows. */
  row: number;
  field: keyof ColumnMapping;
  message: string;
  /**
   * What the row held, as read. Without it the preview can say only "row 8 has
   * no first name", and the lecturer cannot tell which student that is.
   */
  values: {
    studentNumber: string;
    name: string;
    surname: string;
    email: string;
    groupNumber?: string;
    groupName?: string;
    groupLeader?: string;
  };
}

export interface ImportRow {
  row: number;
  studentNumber: string;
  name: string;
  surname: string;
  email?: string;
  groupNumber?: number;
  groupName?: string;
  groupLeader?: boolean;
}

export interface ImportPreview {
  headers: string[];
  valid: ImportRow[];
  errors: RowError[];
  /** How many of the valid rows already exist on this class list. */
  duplicatesInFile: number;
  totalRows: number;
}

/**
 * Suggests a column mapping from the headings the file happens to use.
 *
 * Only a suggestion: FR-08 has the lecturer confirm it, because a wrong guess
 * here would put surnames in the student-number column and every row would
 * fail for the wrong reason.
 */
export function suggestMapping(headers: string[]): Partial<ColumnMapping> {
  const find = (...patterns: RegExp[]) =>
    headers.find((header) => patterns.some((pattern) => pattern.test(header.toLowerCase())));

  return {
    ...(find(/student\s*(number|no|nr|#)/, /^number$/, /^studentnr$/) && {
      studentNumber: find(/student\s*(number|no|nr|#)/, /^number$/, /^studentnr$/)!,
    }),
    ...(find(/^(first\s*)?name$/, /given/, /voornaam/) && {
      name: find(/^(first\s*)?name$/, /given/, /voornaam/)!,
    }),
    ...(find(/surname/, /last\s*name/, /family/, /van$/) && {
      surname: find(/surname/, /last\s*name/, /family/, /van$/)!,
    }),
    ...(find(/e-?mail/) && { email: find(/e-?mail/)! }),
    ...(find(/^group(?:[\s_-]*(?:number|no\.?|nr\.?|#))?$/) && {
      groupNumber: find(/^group(?:[\s_-]*(?:number|no\.?|nr\.?|#))?$/)!,
    }),
    ...(find(/^group[\s_-]*name$/) && {
      groupName: find(/^group[\s_-]*name$/)!,
    }),
    ...(find(/^group[\s_-]*lead(?:er)?$/) && {
      groupLeader: find(/^group[\s_-]*lead(?:er)?$/)!,
    }),
  };
}

/**
 * Checks every row and separates the usable from the broken (FR-09).
 *
 * A row that fails is reported with its number, its field and a reason in plain
 * language, so the lecturer can fix the file rather than guess.
 */
export function validateRows(sheet: ParsedSheet, mapping: ColumnMapping) {
  const index = (column: string) => sheet.headers.indexOf(column);

  const mapped = Object.values(mapping).filter(Boolean);
  if (new Set(mapped).size !== mapped.length) {
    throw badRequest("Each column can only be mapped to one field.");
  }

  const columns = {
    studentNumber: index(mapping.studentNumber),
    name: index(mapping.name),
    surname: index(mapping.surname),
    email: mapping.email ? index(mapping.email) : -1,
    groupNumber: mapping.groupNumber ? index(mapping.groupNumber) : -1,
    groupName: mapping.groupName ? index(mapping.groupName) : -1,
    groupLeader: mapping.groupLeader ? index(mapping.groupLeader) : -1,
  };

  for (const [field, position] of Object.entries(columns)) {
    if (
      position === -1 &&
      (field === "studentNumber" ||
        field === "name" ||
        field === "surname" ||
        (field !== "email" && Boolean(mapping[field as keyof ColumnMapping])))
    ) {
      throw badRequest(`The file has no column called "${mapping[field as keyof ColumnMapping]}".`);
    }
  }

  const valid: ImportRow[] = [];
  const errors: RowError[] = [];
  const seen = new Map<string, number>();
  const rawValues = new Map<number, RowError["values"]>();

  sheet.rows.forEach((cells, offset) => {
    // The row's own number in the file when the parser kept it; otherwise +2:
    // one for the header, one because people count from 1.
    const row = sheet.rowNumbers?.[offset] ?? offset + 2;
    const studentNumber = (cells[columns.studentNumber] ?? "").trim();
    const name = (cells[columns.name] ?? "").trim();
    const surname = (cells[columns.surname] ?? "").trim();
    const email = columns.email === -1 ? "" : (cells[columns.email] ?? "").trim();
    const groupNumber = columns.groupNumber === -1 ? "" : (cells[columns.groupNumber] ?? "").trim();
    const groupName = columns.groupName === -1 ? "" : (cells[columns.groupName] ?? "").trim();
    const groupLeader = columns.groupLeader === -1 ? "" : (cells[columns.groupLeader] ?? "").trim();
    const values = {
      studentNumber,
      name,
      surname,
      email,
      ...(mapping.groupNumber ? { groupNumber } : {}),
      ...(mapping.groupName ? { groupName } : {}),
      ...(mapping.groupLeader ? { groupLeader } : {}),
    };
    rawValues.set(row, values);

    if (!studentNumber) {
      errors.push({
        row,
        field: "studentNumber",
        message: "No student number in this row.",
        values,
      });
      return;
    }
    if (!STUDENT_NUMBER.test(studentNumber)) {
      errors.push({
        row,
        field: "studentNumber",
        message: `"${studentNumber}" is not an 8-digit student number.`,
        values,
      });
      return;
    }
    // FR-08: the same student cannot appear twice on one list. Reported against
    // the second occurrence, naming the first, so the lecturer knows where to look.
    const first = seen.get(studentNumber);
    if (first !== undefined) {
      errors.push({
        row,
        field: "studentNumber",
        message: `${studentNumber} already appears on row ${first}.`,
        values,
      });
      return;
    }
    if (!name) {
      errors.push({ row, field: "name", message: "No first name in this row.", values });
      return;
    }
    if (!surname) {
      errors.push({ row, field: "surname", message: "No surname in this row.", values });
      return;
    }
    if (
      groupNumber &&
      (!/^\d+$/.test(groupNumber) || Number(groupNumber) < 1 || Number(groupNumber) > 2_147_483_647)
    ) {
      errors.push({
        row,
        field: "groupNumber",
        message: "Enter a whole group number between 1 and 2147483647, or leave it blank.",
        values,
      });
      return;
    }

    if (groupName.length > 120) {
      errors.push({
        row,
        field: "groupName",
        message: "Enter a group name of up to 120 characters, or leave it blank.",
        values,
      });
      return;
    }
    if (groupLeader && groupLeader.toLowerCase() !== "x") {
      errors.push({
        row,
        field: "groupLeader",
        message: "Mark the group leader with x, or leave the cell blank.",
        values,
      });
      return;
    }
    if (!groupNumber && (groupName || groupLeader)) {
      errors.push({
        row,
        field: groupName ? "groupName" : "groupLeader",
        message: "A group number is required when a group name or leader is specified.",
        values,
      });
      return;
    }

    seen.set(studentNumber, row);
    valid.push({
      row,
      studentNumber,
      name,
      surname,
      ...(email ? { email } : {}),
      ...(groupNumber ? { groupNumber: Number(groupNumber) } : {}),
      ...(groupName ? { groupName } : {}),
      ...(groupLeader ? { groupLeader: true } : {}),
    });
  });

  // Check the whole group, so conflicting labels or leaders cannot be chosen
  // arbitrarily by row order. Blank cells do not conflict with a supplied value.
  const groups = new Map<number, ImportRow[]>();
  for (const row of valid) {
    if (row.groupNumber === undefined) continue;
    const members = groups.get(row.groupNumber) ?? [];
    members.push(row);
    groups.set(row.groupNumber, members);
  }
  const conflicts = new Map<number, { field: keyof ColumnMapping; message: string }>();
  for (const [number, members] of groups) {
    const names = new Set(members.flatMap((row) => (row.groupName ? [row.groupName] : [])));
    if (names.size > 1) {
      conflicts.set(number, {
        field: "groupName",
        message: `Group ${number} has different names in this file. Use the same name for the group, or leave cells blank.`,
      });
    } else if (members.filter((row) => row.groupLeader).length > 1) {
      conflicts.set(number, {
        field: "groupLeader",
        message: `Group ${number} has more than one leader marked with x. Mark only one leader per group.`,
      });
    }
  }
  return {
    valid: valid.filter((row) => {
      const problem = row.groupNumber === undefined ? undefined : conflicts.get(row.groupNumber);
      if (!problem) return true;
      errors.push({ row: row.row, ...problem, values: rawValues.get(row.row)! });
      return false;
    }),
    errors,
  };
}

function rowValues(row: ImportRow, mapping: ColumnMapping): RowError["values"] {
  return {
    studentNumber: row.studentNumber,
    name: row.name,
    surname: row.surname,
    email: row.email ?? "",
    ...(mapping.groupNumber
      ? { groupNumber: row.groupNumber === undefined ? "" : String(row.groupNumber) }
      : {}),
    ...(mapping.groupName ? { groupName: row.groupName ?? "" } : {}),
    ...(mapping.groupLeader ? { groupLeader: row.groupLeader ? "x" : "" } : {}),
  };
}

/** Preview and commit share the same checks against existing allocations and locks. */
async function validateImport(
  classId: string,
  sheet: ParsedSheet,
  mapping: ColumnMapping,
  sql: Sql = pool,
) {
  const result = validateRows(sheet, mapping);
  if (!result.valid.some((row) => row.groupNumber !== undefined)) return result;
  const { rows } = await sql.query<{
    student_number: string;
    group_number: number | null;
    member_group_number: number | null;
    match_status: string;
  }>(
    `SELECT e.student_number, COALESCE(g.group_number, imported.group_number) AS group_number,
            g.group_number AS member_group_number, e.match_status
       FROM enrolments e
       LEFT JOIN group_members gm ON gm.class_id = e.class_id AND gm.student_id = e.user_id
       LEFT JOIN groups g ON g.id = gm.group_id
       LEFT JOIN groups imported ON imported.id = e.imported_group_id
      WHERE e.class_id = $1`,
    [classId],
  );
  const existing = new Map(rows.map((row) => [row.student_number, row]));
  const blocked = await regroupingBlockedReason(classId, sql);
  result.valid = result.valid.filter((row) => {
    if (row.groupNumber === undefined) return true;
    const old = existing.get(row.studentNumber);
    const message =
      old?.group_number != null && old.group_number !== row.groupNumber
        ? `This student is already assigned to group ${old.group_number}. Existing group assignments are kept; edit groups separately.`
        : blocked &&
            (old?.group_number !== row.groupNumber ||
              (old?.match_status === "matched" && old.member_group_number === null))
          ? blocked
          : null;
    if (!message) return true;
    result.errors.push({
      row: row.row,
      field: "groupNumber",
      message,
      values: rowValues(row, mapping),
    });
    return false;
  });
  if (blocked && result.valid.some((row) => row.groupName || row.groupLeader)) {
    const { rows: groups } = await sql.query<{
      group_number: number;
      group_name: string | null;
      leader_number: string | null;
    }>(
      `SELECT g.group_number, g.group_name, e.student_number AS leader_number
         FROM groups g LEFT JOIN enrolments e ON e.id = g.leader_enrolment_id
        WHERE g.class_id = $1`,
      [classId],
    );
    const oldGroups = new Map(groups.map((group) => [group.group_number, group]));
    const changed = new Map<number, keyof ColumnMapping>();
    for (const row of result.valid) {
      if (row.groupNumber === undefined) continue;
      const old = oldGroups.get(row.groupNumber);
      if (row.groupName && row.groupName !== old?.group_name)
        changed.set(row.groupNumber, "groupName");
      if (row.groupLeader && row.studentNumber !== old?.leader_number)
        changed.set(row.groupNumber, "groupLeader");
    }
    result.valid = result.valid.filter((row) => {
      const field = row.groupNumber === undefined ? undefined : changed.get(row.groupNumber);
      if (!field) return true;
      result.errors.push({
        row: row.row,
        field,
        message: blocked,
        values: rowValues(row, mapping),
      });
      return false;
    });
  }
  return result;
}

/** Builds the preview the lecturer confirms against (FR-09). */
export async function previewImport(
  classId: string,
  sheet: ParsedSheet,
  mapping: ColumnMapping,
  user: SessionUser,
): Promise<ImportPreview> {
  await getClass(classId, user);
  const { valid, errors } = await validateImport(classId, sheet, mapping);

  const { rows: existing } = await query<{ student_number: string }>(
    "SELECT student_number FROM enrolments WHERE class_id = $1",
    [classId],
  );
  const already = new Set(existing.map((row) => row.student_number));

  return {
    headers: sheet.headers,
    valid,
    errors,
    duplicatesInFile: valid.filter((row) => already.has(row.studentNumber)).length,
    totalRows: sheet.rows.length,
  };
}

export type ImportMode = "extend" | "replace";

export interface ImportResult {
  imported: number;
  updated: number;
  removed: number;
  matched: number;
  unmatched: number;
  /** Rows waiting on the lecturer to resolve, so the result can say so. */
  conflicts: number;
  groupsCreated: number;
  groupAssignments: number;
}

/**
 * Commits a class list (FR-08, FR-09, FR-04).
 *
 * One transaction: a half-imported class list is worse than none, because the
 * groups drawn from it would be wrong in a way nobody would notice (OR-05).
 *
 * `replace` removes rows the new file does not contain. It refuses once groups
 * exist, because removing an enrolment whose student is already in a group -
 * possibly with ratings against them - would leave the class inconsistent in a
 * way no message could explain afterwards.
 */
export async function commitImport(
  classId: string,
  sheet: ParsedSheet,
  mapping: ColumnMapping,
  mode: ImportMode,
  user: SessionUser,
): Promise<ImportResult> {
  const klass = await getClass(classId, user);
  return withTransaction(async (sql) => {
    // Serialize imports for this class, and validate again inside the transaction.
    await sql.query("SELECT id FROM classes WHERE id = $1 FOR UPDATE", [classId]);
    const { valid, errors } = await validateImport(classId, sheet, mapping, sql);
    if (valid.length === 0) throw badRequest("There are no valid rows to import.");
    if (mode === "replace") {
      const { rows } = await sql.query<{ count: string }>(
        "SELECT count(*) AS count FROM groups WHERE class_id = $1",
        [classId],
      );
      if (Number(rows[0]!.count) > 0) {
        throw conflict(
          "This class already has groups, so its list can't be replaced. Add the new students to it instead.",
        );
      }
    }
    let removed = 0;
    if (mode === "replace") {
      const numbers = valid.map((row) => row.studentNumber);
      const { rowCount } = await sql.query(
        "DELETE FROM enrolments WHERE class_id = $1 AND NOT (student_number = ANY($2::text[]))",
        [classId, numbers],
      );
      removed = rowCount ?? 0;
    }

    let imported = 0;
    let updated = 0;
    let groupsCreated = 0;
    const groupIds = new Map<number, string>();
    for (const number of new Set(
      valid.flatMap((row) => (row.groupNumber === undefined ? [] : [row.groupNumber])),
    )) {
      const created = await sql.query<{ id: string }>(
        "INSERT INTO groups (class_id, group_number) VALUES ($1, $2) ON CONFLICT (class_id, group_number) DO NOTHING RETURNING id",
        [classId, number],
      );
      groupsCreated += created.rowCount ?? 0;
      const id =
        created.rows[0]?.id ??
        (
          await sql.query<{ id: string }>(
            "SELECT id FROM groups WHERE class_id = $1 AND group_number = $2",
            [classId, number],
          )
        ).rows[0]!.id;
      groupIds.set(number, id);
    }
    const groupAssignments = valid.filter((row) => row.groupNumber !== undefined).length;

    const enrolmentIds = new Map<string, string>();
    for (const row of valid) {
      // Every row lands unmatched; FR-04 runs once over the whole list below,
      // by the same rule account activation uses.
      //
      // An existing Conflict goes back to unmatched so that rule looks at it
      // again. Nobody decided it - matching did, because the names differed -
      // and a corrected list may well make them agree. If they still differ it
      // simply becomes a Conflict again. A match, and an entry the lecturer
      // reviewed and left unmatched, are decisions and are kept.
      const { rows } = await sql.query<{ id: string; inserted: boolean }>(
        `INSERT INTO enrolments
           (class_id, student_number, imported_name, imported_surname, imported_email,
            match_status, user_id, match_note, imported_group_id)
         VALUES ($1, $2, $3, $4, $5, 'unmatched', NULL, $6, $7)
         ON CONFLICT (class_id, student_number) DO UPDATE
            SET imported_name = EXCLUDED.imported_name,
                imported_surname = EXCLUDED.imported_surname,
                imported_email = EXCLUDED.imported_email,
                imported_group_id = COALESCE(EXCLUDED.imported_group_id, enrolments.imported_group_id),
                match_status = CASE WHEN enrolments.match_status = 'conflict'
                                    THEN 'unmatched'::match_status
                                    ELSE enrolments.match_status END,
                match_note = CASE WHEN enrolments.match_status = 'conflict'
                                  THEN EXCLUDED.match_note
                                  ELSE enrolments.match_note END
         RETURNING id, (xmax = 0) AS inserted`,
        [
          classId,
          row.studentNumber,
          row.name,
          row.surname,
          row.email ?? null,
          UNMATCHED_NOTE,
          row.groupNumber === undefined ? null : groupIds.get(row.groupNumber),
        ],
      );
      enrolmentIds.set(row.studentNumber, rows[0]!.id);
      if (rows[0]?.inserted) imported += 1;
      else updated += 1;
    }

    const metadataBefore: Array<{
      groupNumber: number;
      groupName: string | null;
      leaderStudentNumber: string | null;
    }> = [];
    const metadataAfter: typeof metadataBefore = [];
    for (const [number, id] of groupIds) {
      const members = valid.filter((row) => row.groupNumber === number);
      const name = members.find((row) => row.groupName)?.groupName;
      const leader = members.find((row) => row.groupLeader);
      if (!name && !leader) continue;
      const { rows: old } = await sql.query<{
        group_name: string | null;
        leader_number: string | null;
      }>(
        `SELECT g.group_name, e.student_number AS leader_number FROM groups g
           LEFT JOIN enrolments e ON e.id = g.leader_enrolment_id WHERE g.id = $1`,
        [id],
      );
      await sql.query(
        `UPDATE groups SET group_name = COALESCE($2, group_name),
                           leader_enrolment_id = COALESCE($3, leader_enrolment_id) WHERE id = $1`,
        [id, name ?? null, leader ? enrolmentIds.get(leader.studentNumber) : null],
      );
      metadataBefore.push({
        groupNumber: number,
        groupName: old[0]!.group_name,
        leaderStudentNumber: old[0]!.leader_number,
      });
      metadataAfter.push({
        groupNumber: number,
        groupName: name ?? old[0]!.group_name,
        leaderStudentNumber: leader?.studentNumber ?? old[0]!.leader_number,
      });
    }

    // FR-04 on every class-list commit - including rows that were already on
    // the list, so a student who registered since the last import is picked up.
    await matchEnrolments(
      sql,
      { classId },
      { id: user.id, name: user.name, surname: user.surname, role: user.role },
    );

    const { rows: counts } = await sql.query<{
      matched: string;
      unmatched: string;
      conflicts: string;
    }>(
      `SELECT count(*) FILTER (WHERE match_status = 'matched')   AS matched,
              count(*) FILTER (WHERE match_status = 'unmatched') AS unmatched,
              count(*) FILTER (WHERE match_status = 'conflict')  AS conflicts
         FROM enrolments WHERE class_id = $1`,
      [classId],
    );

    await record(
      {
        actor: { id: user.id, name: user.name, surname: user.surname, role: user.role },
        eventType: "class.imported",
        objectDescription: `${klass.moduleCode} · ${klass.name}`,
        detail:
          `${mode === "replace" ? "Replaced" : "Added to"} the class list: ` +
          `${imported} new, ${updated} updated${removed ? `, ${removed} removed` : ""}` +
          `${errors.length ? `, ${errors.length} row(s) skipped` : ""}.` +
          (groupAssignments
            ? ` ${groupAssignments} CSV group assignment(s) saved; ${groupsCreated} group(s) created.`
            : ""),
        classId,
        ...(metadataBefore.length ? { before: { groupMetadata: metadataBefore } } : {}),
        after: {
          imported,
          updated,
          removed,
          skipped: errors.length,
          groupsCreated,
          ...(metadataAfter.length ? { groupMetadata: metadataAfter } : {}),
          groupAssignments: valid
            .filter((row) => row.groupNumber !== undefined)
            .map((row) => ({ studentNumber: row.studentNumber, groupNumber: row.groupNumber })),
        },
      },
      sql,
    );

    return {
      imported,
      updated,
      removed,
      groupsCreated,
      groupAssignments,
      matched: Number(counts[0]!.matched),
      unmatched: Number(counts[0]!.unmatched),
      conflicts: Number(counts[0]!.conflicts),
    };
  });
}
