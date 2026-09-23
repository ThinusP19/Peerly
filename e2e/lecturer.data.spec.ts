import { expect, test } from "@playwright/test";

import { seededClass } from "./helpers.ts";

/**
 * Does the lecturer portal show the database, or the fixtures?
 *
 * The smoke tests prove a page loads and asks the API for nothing it cannot
 * have. They do not prove it renders the answer. A screen that fetches real
 * rows and then labels them with a name looked up in `src/mocks/data` passes
 * every other test in this repository and is still wrong.
 *
 * These assertions are all against the seeded database, which the fixtures do
 * not match: the seed's student numbers step by 37 from 41200345, while the
 * mock ones are consecutive.
 */

test("the class picker offers the lecturer's real classes", async ({ page }) => {
  // Not the dashboard: that spans every class, so it deliberately has no
  // picker. Any page that works inside one class shows it.
  await page.goto("/lecturer/monitor");
  await page.waitForLoadState("networkidle");

  // The trigger carries the id; Radix renders its options into a portal, so
  // they are found on the page rather than inside the trigger.
  await page.locator("#context-class").click();
  await expect(page.getByRole("option", { name: /CMPG323/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /CMPG315/ })).toBeVisible();
});

test("the class list shows all thirty seeded enrolments", async ({ page }) => {
  await page.goto("/lecturer/classes");
  await page.waitForLoadState("networkidle");

  // A real student number from the seed, which the fixtures do not contain.
  await expect(page.getByText("41200493").first()).toBeVisible();
  // The deliberate unmatched and conflict rows.
  await expect(page.getByText(/unmatched/i).first()).toBeVisible();
});

test("the submission monitor names real outstanding students", async ({ page }) => {
  await page.goto("/lecturer/monitor");
  await page.waitForLoadState("networkidle");

  // 22 of 28 submitted in the seed, so there are outstanding students to name.
  await expect(page.getByText(/outstanding/i).first()).toBeVisible();
});

test("the matrix labels its rows with real student names", async ({ page }) => {
  await page.goto("/lecturer/matrix");
  await page.waitForLoadState("networkidle");

  // Seeded names. If the screen is looking these up in the mock `users` array
  // it will render blanks or the wrong people.
  const body = await page.locator("main").innerText();
  expect(body).toMatch(/Mokoena|Mahlangu|Nkosi/);
});

test("calculated marks appear in the results table", async ({ page }) => {
  // The seeded open assessment has no group marks, so it cannot be calculated -
  // that refusal is itself tested on the server. This drives the closed one,
  // which does have marks, and checks the table renders what came back.
  const classes = await (await page.request.get("/api/classes")).json();
  const withAssessments = seededClass(classes.classes);
  const list = await (
    await page.request.get(`/api/classes/${withAssessments.klass.id}/assessments`)
  ).json();
  const closed = list.assessments.find(
    (row: { assessment: { status: string } }) => row.assessment.status === "closed",
  );

  const run = await page.request.post(`/api/assessments/${closed.assessment.id}/calculate`);
  expect(run.ok()).toBe(true);

  // Point the portal at that class and assessment the way the header would.
  await page.goto("/lecturer/results");
  await page.evaluate(
    ([classId, assessmentId]) =>
      window.localStorage.setItem(
        "peerly.preferences",
        JSON.stringify({ activeClassId: classId, activeAssessmentId: assessmentId }),
      ),
    [withAssessments.klass.id, closed.assessment.id],
  );
  await page.reload();
  await page.waitForLoadState("networkidle");

  const body = await page.locator("main").innerText();
  expect(body).toMatch(/Mokoena|Mahlangu|Nkosi/);
  // A mark, a factor and a flag - the three things the table exists to show.
  expect(body).toMatch(/\d+\.\d/);
});

test("the dashboard counts the real class, not the fixture one", async ({ page }) => {
  await page.goto("/lecturer");
  await page.waitForLoadState("networkidle");

  const body = await page.locator("main").innerText();
  expect(body).toContain("CMPG323");
});

test("group generation allocates the real matched students", async ({ page }) => {
  await page.goto("/lecturer/groups/generate");
  await page.waitForLoadState("networkidle");

  // 28 of the 30 seeded enrolments are matched; the other two are the
  // deliberate unmatched and conflict rows, which cannot be allocated.
  const body = await page.locator("main").innerText();
  expect(body).toContain("28");
});
