import { describe, expect, it } from "vitest";

import { formatDateTimeSast } from "./sast";

describe("formatDateTimeSast", () => {
  it("shows a time after midnight SAST on the South African day, not the UTC one", () => {
    // What the audit log's day filter files it under (OR-11).
    expect(formatDateTimeSast("2026-09-25T23:30:00.000Z")).toBe("26 Sep 2026, 01:30");
  });

  it("keeps the same shape as the rest of the app's dates", () => {
    expect(formatDateTimeSast("2026-09-04T20:00:00.000Z")).toBe("4 Sep 2026, 22:00");
  });

  it("uses a 24-hour clock with midnight as 00", () => {
    expect(formatDateTimeSast("2026-09-26T22:00:00.000Z")).toBe("27 Sep 2026, 00:00");
  });
});
