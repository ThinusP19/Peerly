/**
 * The class-list import wizard's rules and wording, free of React so they can
 * be tested (FR-08, FR-09, UR-07).
 *
 * The server validates everything again; these exist so the lecturer is told
 * what is wrong on the step where it can be fixed.
 */

export type ImportFieldKey = "studentNumber" | "name" | "surname" | "email";

/** How each field is named on screen. The server's error rows use the keys. */
export const IMPORT_FIELD_LABELS: Record<ImportFieldKey, string> = {
  studentNumber: "Student number",
  name: "First name",
  surname: "Surname",
  email: "Institutional email",
};

/** The fields a row cannot do without. Email is optional - nothing reads it yet. */
export const REQUIRED_IMPORT_FIELDS: ImportFieldKey[] = ["studentNumber", "name", "surname"];

/** A field key from the server as the lecturer knows it, e.g. "surname" as "Surname". */
export const importFieldLabel = (field: string) =>
  IMPORT_FIELD_LABELS[field as ImportFieldKey] ?? field;

/**
 * Why the chosen columns can't be used yet, or null when they can.
 *
 * A required field left empty used to slip through - and so did two empty
 * fields, which the duplicate check read as the same column "" - and the
 * preview then showed "Every row passed validation" over a refused request.
 */
export function mappingProblem(mapping: Record<ImportFieldKey, string>): string | null {
  const missing = REQUIRED_IMPORT_FIELDS.filter((field) => !mapping[field]);
  if (missing.length) {
    const names = missing.map((field) => IMPORT_FIELD_LABELS[field].toLowerCase());
    const list =
      names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
    return `Choose the column that holds the ${list}.`;
  }

  const used = Object.values(mapping).filter(Boolean);
  const duplicated = used.find((header, index) => used.indexOf(header) !== index);
  if (duplicated) {
    return `"${duplicated}" is mapped to more than one field. Each column can only be used once.`;
  }
  return null;
}

/** The file's columns that no field uses, which the import will leave out. */
export const ignoredColumns = (headers: string[], mapping: Record<ImportFieldKey, string>) => {
  const used = new Set(Object.values(mapping).filter(Boolean));
  return headers.filter((header) => header && !used.has(header));
};

export interface ImportOutcome {
  imported: number;
  updated: number;
  matched: number;
  unmatched: number;
  conflicts: number;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * What the import did, in a sentence the lecturer can act on.
 *
 * It names the conflicts, because they are the rows that need the lecturer:
 * the old message counted matched and unmatched only, so a conflict imported
 * without a word.
 */
export function importResultMessage(result: ImportOutcome, moduleCode: string): string {
  const changed = [
    `${count(result.imported, "new student", "new students")} added`,
    ...(result.updated ? [`${result.updated} already on the list updated`] : []),
  ].join(", ");

  const standing = [
    `${result.matched} matched to an account`,
    `${result.unmatched} still unmatched`,
    ...(result.conflicts ? [`${count(result.conflicts, "conflict", "conflicts")} to resolve`] : []),
  ];
  const last = standing.pop();

  return (
    `${changed} to ${moduleCode}. ` +
    `The class list now has ${standing.join(", ")}${standing.length ? " and " : ""}${last}.`
  );
}

/**
 * Names for student ids, from the class list.
 *
 * The allocation preview needs a name for every student it places, and on a
 * class's first allocation none of them is in a group yet - so the group
 * roster, which lists only grouped students, left every row blank. The class
 * list holds every matched student. The account's own name comes first, since
 * that is who the student is in Peerly; the list's name covers the rest.
 */
export function studentNamesById(
  rows: Array<{
    userId?: string;
    importedName: string;
    importedSurname: string;
    account?: { name: string; surname: string };
  }>,
): Map<string, { name: string; surname: string }> {
  const names = new Map<string, { name: string; surname: string }>();
  for (const row of rows) {
    if (!row.userId) continue;
    names.set(row.userId, {
      name: row.account?.name ?? row.importedName,
      surname: row.account?.surname ?? row.importedSurname,
    });
  }
  return names;
}
