import { describe, expect, it } from "vitest";

import { seededSubmittedAt } from "./seed-times.ts";

const now = new Date("2026-09-26T13:08:48Z");

describe("seededSubmittedAt", () => {
  it("puts a closed assessment's submissions inside its open window", () => {
    // Project Phase 1: opened 72 days before the seed, closed 61 days before.
    const window = { opensAt: "2026-07-16T20:00:00Z", closesAt: "2026-07-27T20:00:00Z" };
    for (let n = 0; n < 40; n += 1) {
      const at = new Date(seededSubmittedAt(window, n, now)).getTime();
      expect(at).toBeGreaterThan(new Date(window.opensAt).getTime());
      expect(at).toBeLessThan(new Date(window.closesAt).getTime());
    }
  });

  it("never stamps an open assessment's submission in the future", () => {
    const window = { opensAt: "2026-09-16T20:00:00Z", closesAt: "2026-10-07T20:00:00Z" };
    for (let n = 0; n < 40; n += 1) {
      const at = new Date(seededSubmittedAt(window, n, now)).getTime();
      expect(at).toBeGreaterThan(new Date(window.opensAt).getTime());
      expect(at).toBeLessThan(now.getTime());
    }
  });

  it("spreads submissions out, the same way on every run", () => {
    const window = { opensAt: "2026-07-16T20:00:00Z", closesAt: "2026-07-27T20:00:00Z" };
    const stamps = Array.from({ length: 28 }, (_, n) => seededSubmittedAt(window, n, now));
    expect(new Set(stamps).size).toBe(28);
    expect(seededSubmittedAt(window, 5, now)).toBe(stamps[5]);
  });

  it("refuses a window that has not opened yet", () => {
    const window = { opensAt: "2026-10-01T20:00:00Z", closesAt: "2026-10-07T20:00:00Z" };
    expect(() => seededSubmittedAt(window, 0, now)).toThrow();
  });
});
