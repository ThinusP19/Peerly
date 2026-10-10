import { query, withTransaction } from "../db/pool.ts";
import type { SessionUser } from "../domain/types.ts";
import { ONE_DECIMAL_MESSAGE, hasAtMostOneDecimal } from "../lib/marks.ts";
import { badRequest } from "../middleware/errors.ts";
import { getAssessment } from "./assessments.ts";
import { record } from "./audit.ts";
import { parseClassList, type UploadedFile } from "./class-list.ts";

/**
 * Entering every group's base mark from one file (FR-21), on client feedback
 * 2026-10-10.
 *
 * The file is read on the server, by the same parser as the class list - so
 * the same SR-10 rules hold: formulas are never executed and the file is never
 * kept. Each row names a group, by number or by name, and gives its mark.
 *
 * Two passes over the same code. The preview says what every row would do,
 * and refuses nothing; the commit refuses the whole file if any row is wrong,
 * so a file is never half-applied. Every mark it writes goes through the same
 * rules as typing it in (one decimal, 0 to the maximum, enforced again by the
 * database in 0005) and is audited one group at a time, as typing it would be
 * (FR-27).
 */

export type MarkImportStatus = "new" | "changed" | "unchanged" | "skipped" | "error";

export interface MarkImportRow {
  /** The row as a spreadsheet program numbers it. */
  row: number;
  /** The group as the file wrote it. */
  group: string;
  groupId?: string;
  groupNumber?: number;
  groupName?: string;
  /** The mark as the file wrote it. */
  raw: string;
  mark?: number;
  /** What is stored now, so the preview can show the change. */
  current?: number | null;
  status: MarkImportStatus;
  error?: string;
}

export interface MarkImportPreview {
  columns: { group: string; mark: string };
  rows: MarkImportRow[];
  /** Participating groups the file says nothing about. Left as they are. */
  notInFile: Array<{ groupNumber: number; groupName?: string }>;
}

export interface MarkImportResult {
  changed: number;
  invalidatedCalculation: boolean;
}

