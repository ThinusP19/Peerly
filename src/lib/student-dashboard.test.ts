import { describe, expect, it } from "vitest";

import {
  acceptsWork,
  dashboardSubmission,
  enrolmentProblems,
  needsEnrolmentExplanation,
  submittedMeta,
} from "./student-dashboard";
import type { Submission } from "@/mocks/types";

const now = new Date("2026-09-26T12:00:00Z");
const past = "2026-07-27T12:00:00Z";
const future = "2026-10-20T12:00:00Z";

describe("acceptsWork (BR-05)", () => {
  it("takes work while open and before the closing time", () => {
    expect(acceptsWork({ status: "open", opensAt: past, closesAt: future }, now)).toBe(true);
  });

  it("stops at the closing time even while the status still says open", () => {
    expect(acceptsWork({ status: "open", opensAt: past, closesAt: past }, now)).toBe(false);
    expect(acceptsWork({ status: "open", opensAt: past, closesAt: now.toISOString() }, now)).toBe(
      false,
    );
  });

  it("takes nothing before the opening time, even once opened early (#13)", () => {
    expect(acceptsWork({ status: "open", opensAt: future, closesAt: future }, now)).toBe(false);
    expect(acceptsWork({ status: "open", opensAt: now.toISOString(), closesAt: future }, now)).toBe(
      true,
    );
  });

  it("takes nothing from a draft or closed assessment", () => {
    expect(acceptsWork({ status: "draft", opensAt: past, closesAt: future }, now)).toBe(false);
    expect(acceptsWork({ status: "closed", opensAt: past, closesAt: future }, now)).toBe(false);
  });
});

describe("dashboardSubmission", () => {
  const submitted: Submission = {
    id: "s-1",
    assessmentId: "a-1",
    evaluatorStudentId: "st-1",
    status: "submitted",
    submittedAt: "2026-09-20T10:00:00Z",
    updatedAt: "2026-09-20T10:00:00Z",
  };

  it("keeps the server's submission while an amendment sits unsent on this device", () => {
    // reopen() clears submittedAt locally and every peer is still rated.
    const local = { ratedCount: 3, reopened: true };
    expect(dashboardSubmission(submitted, local)?.status).toBe("submitted");
  });

  it("shows local ratings as in progress when nothing was submitted", () => {
    expect(dashboardSubmission(undefined, { ratedCount: 2 })?.status).toBe("draft");
  });

  it("trusts a submission this browser just made before the server list refreshes", () => {
    const result = dashboardSubmission(undefined, {
      ratedCount: 3,
      submittedAt: "2026-09-26T11:00:00Z",
    });
    expect(result).toMatchObject({ status: "submitted", submittedAt: "2026-09-26T11:00:00Z" });
  });

  it("falls back to the server when this browser holds nothing", () => {
    expect(dashboardSubmission(undefined, undefined)).toBeUndefined();
    expect(dashboardSubmission(undefined, { ratedCount: 0 })).toBeUndefined();
  });
});

describe("submittedMeta", () => {
  it("says 'closed' once the closing time has passed", () => {
    expect(submittedMeta({ status: "closed", closesAt: past }, {}, now)).toBe(
      "Submitted · closed 27 Jul 2026",
    );
    // Past the deadline but not yet closed by the lecturer: still past tense.
    expect(submittedMeta({ status: "open", closesAt: past }, {}, now)).toBe(
      "Submitted · closed 27 Jul 2026",
    );
  });

  it("says 'closes' while it is still open", () => {
    expect(submittedMeta({ status: "open", closesAt: future }, {}, now)).toBe(
      "Submitted · closes 20 Oct 2026",
    );
  });

  it("mentions unsent changes only while they could still be sent", () => {
    expect(
      submittedMeta({ status: "open", closesAt: future }, { unsentChanges: true }, now),
    ).toMatch(/your changes aren't sent yet$/);
    expect(
      submittedMeta({ status: "closed", closesAt: past }, { unsentChanges: true }, now),
    ).not.toMatch(/changes/);
  });
});

describe("enrolment problems (OR-23, UR-08)", () => {
  it("never hides assessments because another class list has a problem", () => {
    const enrolments = [{ matchStatus: "conflict" as const }, { matchStatus: "matched" as const }];
    expect(needsEnrolmentExplanation(enrolments, 2)).toBe(false);
    expect(enrolmentProblems(enrolments)).toEqual([{ matchStatus: "conflict" }]);
  });

  it("still explains a conflict on a newer list when the oldest one matched", () => {
    const enrolments = [{ matchStatus: "matched" as const }, { matchStatus: "conflict" as const }];
    expect(enrolmentProblems(enrolments)).toHaveLength(1);
  });

  it("explains rather than shows an empty dashboard when nothing matched", () => {
    expect(needsEnrolmentExplanation([{ matchStatus: "unmatched" }], 0)).toBe(true);
    // On no class list at all: the same explanation, not "No assessments yet".
    expect(needsEnrolmentExplanation([], 0)).toBe(true);
  });

  it("shows the ordinary empty dashboard to a matched student with nothing open yet", () => {
    expect(needsEnrolmentExplanation([{ matchStatus: "matched" }], 0)).toBe(false);
  });
});
