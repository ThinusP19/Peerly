import ExcelJS from "exceljs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closePool, query } from "../db/pool.ts";
import type { SessionUser } from "../domain/types.ts";
import { createUser, resetDatabase } from "../test/helpers.ts";
import { getAuditEntries } from "./audit.ts";
import { parseClassList } from "./class-list.ts";
import { commitImport, previewImport, suggestMapping, validateRows } from "./import.ts";

/** FR-08, FR-09, FR-04, SI-04, SI-10, SR-10. */

beforeEach(resetDatabase);
afterAll(closePool);

const upload = (name: string, contents: string | Buffer) => ({
  originalname: name,
  size: Buffer.byteLength(contents as string),
  buffer: Buffer.isBuffer(contents) ? contents : Buffer.from(contents),
});

const MAPPING = { studentNumber: "Student Number", name: "Name", surname: "Surname" };

const CSV = `Student Number,Name,Surname,Email
41200345,Lerato,Mokoena,41200345@mynwu.ac.za
41200382,Thandi,Nkosi,41200382@mynwu.ac.za
41200419,Johan,Pretorius,41200419@mynwu.ac.za`;

async function lecturerWithClass() {
  const account = await createUser({ role: "lecturer", name: "Anneke", surname: "vd Merwe" });
  const user: SessionUser = {
    id: account.id,
    role: "lecturer",
    name: "Anneke",
    surname: "vd Merwe",
    email: account.email,
    studentNumber: null,
    status: "active",
    createdAt: new Date().toISOString(),
  };
  const { rows } = await query<{ id: string }>(
    `INSERT INTO classes (module_code, name, academic_period, lecturer_id)
     VALUES ('CMPG323', 'Test', '2026 S2', $1) RETURNING id`,
    [account.id],
  );
  return { user, classId: rows[0]!.id };
}

describe("parseClassList (SI-10, SR-10)", () => {
  it("reads a CSV with its headers", async () => {
    const sheet = await parseClassList(upload("class.csv", CSV));
    expect(sheet.headers).toEqual(["Student Number", "Name", "Surname", "Email"]);
    expect(sheet.rows).toHaveLength(3);
  });

  it("handles quoted fields containing commas", async () => {
    const sheet = await parseClassList(
      upload("class.csv", 'Student Number,Surname\n41200345,"van der Merwe, A"'),
    );
    expect(sheet.rows[0]).toEqual(["41200345", "van der Merwe, A"]);
  });

  it("strips a byte-order mark, which would otherwise corrupt the first header", async () => {
    const sheet = await parseClassList(upload("class.csv", "﻿Student Number,Name\n41200345,A"));
    expect(sheet.headers[0]).toBe("Student Number");
  });

  it("refuses the old .xls format by name rather than attempting it", async () => {
    await expect(parseClassList(upload("class.xls", CSV))).rejects.toThrow(/\.xlsx or \.csv/);
  });

  it("refuses an unsupported extension", async () => {
    await expect(parseClassList(upload("class.pdf", CSV))).rejects.toThrow(/\.csv or \.xlsx/);
  });

  it("refuses a file over 5 MB before reading it (CI-03)", async () => {
    await expect(
      parseClassList({ originalname: "big.csv", size: 6 * 1024 * 1024, buffer: Buffer.from("x") }),
    ).rejects.toThrow(/larger than 5 MB/);
  });

  it("refuses an empty file", async () => {
    await expect(parseClassList(upload("class.csv", ""))).rejects.toThrow(/empty/);
  });

  it("reads an .xlsx workbook", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Class");
    sheet.addRow(["Student Number", "Name", "Surname"]);
    sheet.addRow(["41200345", "Lerato", "Mokoena"]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const parsed = await parseClassList(upload("class.xlsx", buffer));
    expect(parsed.headers).toEqual(["Student Number", "Name", "Surname"]);
    expect(parsed.rows[0]).toEqual(["41200345", "Lerato", "Mokoena"]);
  });

  it("takes a formula cell's cached value and never evaluates it (SR-10)", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Class");
    sheet.addRow(["Student Number", "Name", "Surname"]);
    const row = sheet.addRow(["41200345", "Lerato", "Mokoena"]);
    // A formula with a cached result, which is how a spreadsheet stores one.
    row.getCell(2).value = { formula: 'HYPERLINK("http://evil","Lerato")', result: "Lerato" };
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const parsed = await parseClassList(upload("class.xlsx", buffer));
    expect(parsed.rows[0]![1]).toBe("Lerato");
    expect(JSON.stringify(parsed)).not.toContain("evil");
  });
});