const MARK_HEADER = /mark|score|result|punt/i;
const GROUP_NUMBER_HEADER = /group\s*(number|no\.?|nr\.?|num|#)|^\s*group\s*$|^\s*groep\s*$/i;
const GROUP_NAME_HEADER = /group\s*name|team|^\s*name\s*$/i;

/** Finds the two columns, or says plainly which one is missing. */
function columnsOf(headers: string[]) {
  const mark = headers.findIndex((header) => MARK_HEADER.test(header));
  let group = headers.findIndex((header) => GROUP_NUMBER_HEADER.test(header));
  if (group === -1) group = headers.findIndex((header) => GROUP_NAME_HEADER.test(header));
  // "Group mark" would match both; it is the mark.
  if (group === mark) group = headers.findIndex((h, i) => i !== mark && /group|team/i.test(h));

  if (group === -1 || mark === -1) {
    throw badRequest(
      "We couldn't find " +
        (group === -1 && mark === -1
          ? "a group column or a mark column"
          : group === -1
            ? "a group column"
            : "a mark column") +
        '. Give the file a heading row with one column named "Group" (the group number or name) and one named "Mark".',
    );
  }
  return { group, mark };
}

/** "74", "74.5", and "74,5" as a South African spreadsheet writes it. */
function parseMark(raw: string): number | null {
  const cleaned = raw
    .trim()
    .replace(/\s+/g, "")
    .replace(/^(\d+),(\d+)$/, "$1.$2");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

export async function previewMarkImport(
  assessmentId: string,
  file: UploadedFile,
  user: SessionUser,
): Promise<MarkImportPreview> {
  const assessment = await getAssessment(assessmentId, user);
  const sheet = await parseClassList(file);
  const columns = columnsOf(sheet.headers);

  const { rows: groups } = await query<{
    id: string;
    group_number: number;
    group_name: string | null;
    base_mark: string | null;
  }>(
    `SELECT g.id, g.group_number, g.group_name, m.base_mark
       FROM assessment_groups ag
       JOIN groups g ON g.id = ag.group_id
       LEFT JOIN group_marks m ON m.assessment_id = ag.assessment_id AND m.group_id = g.id
      WHERE ag.assessment_id = $1
      ORDER BY g.group_number`,
    [assessmentId],
  );
  // Other groups in the class, so a row naming one can say why it is refused
  // rather than claiming the group does not exist.
  const { rows: classGroups } = await query<{ group_number: number; group_name: string | null }>(
    "SELECT group_number, group_name FROM groups WHERE class_id = $1",
    [assessment.classId],
  );

  const seen = new Set<string>();
  const rows: MarkImportRow[] = sheet.rows.map((cells, index) => {
    const row = sheet.rowNumbers?.[index] ?? index + 2;
    const written = (cells[columns.group] ?? "").trim();
    const raw = (cells[columns.mark] ?? "").trim();
    const base = { row, group: written, raw };

    if (!written) return { ...base, status: "error", error: "This row doesn't name a group." };

    // "3" or "Group 3" is a number; anything else is a name.
    const number = /^(?:group\s*)?(\d+)$/i.exec(written)?.[1];
    const matches = number
      ? groups.filter((g) => g.group_number === Number(number))
      : groups.filter((g) => g.group_name?.toLowerCase() === written.toLowerCase());
    const group = matches[0];

    if (!group || matches.length > 1) {
      const inClass = number
        ? classGroups.some((g) => g.group_number === Number(number))
        : classGroups.some((g) => g.group_name?.toLowerCase() === written.toLowerCase());
      return {
        ...base,
        status: "error",
        error:
          matches.length > 1
            ? "More than one group has this name. Use the group number instead."
            : inClass
              ? "This group doesn't take part in this assessment."
              : "There's no group with this number or name in the class.",
      };
    }

    const found = {
      ...base,
      groupId: group.id,
      groupNumber: group.group_number,
      ...(group.group_name !== null ? { groupName: group.group_name } : {}),
      current: group.base_mark === null ? null : Number(group.base_mark),
    };

    if (seen.has(group.id)) {
      return {
        ...found,
        status: "error",
        error: "This group already has a mark higher up in the file.",
      };
    }
    seen.add(group.id);

    // A blank mark leaves the group as it is, so a file can cover some groups.
    if (!raw) return { ...found, status: "skipped" };

    const mark = parseMark(raw);
    if (mark === null) {
      return {
        ...found,
        status: "error",
        error: "Enter the mark as a number, for example 74 or 74.5.",
      };
    }
    if (mark < 0 || mark > assessment.maxMark) {
      return {
        ...found,
        mark,
        status: "error",
        error: `This assessment is out of ${assessment.maxMark}, so the mark has to be between 0 and ${assessment.maxMark}.`,
      };
    }
    if (!hasAtMostOneDecimal(mark)) {
      return { ...found, mark, status: "error", error: ONE_DECIMAL_MESSAGE };
    }

    return {
      ...found,
      mark,
      status: found.current === null ? "new" : found.current === mark ? "unchanged" : "changed",
    };
  });

  if (rows.length === 0) throw badRequest("That file has a heading row but no marks under it.");

  return {
    columns: { group: sheet.headers[columns.group]!, mark: sheet.headers[columns.mark]! },
    rows,
    notInFile: groups
      .filter((group) => !seen.has(group.id))
      .map((group) => ({
        groupNumber: group.group_number,
        ...(group.group_name !== null ? { groupName: group.group_name } : {}),
      })),
  };
}

/** Applies the file, all or nothing. */
export async function commitMarkImport(
  assessmentId: string,
  file: UploadedFile,
  user: SessionUser,
): Promise<MarkImportResult> {
  const assessment = await getAssessment(assessmentId, user);
  const preview = await previewMarkImport(assessmentId, file, user);

  const errors = preview.rows.filter((row) => row.status === "error");
  if (errors.length > 0) {
    throw badRequest(
      `${errors.length} row(s) in the file have a problem, so no marks were saved. ` +
        "Fix them and upload the file again.",
    );
  }

  const writes = preview.rows.filter((row) => row.status === "new" || row.status === "changed");
  if (writes.length === 0) return { changed: 0, invalidatedCalculation: false };

  const invalidatedCalculation = Boolean(assessment.calculatedAt);

  await withTransaction(async (sql) => {
    for (const row of writes) {
      await sql.query(
        `INSERT INTO group_marks (assessment_id, group_id, base_mark, entered_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (assessment_id, group_id) DO UPDATE
            SET base_mark = EXCLUDED.base_mark,
                entered_by = EXCLUDED.entered_by,
                updated_at = now()`,
        [assessmentId, row.groupId, row.mark, user.id],
      );

      await record(
        {
          actor: { id: user.id, name: user.name, surname: user.surname, role: user.role },
          eventType: "marks.entered",
          objectDescription: `${assessment.name} · Group ${row.groupNumber}`,
          detail:
            `Group mark set to ${row.mark} out of ${assessment.maxMark}, uploaded from ${file.originalname}.` +
            (invalidatedCalculation
              ? " The calculated marks are out of date until they are calculated again."
              : ""),
          classId: assessment.classId,
          assessmentId,
          before: { baseMark: row.current ?? null },
          after: { baseMark: row.mark },
        },
        sql,
      );
    }

    if (invalidatedCalculation) {
      await sql.query(
        "UPDATE assessments SET calculated_at = NULL, calculation_run_id = NULL WHERE id = $1",
        [assessmentId],
      );
    }
  });

  return { changed: writes.length, invalidatedCalculation };
}
