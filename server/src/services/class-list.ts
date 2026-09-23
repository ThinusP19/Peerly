import ExcelJS from "exceljs";

import { badRequest } from "../middleware/errors.ts";

/**
 * Reading an uploaded class list (SI-04, SI-10, SR-10, CI-03).
 *
 * SI-04 puts this on the server deliberately: parsing in the browser would mean
 * trusting whatever the browser said the file contained, and the rows end up
 * deciding who may evaluate whom.
 *
 * SR-10 shapes the rest. Three things matter and are handled here:
 *
 *   Formulas are never executed. A .xlsx cell can hold a formula and a cached
 *   result; we read the cached value and never evaluate. A file whose cells say
 *   `=cmd|...` is inert - it is text to us.
 *
 *   No external entities are resolved. exceljs does not fetch anything, and
 *   nothing here follows a link, an image reference or a remote sheet.
 *
 *   The file is not retained. It arrives in memory, is read once, and the
 *   buffer goes out of scope with the request. Nothing is written to disk, so
 *   there is no upload directory to leak or to clean up.
 */

/** CI-03, and the note printed on the upload control. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** PR-04 sizes this at 500 rows; the ceiling is well clear of a real class. */
const MAX_ROWS = 2000;

export interface ParsedSheet {
  /** The header row, trimmed, in the order the file had them. */
  headers: string[];
  /** Every data row, aligned to `headers`. */
  rows: string[][];
}

const isXlsx = (filename: string) => /\.xlsx$/i.test(filename);
const isCsv = (filename: string) => /\.csv$/i.test(filename);

/**
 * A cell's value as text, without evaluating anything.
 *
 * exceljs hands back an object for a formula cell: `{ formula, result }`. We
 * take the cached result and ignore the formula entirely - reading the formula
 * would be the beginning of executing it, and a class list has no business
 * containing one anyway.
 */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  if (typeof value === "object") {
    if ("result" in value) return cellText((value as { result: ExcelJS.CellValue }).result);
    if ("text" in value) return String((value as { text: unknown }).text).trim();
    // A rich-text cell is an array of runs; join their text.
    if ("richText" in value) {
      return (value as { richText: Array<{ text: string }> }).richText
        .map((run) => run.text)
        .join("")
        .trim();
    }
  }
  return "";
}

/**
 * Splits one CSV line, honouring quotes.
 *
 * Hand-written rather than pulled in: the format needed here is one line of
 * comma-separated fields with optional quoting and doubled quotes inside them,
 * and that is a dozen lines. A dependency would be more surface for less.
 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;

    if (quoted) {
      if (char === '"') {
        // A doubled quote inside a quoted field is a literal quote.
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  fields.push(current.trim());
  return fields;
}

function parseCsv(buffer: Buffer): ParsedSheet {
  // A byte-order mark would otherwise become part of the first header's name,
  // and the column mapping would silently fail to match it.
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r\n|\n|\r/).filter((line) => line.trim() !== "");

  if (lines.length === 0) throw badRequest("That file is empty.");
  if (lines.length - 1 > MAX_ROWS) {
    throw badRequest(`That file has more than ${MAX_ROWS} rows. Please split it.`);
  }

  const headers = splitCsvLine(lines[0]!);
  return { headers, rows: lines.slice(1).map(splitCsvLine) };
}

async function parseXlsx(buffer: Buffer): Promise<ParsedSheet> {
  const workbook = new ExcelJS.Workbook();
  // exceljs declares its own Buffer type, which Node's does not structurally
  // satisfy even though it is the same object at runtime.
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    // A renamed or damaged file is the uploader's to fix, not a server fault.
    throw badRequest(
      "That file couldn't be read as an Excel workbook. Save it again as .xlsx or .csv and retry.",
    );
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) throw badRequest("That workbook has no sheets.");
  if (sheet.rowCount - 1 > MAX_ROWS) {
    throw badRequest(`That file has more than ${MAX_ROWS} rows. Please split it.`);
  }

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell) => headers.push(cellText(cell.value)));

  // Trailing empty columns are an artefact of how the file was saved, not data.
  while (headers.length > 0 && headers.at(-1) === "") headers.pop();
  if (headers.length === 0) throw badRequest("That file has no column headings.");

  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = headers.map((_, index) => cellText(row.getCell(index + 1).value));
    if (values.some((value) => value !== "")) rows.push(values);
  });

  return { headers, rows };
}

export interface UploadedFile {
  originalname: string;
  size: number;
  buffer: Buffer;
}

/**
 * Reads an uploaded class list into headers and rows.
 *
 * SI-10: `.csv` and `.xlsx` only. `.xls` is refused by name with an explanation
 * rather than attempted, because the old binary format is a different parser
 * and a much larger attack surface for no benefit.
 */
export async function parseClassList(file: UploadedFile): Promise<ParsedSheet> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw badRequest("That file is larger than 5 MB. Please upload a smaller class list.");
  }
  if (file.size === 0) {
    throw badRequest("That file is empty.");
  }

  if (/\.xls$/i.test(file.originalname)) {
    throw badRequest(
      "Peerly can't read the older .xls format. Save the file as .xlsx or .csv and upload it again.",
    );
  }

  if (isCsv(file.originalname)) return parseCsv(file.buffer);
  if (isXlsx(file.originalname)) return parseXlsx(file.buffer);

  throw badRequest("Upload a .csv or .xlsx file.");
}