describe("suggestMapping", () => {
  it("recognises common headings", () => {
    expect(suggestMapping(["Student Number", "Name", "Surname", "Email"])).toEqual({
      studentNumber: "Student Number",
      name: "Name",
      surname: "Surname",
      email: "Email",
    });
  });

  it("suggests nothing it cannot recognise, rather than guessing", () => {
    expect(suggestMapping(["A", "B", "C"])).toEqual({});
  });
});

describe("validateRows (FR-09)", () => {
  const sheet = (rows: string[][]) => ({
    headers: ["Student Number", "Name", "Surname"],
    rows,
  });

  it("accepts a good row", () => {
    const { valid, errors } = validateRows(sheet([["41200345", "Lerato", "Mokoena"]]), MAPPING);
    expect(errors).toHaveLength(0);
    expect(valid[0]).toMatchObject({ studentNumber: "41200345", row: 2 });
  });

  it("numbers rows as the file shows them, counting the header", () => {
    const { errors } = validateRows(
      sheet([
        ["41200345", "A", "B"],
        ["bad", "C", "D"],
      ]),
      MAPPING,
    );
    expect(errors[0]!.row).toBe(3);
  });

  it("rejects a student number that is not 8 digits", () => {
    const { errors } = validateRows(sheet([["412", "Lerato", "Mokoena"]]), MAPPING);
    expect(errors[0]).toMatchObject({ field: "studentNumber" });
    expect(errors[0]!.message).toContain("8-digit");
  });

  it("rejects a duplicate, naming the row it first appeared on (FR-08)", () => {
    const { valid, errors } = validateRows(
      sheet([
        ["41200345", "A", "B"],
        ["41200345", "C", "D"],
      ]),
      MAPPING,
    );
    expect(valid).toHaveLength(1);
    expect(errors[0]!.message).toContain("row 2");
  });

  it("rejects a missing name and a missing surname separately", () => {
    const { errors } = validateRows(
      sheet([
        ["41200345", "", "Mokoena"],
        ["41200382", "Thandi", ""],
      ]),
      MAPPING,
    );
    expect(errors.map((e) => e.field)).toEqual(["name", "surname"]);
  });

  it("refuses a mapping naming a column the file does not have", () => {
    expect(() => validateRows(sheet([]), { ...MAPPING, name: "Nope" })).toThrow(/no column called/);
  });
});

