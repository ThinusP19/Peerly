import ExcelJS from "exceljs";

import { query } from "../db/pool.ts";
import type { SessionUser } from "../domain/types.ts";
import { exportFilename, flagLabels } from "../lib/export-format.ts";
import { conflict } from "../middleware/errors.ts";
import { getAssessment } from "./assessments.ts";
import { getClass } from "./classes.ts";
import { getResults } from "./results.ts";

/**
 * The results workbook (FR-25, CI-04, OR-09).
 *
 * Built on the server and handed back as a binary attachment. Two reasons, both
 * from the specification: CI-04 says the workbook goes to the responsible
 * lecturer only, which means the authorisation has to happen where the data is;
 * and a browser-built file would need every rating and every hidden scale value
 * sent to the browser first, which SR-08 forbids for students and OR-16 limits
 * for everyone else.
 *
 * Two worksheets, as the export screen describes them: the marks to upload, and
 * the ratings they came from. The second is what makes FR-25 more than a
 * convenience - it is the evidence behind every adjustment, and the reason a
 * mark can still be defended months later.
 */

export interface Workbook {
  filename: string;
  buffer: Buffer;
  contentType: string;
}

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Builds the workbook.
 *
 * Refuses before a calculation has run: a results export with no results is a
 * file that looks authoritative and says nothing, and somebody would file it.
 */
export async function buildResultsWorkbook(
  assessmentId: string,
  user: SessionUser,
): Promise<Workbook> {
  const assessment = await getAssessment(assessmentId, user);
  const klass = await getClass(assessment.classId, user);

  if (!assessment.calculatedAt) {
    throw conflict("Calculate the marks before exporting, so there is something to export.");
  }

  const results = await getResults(assessmentId, user);
  const generatedAt = new Date();

  const { rows: ratings } = await query<{
    group_number: number;
    evaluator_name: string;
    evaluator_surname: string;
    evaluator_number: string | null;
    evaluated_name: string;
    evaluated_surname: string;
    evaluated_number: string | null;
    label: string;
    hidden_value: string;
    comment: string | null;
    submitted_at: Date | null;
  }>(
    `SELECT g.group_number,
            ev.name AS evaluator_name, ev.surname AS evaluator_surname,
            ev.student_number AS evaluator_number,
            ed.name AS evaluated_name, ed.surname AS evaluated_surname,
            ed.student_number AS evaluated_number,
            o.label, o.hidden_value, r.comment, s.submitted_at
       FROM peer_ratings r
       JOIN users ev ON ev.id = r.evaluator_id
       JOIN users ed ON ed.id = r.evaluated_id
       JOIN rating_options o ON o.id = r.rating_option_id
       JOIN groups g ON g.id = r.group_id
       JOIN submissions s ON s.id = r.submission_id
      -- The evidence behind the marks, so only what the calculation used: a
      -- draft is not a submission (FR-16, FR-22).
      WHERE r.assessment_id = $1 AND s.status = 'submitted'
      ORDER BY g.group_number, ev.surname, ev.name, ed.surname, ed.name`,
    [assessmentId],
  );

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Peerly";
  workbook.created = generatedAt;

  /* ---------------------------- Worksheet 1 ---------------------------- */
  const sheet = workbook.addWorksheet("Results");

  // OR-09: the header is what ties this file to one specific calculation. A
  // workbook that cannot be traced back to a run is not evidence of anything.
  const header: Array<[string, string | number]> = [
    ["Class", `${klass.moduleCode} - ${klass.name}`],
    ["Academic period", klass.academicPeriod],
    ["Assessment", assessment.name],
    ["Generated", generatedAt.toISOString()],
    ["Calculation run id", assessment.calculationRunId ?? "not calculated"],
    ["Calculated at", assessment.calculatedAt],
    ["Overrides included", results.filter((r) => r.override).length],
    ["Flagged students", results.filter((r) => r.flags.length > 0).length],
  ];
  for (const [label, value] of header) {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  }
  sheet.addRow([]);

  const columns = [
    "Student number",
    "Surname",
    "Name",
    "Group",
    "Ratings received",
    "Mean received",
    "Group mean",
    "Adjustment factor",
    "Group base mark",
    "Final mark",
    "Override mark",
    "Override reason",
    "Overridden by",
    "Flags",
  ];
  const headerRow = sheet.addRow(columns);
  headerRow.font = { bold: true };
  // Freezes the header block and the column titles, so a 500-row sheet stays
  // readable when scrolled.
  sheet.views = [{ state: "frozen", ySplit: headerRow.number }];

  for (const result of results) {
    sheet.addRow([
      result.student.studentNumber ?? "",
      result.student.surname,
      result.student.name,
      result.groupNumber,
      result.ratingsReceived,
      result.meanReceived,
      result.groupMean,
      result.adjustmentFactor,
      result.baseMark,
      result.finalMark,
      result.override?.mark ?? "",
      result.override?.reason ?? "",
      result.override?.by ?? "",
      // The labels the results screen shows, not the internal codes.
      flagLabels(result.flags),
    ]);
  }

  sheet.columns.forEach((column, index) => {
    column.width = index <= 2 ? 18 : index === 11 ? 40 : 16;
  });

  /* ---------------------------- Worksheet 2 ---------------------------- */
  const raw = workbook.addWorksheet("Raw Ratings");
  const rawHeader = raw.addRow([
    "Group",
    "Evaluator number",
    "Evaluator",
    "Evaluated number",
    "Evaluated",
    "Rating",
    "Scale value",
    "Comment",
    "Submitted at",
  ]);
  rawHeader.font = { bold: true };
  raw.views = [{ state: "frozen", ySplit: 1 }];

  for (const rating of ratings) {
    raw.addRow([
      rating.group_number,
      rating.evaluator_number ?? "",
      `${rating.evaluator_surname}, ${rating.evaluator_name}`,
      rating.evaluated_number ?? "",
      `${rating.evaluated_surname}, ${rating.evaluated_name}`,
      rating.label,
      Number(rating.hidden_value),
      rating.comment ?? "",
      rating.submitted_at?.toISOString() ?? "",
    ]);
  }

  raw.columns.forEach((column, index) => {
    column.width = index === 7 ? 50 : index === 2 || index === 4 ? 24 : 16;
  });

  return {
    filename: exportFilename(klass.moduleCode, assessment.name, generatedAt),
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    contentType: XLSX_TYPE,
  };
}
