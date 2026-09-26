import { describe, expect, it } from "vitest";

import { ApiError } from "./api";
import {
  assessmentChanges,
  closedAtOf,
  fromLocalInput,
  maxMarkProblem,
  serverFieldErrors,
  toLocalInput,
} from "./assessment-form";
import type { Assessment } from "@/mocks/types";

const assessment: Assessment = {
  id: "a1",
  classId: "c1",
  name: "Phase 2",
  description: "Rate your group",
  groupIds: ["g1", "g2", "g3"],
  status: "open",
  opensAt: "2026-09-26T10:13:19.936Z",
  closesAt: "2026-10-10T20:00:00.000Z",
  maxMark: 100,
};

const unchanged = () => ({
  name: assessment.name,
  description: assessment.description,
  groupIds: [...assessment.groupIds],
  opensAt: assessment.opensAt,
  closesAt: assessment.closesAt,
  maxMark: assessment.maxMark,
});

describe("assessmentChanges", () => {
  it("sends only the name when only the name changed - never the groups", () => {
    // The whole setup used to go back, groups included, and the server refuses
    // any groups once an assessment has opened: nothing could be saved.
    expect(assessmentChanges(assessment, { ...unchanged(), name: "Phase 2 - final" })).toEqual({
      name: "Phase 2 - final",
    });
  });

  it("treats the same groups in another order as unchanged", () => {
    expect(assessmentChanges(assessment, { ...unchanged(), groupIds: ["g3", "g1", "g2"] })).toEqual(
      {},
    );
  });

  it("sends the groups when they really changed", () => {
    expect(assessmentChanges(assessment, { ...unchanged(), groupIds: ["g1"] })).toEqual({
      groupIds: ["g1"],
    });
  });

  it("compares times as moments, not as spellings", () => {
    expect(
      assessmentChanges(assessment, { ...unchanged(), closesAt: "2026-10-10T22:00:00+02:00" }),
    ).toEqual({});
  });

  it("sends a moved closing time", () => {
    const later = "2026-10-12T20:00:00.000Z";
    expect(assessmentChanges(assessment, { ...unchanged(), closesAt: later })).toEqual({
      closesAt: later,
    });
  });
});

describe("fromLocalInput", () => {
  it("keeps the stored seconds when the lecturer left the time alone", () => {
    // The input shows minutes only; converting it back used to move 10:13:19.936
    // to 10:13:00 on every save.
    const shown = toLocalInput(assessment.opensAt);
    expect(fromLocalInput(shown, assessment.opensAt)).toBe(assessment.opensAt);
  });

  it("uses the new value when the lecturer changed it", () => {
    const changed = "2026-09-27T09:00";
    expect(fromLocalInput(changed, assessment.opensAt)).toBe(new Date(changed).toISOString());
  });
});

describe("maxMarkProblem", () => {
  it("accepts an ordinary maximum", () => {
    expect(maxMarkProblem("100")).toBeUndefined();
    expect(maxMarkProblem("72.5")).toBeUndefined();
  });

  it("refuses more than the API allows, before the request", () => {
    expect(maxMarkProblem("5000")).toBe("The maximum mark can be at most 1000.");
  });

  it("refuses a third decimal, which would be rounded away when stored", () => {
    expect(maxMarkProblem("99.999")).toBe("Use at most two decimal places.");
  });

  it("refuses nothing, zero and text", () => {
    expect(maxMarkProblem("")).toBeDefined();
    expect(maxMarkProblem("0")).toBeDefined();
    expect(maxMarkProblem("abc")).toBeDefined();
  });
});

describe("serverFieldErrors", () => {
  it("puts the server's message beside the field it is about", () => {
    // "Please try again" was all the lecturer got, and retrying never helps.
    const error = new ApiError(400, {
      code: "validation_failed",
      message: "Please check the highlighted fields.",
      fields: { maxMark: "The maximum mark can be at most 1000." },
    });
    expect(serverFieldErrors(error)).toEqual({ maxMark: "The maximum mark can be at most 1000." });
  });

  it("has nothing for a refusal that is not about a field", () => {
    const error = new ApiError(409, { code: "conflict", message: "Groups can't be changed." });
    expect(serverFieldErrors(error)).toEqual({});
    expect(serverFieldErrors(new Error("offline"))).toEqual({});
  });
});

describe("closedAtOf", () => {
  it("is when the lecturer closed it, not the scheduled closing time", () => {
    // Closing early used to read "Closed on" a date still in the future.
    expect(
      closedAtOf({ closesAt: "2026-09-29T11:22:00.000Z", closedAt: "2026-09-26T11:28:00.000Z" }),
    ).toBe("2026-09-26T11:28:00.000Z");
  });

  it("falls back to the scheduled time when no close was recorded", () => {
    expect(closedAtOf({ closesAt: "2026-07-27T20:00:00.000Z" })).toBe("2026-07-27T20:00:00.000Z");
  });
});
