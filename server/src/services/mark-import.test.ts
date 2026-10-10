import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closePool, query } from "../db/pool.ts";
import { createUser, resetDatabase } from "../test/helpers.ts";
import { closedAssessment } from "../test/scenarios.ts";
import { getAssessment } from "./assessments.ts";
import { getAuditEntries } from "./audit.ts";
import { commitMarkImport, previewMarkImport } from "./mark-import.ts";
import { runCalculation } from "./results.ts";

/**
 * FR-21 from a file, on client feedback 2026-10-10: "The system does not
 * provide an option to upload a CSV file containing the marks."
 */

beforeEach(resetDatabase);
afterAll(closePool);

const csv = (text: string, name = "marks.csv") => {
  const buffer = Buffer.from(text, "utf8");
  return { originalname: name, size: buffer.length, buffer };
};

/** The scenario's group 1, plus group 2 "Team Rocket" with no mark yet, and group 3 outside it. */
async function scenario() {
  const scene = await closedAssessment();
  const { rows: g2 } = await query<{ id: string }>(
    "INSERT INTO groups (class_id, group_number, group_name) VALUES ($1, 2, 'Team Rocket') RETURNING id",
    [scene.classId],
  );
  await query(
    "INSERT INTO assessment_groups (assessment_id, group_id, class_id) VALUES ($1, $2, $3)",
    [scene.assessmentId, g2[0]!.id, scene.classId],
  );
  await query("INSERT INTO groups (class_id, group_number) VALUES ($1, 3)", [scene.classId]);
  return scene;
}

const markOf = async (assessmentId: string, groupNumber: number) =>
  (
    await query<{ base_mark: string | null }>(
      `SELECT m.base_mark FROM group_marks m JOIN groups g ON g.id = m.group_id
        WHERE m.assessment_id = $1 AND g.group_number = $2`,
      [assessmentId, groupNumber],
    )
  ).rows[0]?.base_mark;

describe("previewing a marks file", () => {
  it("matches groups by number or by name, and says what each row would do", async () => {
    const { assessmentId, user } = await scenario();
    const preview = await previewMarkImport(
      assessmentId,
      csv("Group,Mark\n1,70\nTeam Rocket,81.5\n"),
      user,
    );

    expect(preview.columns).toEqual({ group: "Group", mark: "Mark" });
    expect(preview.rows.map((row) => [row.groupNumber, row.mark, row.status])).toEqual([
      [1, 70, "unchanged"],
      [2, 81.5, "new"],
    ]);
  });

  it("writes nothing", async () => {
    const { assessmentId, user } = await scenario();
    await previewMarkImport(assessmentId, csv("Group,Mark\n1,90\n"), user);

    expect(await markOf(assessmentId, 1)).toBe("70.00");
  });

  it("explains every row it would refuse", async () => {
    const { assessmentId, user } = await scenario();
    const preview = await previewMarkImport(
      assessmentId,
      csv("Group number;Group mark\n1;abc\n2;101\n3;50\n9;50\nGroup 2;74,55\n"),
      user,
    );

    expect(preview.rows.map((row) => row.error)).toEqual([
      expect.stringMatching(/as a number/),
      expect.stringMatching(/between 0 and 100/),
      expect.stringMatching(/doesn't take part/),
      expect.stringMatching(/no group with this number/),
      expect.stringMatching(/already has a mark higher up/),
    ]);
  });

  it("reads a South African decimal comma, and lists the groups the file leaves out", async () => {
    const { assessmentId, user } = await scenario();
    const preview = await previewMarkImport(assessmentId, csv("Group;Mark\n2;74,5\n"), user);

    expect(preview.rows[0]).toMatchObject({ mark: 74.5, status: "new" });
    expect(preview.notInFile).toEqual([{ groupNumber: 1 }]);
  });

  it("says which column it couldn't find", async () => {
    const { assessmentId, user } = await scenario();

    await expect(previewMarkImport(assessmentId, csv("Team,Points\n1,70\n"), user)).rejects.toThrow(
      /a mark column/,
    );
  });

  it("is refused to another lecturer", async () => {
    const { assessmentId, user } = await scenario();
    const other = await createUser({ role: "lecturer" });

    await expect(
      previewMarkImport(assessmentId, csv("Group,Mark\n1,70\n"), { ...user, id: other.id }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("saving a marks file", () => {
  it("saves every new and changed mark", async () => {
    const { assessmentId, user } = await scenario();
    const result = await commitMarkImport(
      assessmentId,
      csv("Group,Mark\n1,72\nTeam Rocket,81.5\n"),
      user,
    );

    expect(result.changed).toBe(2);
    expect(await markOf(assessmentId, 1)).toBe("72.00");
    expect(await markOf(assessmentId, 2)).toBe("81.50");
  });

  it("saves nothing if any row is wrong", async () => {
    const { assessmentId, user } = await scenario();

    await expect(
      commitMarkImport(assessmentId, csv("Group,Mark\n1,72\n2,200\n"), user),
    ).rejects.toThrow(/no marks were saved/);
    expect(await markOf(assessmentId, 1)).toBe("70.00");
    expect(await markOf(assessmentId, 2)).toBeUndefined();
  });

  it("leaves a group with a blank mark as it was", async () => {
    const { assessmentId, user } = await scenario();
    await commitMarkImport(assessmentId, csv("Group,Mark\n1,\n2,60\n"), user);

    expect(await markOf(assessmentId, 1)).toBe("70.00");
    expect(await markOf(assessmentId, 2)).toBe("60.00");
  });

  it("audits each group's mark, naming the file (FR-27)", async () => {
    const { assessmentId, user } = await scenario();
    await commitMarkImport(assessmentId, csv("Group,Mark\n1,72\n2,60\n", "phase2.csv"), user);

    const entries = await getAuditEntries({ eventType: "marks.entered" });
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.detail).join(" ")).toMatch(/uploaded from phase2\.csv/);
  });

  it("makes calculated marks out of date when it changes one (FR-13)", async () => {
    const { assessmentId, user } = await scenario();
    await commitMarkImport(assessmentId, csv("Group,Mark\n2,60\n"), user);
    await runCalculation(assessmentId, user);

    const result = await commitMarkImport(assessmentId, csv("Group,Mark\n1,75\n"), user);
    expect(result.invalidatedCalculation).toBe(true);
    expect((await getAssessment(assessmentId, user)).calculatedAt).toBeUndefined();
  });
});
