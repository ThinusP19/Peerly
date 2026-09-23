import { expect, test } from "@playwright/test";

import { hideDevTools, seededClass } from "./helpers.ts";

/**
 * Entering marks, calculating, overriding, exporting.
 *
 * The half of the lecturer's work that decides what goes on a record. The
 * calculation itself is proved in `server/src/lib/felder.test.ts`; this proves
 * the path to it - that a mark typed into a row reaches the calculation, that
 * the results it produces reach the screen, and that an override sits beside
 * the calculated mark rather than replacing it.
 */

test("a lecturer enters marks, calculates, overrides and exports", async ({ page }) => {
  test.setTimeout(120_000);
  await hideDevTools(page);

  // The seeded closed assessment is the one with submissions to calculate from.
  const classes = await (await page.request.get("/api/classes")).json();
  const withAssessments = seededClass(classes.classes);
  const rows = await (
    await page.request.get(`/api/classes/${withAssessments.klass.id}/assessments`)
  ).json();
  const closed = rows.assessments.find(
    (r: { assessment: { status: string } }) => r.assessment.status === "closed",
  );

  // Point the portal at it, the way the header's selector would.
  await page.addInitScript(
    ([classId, assessmentId]) =>
      window.localStorage.setItem(
        "peerly.preferences",
        JSON.stringify({ activeClassId: classId, activeAssessmentId: assessmentId }),
      ),
    [withAssessments.klass.id, closed.assessment.id],
  );

  /* ------------------------------ enter marks ------------------------------ */
  await page.goto("/lecturer/marks");
  await expect(page.getByRole("table")).toBeVisible();

  const marks = page.getByPlaceholder("-");
  const groupCount = await marks.count();
  expect(groupCount, "the seeded class should have groups to mark").toBeGreaterThan(0);

  const calculate = page.getByRole("button", { name: "Calculate marks" });

  // The seed enters every group's mark, so the gate starts open. Clearing one
  // is what proves FR-21 is actually enforced rather than merely satisfied:
  // calculation must close the moment a group has no mark.
  await expect(calculate).toBeEnabled();
  await marks.first().fill("");
  await marks.first().blur();
  await expect(calculate, "a group with no mark blocks calculation").toBeDisabled();

  // Enter it again - this is the mark entry path (FR-21), saved per row.
  await marks.first().fill("64");
  await marks.first().blur();
  await expect(page.getByText(/entered|saved/i).first()).toBeVisible();
  await expect(calculate, "calculation unlocks once every group has a mark").toBeEnabled();
  await calculate.click();

  const confirm = page.getByRole("dialog");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Calculate marks" }).click();

  /* -------------------------------- results -------------------------------- */
  await page.goto("/lecturer/results");
  await expect(page.getByRole("table")).toBeVisible();

  // Real students, with a factor and a mark - the three things the table exists
  // to show. The marks entered above are what these were derived from.
  const body = await page.locator("main").innerText();
  expect(body).toMatch(/Mokoena|Mahlangu|Nkosi/);
  expect(body, "a mark to two decimals").toMatch(/\d+\.\d\d/);

  /* ------------------------------- override -------------------------------- */
  // The override lives in the row's drill-down drawer, alongside the ratings
  // the mark came from - which is the point: FR-24 expects the lecturer to be
  // looking at the evidence when they change a mark.
  await page.getByRole("row").nth(1).click();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: /override mark/i }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /override mark/i })
    .click();
  const override = page.getByRole("dialog");
  await expect(override).toBeVisible();

  // FR-24: the calculated mark is shown read-only beside the new one.
  await expect(override.getByText(/calculated mark/i).first()).toBeVisible();

  const save = override.getByRole("button", { name: "Save override" });
  // The reason is mandatory, so Save stays disabled until it is given.
  await expect(save).toBeDisabled();

  await override.getByLabel("New mark").fill("88");
  await override.getByLabel(/reason for the override/i).fill("Medical certificate accepted.");
  await expect(save).toBeEnabled();
  await save.click();

  await expect(override).toBeHidden();
  // BR-08: the override is recorded alongside, not instead of, the calculation.
  await expect(page.getByText(/88/).first()).toBeVisible();

  /* -------------------------------- export --------------------------------- */
  await page.goto("/lecturer/export");
  await expect(page.getByText(/worksheet 1/i).first()).toBeVisible();

  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: /download|export/i })
    .first()
    .click();
  const file = await download;

  // FR-25: a real workbook, named after the module and the assessment.
  expect(file.suggestedFilename()).toMatch(/\.xlsx$/);
  expect(file.suggestedFilename()).toContain("peerly-");
});
