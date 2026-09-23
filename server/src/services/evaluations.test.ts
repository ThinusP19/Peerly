import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closePool, pool, query } from "../db/pool.ts";
import { createUser, resetDatabase } from "../test/helpers.ts";
import {
  getEvaluationContext,
  getOwnEntries,
  saveDraft,
  submitEvaluation,
  type RatingEntry,
} from "./evaluations.ts";

/**
 * FR-15 to FR-17, and the business rules behind them.
 *
 * Several of these assert that the API refuses something the database would
 * refuse anyway. That is the point: the requirement is that a hand-written
 * request cannot get past it, so the test goes through the service rather than
 * the screen, and a plain-language refusal is part of what is being checked.
 */

beforeEach(resetDatabase);
afterAll(closePool);

async function scenario(status: "draft" | "open" | "closed" = "open", groupSize = 4) {
  const lecturer = await createUser({ role: "lecturer" });
  const { rows: cls } = await query<{ id: string }>(
    `INSERT INTO classes (module_code, name, academic_period, lecturer_id)
     VALUES ('CMPG323', 'Test', '2026 S2', $1) RETURNING id`,
    [lecturer.id],
  );
  const classId = cls[0]!.id;

  const { rows: grp } = await query<{ id: string }>(
    "INSERT INTO groups (class_id, group_number) VALUES ($1, 1) RETURNING id",
    [classId],
  );
  const groupId = grp[0]!.id;

  const students: string[] = [];
  for (let i = 0; i < groupSize; i += 1) {
    const s = await createUser({ role: "student" });
    await query("INSERT INTO group_members (group_id, class_id, student_id) VALUES ($1,$2,$3)", [
      groupId,
      classId,
      s.id,
    ]);
    students.push(s.id);
  }

  const { rows: asm } = await query<{ id: string }>(
    `INSERT INTO assessments (class_id, name, status, opens_at, closes_at)
     VALUES ($1, 'Phase 2', $2, now() - interval '1 day', now() + interval '7 days') RETURNING id`,
    [classId, status],
  );
  await query(
    "INSERT INTO assessment_groups (assessment_id, group_id, class_id) VALUES ($1,$2,$3)",
    [asm[0]!.id, groupId, classId],
  );

  const { rows: options } = await query<{ id: string }>(
    "SELECT id FROM rating_options ORDER BY display_order",
  );

  return {
    classId,
    groupId,
    assessmentId: asm[0]!.id,
    students,
    options: options.map((o) => o.id),
    me: students[0]!,
    peers: students.slice(1),
  };
}

const rateAll = (peers: string[], optionId: string): RatingEntry[] =>
  peers.map((id) => ({ evaluatedStudentId: id, ratingOptionId: optionId }));

