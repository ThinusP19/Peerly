import type { ResultFlag } from "./felder.ts";

/**
 * How the results workbook names things (FR-25).
 *
 * Pure, so the lecturer screens can be checked against it: the export page
 * names the file before it is downloaded, and the workbook's Flags column has
 * to say what the results table says. src/lib/domain.test.ts holds both to it.
 */

/**
 * The plain-language label for every flag, as the results screen shows it
 * (src/lib/domain.ts, resultFlagMeta). The workbook is read by lecturers and
 * moderators, not by the code, so it carries these rather than the codes.
 */
export const FLAG_LABELS: Record<ResultFlag, string> = {
  "uniform-rating": "Uniform rating",
  "reciprocal-extreme": "Reciprocal extremes",
  "isolated-outlier": "Isolated outlier",
  "incomplete-group": "Incomplete group",
  "low-contribution": "Low contribution",
  "no-submission": "Did not submit",
  "group-of-two": "Group of two",
  "group-of-one": "Group of one",
  unmatched: "Unmatched",
  "not-peer-assessed": "Not peer assessed",
  "zero-base-mark": "Group mark of zero",
  "zero-group-mean": "Whole group rated lowest",
  "capped-at-maximum": "Capped at the maximum",
};

/** "Isolated outlier, Low contribution" - in the order the flags are stored. */
export const flagLabels = (flags: readonly ResultFlag[]) =>
  flags.map((flag) => FLAG_LABELS[flag] ?? flag).join(", ");

/**
 * A filename that sorts sensibly and survives every filesystem:
 * peerly-<module code>-<assessment slug>-<YYYY-MM-DD>.xlsx, dated in UTC.
 */
export function exportFilename(moduleCode: string, assessmentName: string, when: Date): string {
  const slug = assessmentName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `peerly-${moduleCode.toLowerCase()}-${slug}-${when.toISOString().slice(0, 10)}.xlsx`;
}
