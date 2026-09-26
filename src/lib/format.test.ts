import { describe, expect, it } from "vitest";

import { exportFilename } from "../../server/src/lib/export-format";
import { round } from "../../server/src/lib/felder";
import { exportFileName, formatMark, hasAtMostOneDecimal, roundMark } from "./format";

/**
 * Marks shown on screen follow the same rule as the marks the server records:
 * one decimal place, halves away from zero (scope.md AS-08, IS-06).
 */

describe("formatMark", () => {
  it("rounds an exact half up, where toFixed rounded it down", () => {
    // The 'Mean final mark' card: marks of 35.5 and 35.6 average to 35.55,
    // which binary floating point holds as 35.549999... and toFixed showed as 35.5.
    expect((35.55).toFixed(1)).toBe("35.5");
    expect(formatMark((35.5 + 35.6) / 2)).toBe("35.6");
    expect(formatMark(60.55)).toBe("60.6");
    expect(formatMark(1.05)).toBe("1.1");
  });

  it("shows a dash for a figure that does not exist, never 0.0", () => {
    expect(formatMark(null)).toBe("-");
    expect(formatMark(undefined)).toBe("-");
    expect(formatMark(0)).toBe("0.0");
  });

  it("agrees with the calculation's own rounding", () => {
    for (let tenths = 0; tenths <= 2000; tenths += 1) {
      const value = tenths / 20; // every .x5 midpoint between 0 and 100
      expect(roundMark(value)).toBe(round(value, 1));
    }
  });
});

describe("hasAtMostOneDecimal (IS-06)", () => {
  it("accepts whole numbers and one decimal place", () => {
    for (const value of [0, 74, 74.5, 60.3, 0.1, 100])
      expect(hasAtMostOneDecimal(value)).toBe(true);
  });

  it("refuses two or more decimal places", () => {
    for (const value of [70.25, 60.255, 99.999, 0.001, Number.NaN]) {
      expect(hasAtMostOneDecimal(value)).toBe(false);
    }
  });
});

describe("exportFileName", () => {
  it("names the file exactly as the server names the download", () => {
    const cases: Array<[string, string, string]> = [
      ["CMPG323", "Project Phase 1 - Peer Assessment", "2026-09-26T11:30:01.549Z"],
      ["QACY346", "QA cycle: project peer review!", "2026-09-26T23:59:59.000Z"],
      ["X1", "A".repeat(80), "2026-01-01T00:00:00.000Z"],
    ];
    for (const [code, name, iso] of cases) {
      expect(exportFileName(code, name, new Date(iso))).toBe(
        exportFilename(code, name, new Date(iso)),
      );
    }
    expect(
      exportFileName(
        "CMPG323",
        "Project Phase 1 - Peer Assessment",
        new Date("2026-09-26T11:30:01Z"),
      ),
    ).toBe("peerly-cmpg323-project-phase-1-peer-assessment-2026-09-26.xlsx");
  });
});