describe("getEvaluationContext", () => {
  it("names the peers to rate, excluding the student themselves (BR-02)", async () => {
    const { assessmentId, me, peers } = await scenario();

    const context = await getEvaluationContext(me, assessmentId);
    expect(context.peerIds.sort()).toEqual([...peers].sort());
    expect(context.peerIds).not.toContain(me);
  });

  it("refuses an assessment the student's group takes no part in", async () => {
    const { assessmentId } = await scenario();
    const outsider = await createUser({ role: "student" });

    await expect(getEvaluationContext(outsider.id, assessmentId)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("submitEvaluation", () => {
  it("records a rating for every peer", async () => {
    const { assessmentId, me, peers, options } = await scenario();

    const result = await submitEvaluation(me, assessmentId, rateAll(peers, options[0]!));
    expect(result.status).toBe("submitted");
    expect(result.ratingCount).toBe(3);
  });

  it("refuses an incomplete evaluation and names who is missing (FR-16)", async () => {
    const { assessmentId, me, peers, options } = await scenario();

    await expect(
      submitEvaluation(me, assessmentId, rateAll(peers.slice(0, 2), options[0]!)),
    ).rejects.toMatchObject({ fields: { missing: peers[2] } });
  });

  it("refuses a rating for someone outside the group (BR-01)", async () => {
    const { assessmentId, me, peers, options } = await scenario();
    const stranger = await createUser({ role: "student" });

    await expect(
      submitEvaluation(me, assessmentId, [
        ...rateAll(peers, options[0]!),
        { evaluatedStudentId: stranger.id, ratingOptionId: options[0]! },
      ]),
    ).rejects.toThrow(/your own group/);
  });

  it("refuses a self-evaluation (BR-02)", async () => {
    const { assessmentId, me, peers, options } = await scenario();

    await expect(
      submitEvaluation(me, assessmentId, [
        ...rateAll(peers, options[0]!),
        { evaluatedStudentId: me, ratingOptionId: options[0]! },
      ]),
    ).rejects.toThrow(/your own group/);
  });

  it("refuses rating the same person twice (BR-03)", async () => {
    const { assessmentId, me, peers, options } = await scenario();

    await expect(
      submitEvaluation(me, assessmentId, [
        ...rateAll(peers, options[0]!),
        { evaluatedStudentId: peers[0]!, ratingOptionId: options[1]! },
      ]),
    ).rejects.toThrow(/only be rated once/);
  });

  it("refuses an assessment that has not opened", async () => {
    const { assessmentId, me, peers, options } = await scenario("draft");

    await expect(submitEvaluation(me, assessmentId, rateAll(peers, options[0]!))).rejects.toThrow(
      /hasn't opened/,
    );
  });

  it("refuses a closed assessment, however the request arrives (OR-08)", async () => {
    const { assessmentId, me, peers, options } = await scenario("closed");

    await expect(submitEvaluation(me, assessmentId, rateAll(peers, options[0]!))).rejects.toThrow(
      /closed/,
    );
  });

  it("refuses a group of one, rather than accepting an empty submission", async () => {
    const { assessmentId, me } = await scenario("open", 1);

    await expect(submitEvaluation(me, assessmentId, [])).rejects.toThrow(/nobody else/);
  });

  it("stores an optional comment, and null where there is none (FR-17)", async () => {
    const { assessmentId, me, peers, options } = await scenario();
    const entries = rateAll(peers, options[0]!);
    entries[0]!.comment = "  Carried the group.  ";

    await submitEvaluation(me, assessmentId, entries);

    const { rows } = await query<{ comment: string | null }>(
      "SELECT comment FROM peer_ratings WHERE evaluator_id = $1 ORDER BY comment NULLS LAST",
      [me],
    );
    expect(rows[0]!.comment).toBe("Carried the group.");
    expect(rows[1]!.comment).toBeNull();
  });

  it("refuses a comment over 500 characters", async () => {
    const { assessmentId, me, peers, options } = await scenario();
    const entries = rateAll(peers, options[0]!);
    entries[0]!.comment = "x".repeat(501);

    await expect(submitEvaluation(me, assessmentId, entries)).rejects.toThrow(/500 characters/);
  });

  it("lets a student amend while the assessment is still open (FR-16)", async () => {
    const { assessmentId, me, peers, options } = await scenario();
    await submitEvaluation(me, assessmentId, rateAll(peers, options[0]!));

    await submitEvaluation(me, assessmentId, rateAll(peers, options[8]!));

    const { rows } = await query<{ rating_option_id: string; count: string }>(
      `SELECT rating_option_id, count(*) AS count FROM peer_ratings
        WHERE evaluator_id = $1 GROUP BY rating_option_id`,
      [me],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.rating_option_id).toBe(options[8]);
    expect(Number(rows[0]!.count)).toBe(3);
  });

  it("keeps the original submission time through an amendment", async () => {
    const { assessmentId, me, peers, options } = await scenario();
    const first = await submitEvaluation(me, assessmentId, rateAll(peers, options[0]!));
    const second = await submitEvaluation(me, assessmentId, rateAll(peers, options[1]!));

    expect(second.submittedAt).toBe(first.submittedAt);
  });

  it("leaves nothing behind when it refuses (OR-05)", async () => {
    const { assessmentId, me, peers, options } = await scenario();
    const stranger = await createUser({ role: "student" });

    await expect(
      submitEvaluation(me, assessmentId, [
        ...rateAll(peers, options[0]!),
        { evaluatedStudentId: stranger.id, ratingOptionId: options[0]! },
      ]),
    ).rejects.toThrow();

    const { rows } = await query("SELECT 1 FROM peer_ratings WHERE evaluator_id = $1", [me]);
    expect(rows).toHaveLength(0);
  });

  it("keeps one student's ratings separate from another's", async () => {
    const { assessmentId, students, options } = await scenario();
    const [a, b] = students as [string, string, string, string];

    await submitEvaluation(
      a,
      assessmentId,
      rateAll(
        students.filter((s) => s !== a),
        options[0]!,
      ),
    );
    await submitEvaluation(
      b,
      assessmentId,
      rateAll(
        students.filter((s) => s !== b),
        options[1]!,
      ),
    );

    const { rows } = await query<{ count: string }>(
      "SELECT count(*) AS count FROM peer_ratings WHERE evaluator_id = $1",
      [a],
    );
    expect(Number(rows[0]!.count)).toBe(3);
  });
});

describe("getOwnEntries (CI-10)", () => {
  it("returns a saved draft, so it follows the student to another device", async () => {
    const { assessmentId, me, peers, options } = await scenario();
    await saveDraft(me, assessmentId, [
      { evaluatedStudentId: peers[0]!, ratingOptionId: options[2]!, comment: "Solid work." },
    ]);

    expect(await getOwnEntries(me, assessmentId)).toEqual([
      { evaluatedStudentId: peers[0]!, ratingOptionId: options[2]!, comment: "Solid work." },
    ]);
  });

  it("returns a submitted evaluation, so it can be viewed afterwards", async () => {
    const { assessmentId, me, peers, options } = await scenario();
    await submitEvaluation(me, assessmentId, rateAll(peers, options[0]!));

    expect(await getOwnEntries(me, assessmentId)).toHaveLength(peers.length);
  });

  it("never returns another student's ratings (SR-08)", async () => {
    const { assessmentId, me, peers, options } = await scenario();
    await saveDraft(me, assessmentId, rateAll(peers.slice(0, 1), options[0]!));

    expect(await getOwnEntries(peers[0]!, assessmentId)).toEqual([]);
  });
});

describe("saveDraft (CI-10)", () => {
  it("accepts a partial evaluation", async () => {
    const { assessmentId, me, peers, options } = await scenario();

    await saveDraft(me, assessmentId, rateAll(peers.slice(0, 1), options[2]!));

    const context = await getEvaluationContext(me, assessmentId);
    expect(context.submission?.status).toBe("draft");
  });

  it("replaces the previous draft rather than accumulating", async () => {
    // The payload is the whole evaluation as it stands on screen, so a member
    // the student went back and cleared has to disappear.
    const { assessmentId, me, peers, options } = await scenario();
    await saveDraft(me, assessmentId, rateAll(peers.slice(0, 2), options[0]!));
    await saveDraft(me, assessmentId, rateAll(peers.slice(0, 1), options[0]!));

    const { rows } = await query("SELECT 1 FROM peer_ratings WHERE evaluator_id = $1", [me]);
    expect(rows).toHaveLength(1);
  });

  it("still refuses a rating outside the group", async () => {
    const { assessmentId, me, options } = await scenario();
    const stranger = await createUser({ role: "student" });

    await expect(
      saveDraft(me, assessmentId, [
        { evaluatedStudentId: stranger.id, ratingOptionId: options[0]! },
      ]),
    ).rejects.toThrow(/your own group/);
  });

  it("never turns a submission back into a draft, even when the save was already under way", async () => {
    // The race, made deterministic. An autosave reads "not submitted", then the
    // student's submission commits, then the autosave writes. A row lock holds
    // the autosave between its read and its write while the submission lands.
    const { assessmentId, me, peers, options } = await scenario();
    await saveDraft(me, assessmentId, rateAll(peers.slice(0, 1), options[1]!));

    const blocker = await pool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query(
        "SELECT 1 FROM submissions WHERE assessment_id = $1 AND evaluator_id = $2 FOR UPDATE",
        [assessmentId, me],
      );
      // Reads "draft", validates, then blocks on the lock at its upsert.
      const inFlight = saveDraft(me, assessmentId, rateAll(peers.slice(0, 2), options[1]!)).then(
        () => "saved",
        () => "refused",
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
      // The submission commits while the autosave waits.
      await blocker.query(
        `UPDATE submissions SET status = 'submitted', submitted_at = now()
          WHERE assessment_id = $1 AND evaluator_id = $2`,
        [assessmentId, me],
      );
      await blocker.query("COMMIT");

      expect(await inFlight).toBe("refused");
    } finally {
      blocker.release();
    }

    const context = await getEvaluationContext(me, assessmentId);
    expect(context.submission?.status).toBe("submitted");
  });

  it("refuses once the evaluation has been submitted", async () => {
    const { assessmentId, me, peers, options } = await scenario();
    await submitEvaluation(me, assessmentId, rateAll(peers, options[0]!));

    await expect(
      saveDraft(me, assessmentId, rateAll(peers.slice(0, 1), options[1]!)),
    ).rejects.toThrow(/already submitted/);
  });

  it("becomes a submission when the student finishes", async () => {
    const { assessmentId, me, peers, options } = await scenario();
    await saveDraft(me, assessmentId, rateAll(peers.slice(0, 2), options[0]!));

    const result = await submitEvaluation(me, assessmentId, rateAll(peers, options[0]!));
    expect(result.ratingCount).toBe(3);

    const { rows } = await query<{ count: string }>(
      "SELECT count(*) AS count FROM submissions WHERE evaluator_id = $1",
      [me],
    );
    expect(Number(rows[0]!.count)).toBe(1);
  });
});