describe("commitImport (FR-04, FR-08)", () => {
  const sheetFor = (csv: string) => parseClassList(upload("class.csv", csv));

  it("imports valid rows and matches them to accounts that exist (FR-04)", async () => {
    const { user, classId } = await lecturerWithClass();
    await createUser({ studentNumber: "41200345", name: "Lerato", surname: "Mokoena" });

    const result = await commitImport(classId, await sheetFor(CSV), MAPPING, "extend", user);
    expect(result).toMatchObject({ imported: 3, matched: 1, unmatched: 2 });
  });

  it("leaves a row unmatched when no account holds that number", async () => {
    const { user, classId } = await lecturerWithClass();
    await commitImport(classId, await sheetFor(CSV), MAPPING, "extend", user);

    const { rows } = await query<{ match_status: string; match_note: string | null }>(
      "SELECT match_status, match_note FROM enrolments WHERE student_number = '41200345'",
    );
    expect(rows[0]!.match_status).toBe("unmatched");
    expect(rows[0]!.match_note).toContain("No registered Peerly account");
  });

  it("updates an existing row rather than duplicating it", async () => {
    const { user, classId } = await lecturerWithClass();
    await commitImport(classId, await sheetFor(CSV), MAPPING, "extend", user);

    const changed = CSV.replace("Lerato,Mokoena", "Lerato,Mokoena-Smith");
    const result = await commitImport(classId, await sheetFor(changed), MAPPING, "extend", user);

    expect(result).toMatchObject({ imported: 0, updated: 3 });
    const { rows } = await query("SELECT 1 FROM enrolments");
    expect(rows).toHaveLength(3);
  });

  it("removes rows the new file omits, in replace mode", async () => {
    const { user, classId } = await lecturerWithClass();
    await commitImport(classId, await sheetFor(CSV), MAPPING, "extend", user);

    const shorter = CSV.split("\n").slice(0, 3).join("\n");
    const result = await commitImport(classId, await sheetFor(shorter), MAPPING, "replace", user);

    expect(result.removed).toBe(1);
  });

  it("refuses to replace a list once groups exist", async () => {
    const { user, classId } = await lecturerWithClass();
    await commitImport(classId, await sheetFor(CSV), MAPPING, "extend", user);
    await query("INSERT INTO groups (class_id, group_number) VALUES ($1, 1)", [classId]);

    await expect(
      commitImport(classId, await sheetFor(CSV), MAPPING, "replace", user),
    ).rejects.toThrow(/already has groups/);
  });

  it("skips broken rows and imports the rest", async () => {
    const { user, classId } = await lecturerWithClass();
    const mixed = `${CSV}\nnot-a-number,Bad,Row`;

    const result = await commitImport(classId, await sheetFor(mixed), MAPPING, "extend", user);
    expect(result.imported).toBe(3);
  });

  it("refuses a file with nothing usable in it", async () => {
    const { user, classId } = await lecturerWithClass();
    const broken = "Student Number,Name,Surname\nbad,A,B";

    await expect(
      commitImport(classId, await sheetFor(broken), MAPPING, "extend", user),
    ).rejects.toThrow(/no valid rows/);
  });

  it("refuses another lecturer's class", async () => {
    const { classId } = await lecturerWithClass();
    const account = await createUser({ role: "lecturer" });
    const intruder: SessionUser = {
      id: account.id,
      role: "lecturer",
      name: "X",
      surname: "Y",
      email: account.email,
      studentNumber: null,
      status: "active",
      createdAt: new Date().toISOString(),
    };

    await expect(
      commitImport(classId, await sheetFor(CSV), MAPPING, "extend", intruder),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("records the import on the audit trail (FR-27)", async () => {
    const { user, classId } = await lecturerWithClass();
    await commitImport(classId, await sheetFor(CSV), MAPPING, "extend", user);

    const [entry] = await getAuditEntries();
    expect(entry!.eventType).toBe("class.imported");
    expect(entry!.detail).toContain("3 new");
  });

  it("refuses an empty sheet before opening a transaction", async () => {
    // Named for what it actually checks: validation refuses first, so the
    // rollback path is never reached. The OR-05 rollback itself is covered in
    // assessment-writes.test.ts, where a failure can be forced mid-transaction.
    const { user, classId } = await lecturerWithClass();

    await expect(
      commitImport(
        classId,
        { headers: ["Student Number", "Name", "Surname"], rows: [] },
        MAPPING,
        "extend",
        user,
      ),
    ).rejects.toThrow(/no valid rows/);

    const { rows } = await query("SELECT 1 FROM enrolments");
    expect(rows).toHaveLength(0);
  });
});

describe("previewImport (FR-09)", () => {
  it("reports valid rows, errors and how many already exist", async () => {
    const { user, classId } = await lecturerWithClass();
    const sheet = await parseClassList(upload("class.csv", `${CSV}\nbad,X,Y`));
    await commitImport(
      classId,
      await parseClassList(upload("c.csv", CSV)),
      MAPPING,
      "extend",
      user,
    );

    const preview = await previewImport(classId, sheet, MAPPING, user);
    expect(preview.valid).toHaveLength(3);
    expect(preview.errors).toHaveLength(1);
    expect(preview.duplicatesInFile).toBe(3);
    expect(preview.totalRows).toBe(4);
  });

  it("changes nothing", async () => {
    const { user, classId } = await lecturerWithClass();
    await previewImport(classId, await parseClassList(upload("c.csv", CSV)), MAPPING, user);

    const { rows } = await query("SELECT 1 FROM enrolments");
    expect(rows).toHaveLength(0);
  });
});
