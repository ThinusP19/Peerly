import ExcelJS from "exceljs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closePool, query } from "../db/pool.ts";
import type { SessionUser } from "../domain/types.ts";
import { createUser, resetDatabase } from "../test/helpers.ts";
import { closedAssessment as scenario } from "../test/scenarios.ts";
import { buildResultsWorkbook } from "./export.ts";
import { runCalculation, overrideMark } from "./results.ts";

/** FR-25, CI-04, OR-09. */

beforeEach(resetDatabase);
afterAll(closePool);

const read = async (buffer: Buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return workbook;
};

describe("buildResultsWorkbook", () => {
  it("refuses before a calculation has run", async () => {
    const { user, assessmentId } = await scenario();

    await expect(buildResultsWorkbook(assessmentId, user)).rejects.toThrow(/Calculate the marks/);
  });

  it("produces a real .xlsx with both worksheets", async () => {
    const { user, assessmentId } = await scenario();
    await runCalculation(assessmentId, user);

    const file = await buildResultsWorkbook(assessmentId, user);
    const workbook = await read(file.buffer);

    expect(file.contentType).toContain("spreadsheetml");
    expect(workbook.worksheets.map((w) => w.name)).toEqual(["Results", "Raw Ratings"]);
  });

  it("names the file after the module, the assessment and the date", async () => {
    const { user, assessmentId } = await scenario();
    await runCalculation(assessmentId, user);

    const file = await buildResultsWorkbook(assessmentId, user);
    expect(file.filename).toMatch(/^peerly-cmpg323-project-phase-2-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it("carries the header that ties it to one calculation run (OR-09)", async () => {
    const { user, assessmentId } = await scenario();
    const run = await runCalculation(assessmentId, user);

    const workbook = await read((await buildResultsWorkbook(assessmentId, user)).buffer);
    const sheet = workbook.getWorksheet("Results")!;

    const labels: string[] = [];
    const values: string[] = [];
    for (let i = 1; i <= 8; i += 1) {
      labels.push(String(sheet.getRow(i).getCell(1).value ?? ""));
      values.push(String(sheet.getRow(i).getCell(2).value ?? ""));
    }
    expect(labels).toContain("Calculation run id");
    expect(values).toContain(run.runId);
    expect(values.some((v) => v.includes("CMPG323"))).toBe(true);
  });

  it("writes one results row per student, with the figures behind the mark", async () => {
    const { user, assessmentId } = await scenario();
    await runCalculation(assessmentId, user);

    const workbook = await read((await buildResultsWorkbook(assessmentId, user)).buffer);
    const sheet = workbook.getWorksheet("Results")!;

    // 8 header lines, a blank, then the column titles.
    const titles = sheet.getRow(10).values as unknown[];
    expect(titles).toContain("Adjustment factor");
    expect(titles).toContain("Final mark");

    const first = sheet.getRow(11).values as unknown[];
    expect(first[1]).toBe("41200345");
    // Everyone rated everyone alike, so the factor is 1 and the mark is the base.
    expect(first[8]).toBe(1);
    expect(first[10]).toBe(70);
  });

  it("includes an override with its reason and author (FR-24)", async () => {
    const { user, assessmentId, students } = await scenario();
    await runCalculation(assessmentId, user);
    await overrideMark(assessmentId, students[0]!, 85, "Medical certificate accepted.", user);

    const workbook = await read((await buildResultsWorkbook(assessmentId, user)).buffer);
    const sheet = workbook.getWorksheet("Results")!;

    const row = [11, 12, 13]
      .map((n) => sheet.getRow(n).values as unknown[])
      .find((values) => values[11] === 85);
    expect(row?.[12]).toBe("Medical certificate accepted.");
    expect(row?.[13]).toContain("Anneke");
  });

  it("writes every rating to the raw sheet - the evidence behind each mark", async () => {
    const { user, assessmentId } = await scenario();
    await runCalculation(assessmentId, user);

    const workbook = await read((await buildResultsWorkbook(assessmentId, user)).buffer);
    const raw = workbook.getWorksheet("Raw Ratings")!;

    // 3 students each rating the other 2, plus the header row.
    expect(raw.rowCount).toBe(7);
    const first = raw.getRow(2).values as unknown[];
    expect(first).toContain("Very good");
    expect(first).toContain("Pulled their weight.");
  });

  it("refuses another lecturer's assessment (CI-04)", async () => {
    const { assessmentId } = await scenario();
    const other = await createUser({ role: "lecturer" });
    const intruder: SessionUser = {
      id: other.id,
      role: "lecturer",
      name: "X",
      surname: "Y",
      email: other.email,
      studentNumber: null,
      status: "active",
      createdAt: new Date().toISOString(),
    };

    await expect(buildResultsWorkbook(assessmentId, intruder)).rejects.toMatchObject({
      status: 404,
    });
  });
});
