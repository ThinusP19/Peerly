import { expect, request as playwrightRequest, test } from "@playwright/test";

import { DEV_PASSWORD, seededClass } from "./helpers.ts";

/**
 * A student rates their group, from the dashboard to the confirmation.
 *
 * The smoke tests prove each of these pages renders. This proves they join up:
 * that a rating chosen on one screen survives to the next, that submission is
 * refused while anyone is unrated, and that what the student submits is what
 * the lecturer then sees.
 *
 * Waits are on elements, never on `networkidle`. Navigation here is
 * client-side, so the network can be quiet while the previous screen is still
 * on display - which made this test read the dashboard and conclude the
 * evaluation form had no rating scale.
 */

test("a student rates their group, submits, and the lecturer sees it", async ({ browser }) => {
  const lecturer = await playwrightRequest.newContext({ baseURL: "http://127.0.0.1:7331" });
  await lecturer.post("/api/auth/login", {
    data: { email: "anneke.vdmerwe@nwu.ac.za", password: DEV_PASSWORD },
  });

  // Start from someone who has not submitted, so this is a first submission
  // rather than an amendment.
  const classes: { classes: Array<{ klass: { id: string; moduleCode: string } }> } = await (
    await lecturer.get("/api/classes")
  ).json();
  const withOpen = seededClass(classes.classes);
  const rows = await (await lecturer.get(`/api/classes/${withOpen.klass.id}/assessments`)).json();
  const open = rows.assessments.find(
    (r: { assessment: { status: string } }) => r.assessment.status === "open",
  );
  const before = await (
    await lecturer.get(`/api/assessments/${open.assessment.id}/progress`)
  ).json();
  const group = before.progress.find(
    (g: { outstanding: Array<{ studentNumber: string }> }) => g.outstanding.length > 0,
  );
  const outstanding = group?.outstanding[0];
  expect(outstanding, "the seed should leave someone outstanding").toBeTruthy();
  // Everyone in the group, the student themselves included (2026-10-10).
  const rateeCount = group.members.length;
  expect(rateeCount, "the incomplete-review check needs at least two ratees").toBeGreaterThan(1);

  const context = await browser.newContext({ baseURL: "http://127.0.0.1:7331" });
  const page = await context.newPage();
  await page.request.post("/api/auth/login", {
    data: { email: `${outstanding.studentNumber}@mynwu.ac.za`, password: DEV_PASSWORD },
  });

  await page.goto("/student");
  // The lecturer journey creates another open assessment that can appear first.
  // Follow the same assessment whose progress we checked, regardless of order.
  const evaluationPath = `/student/evaluate/${open.assessment.id}`;
  const start = page
    .getByRole("link", { name: /start evaluation/i })
    .and(page.locator(`a[href="${evaluationPath}"]`))
    .first();
  await expect(start).toBeVisible();
  await start.click();
  await expect(page).toHaveURL(new RegExp(`${evaluationPath}$`));
  await expect(
    page.getByRole("heading", { name: open.assessment.name, exact: true }),
  ).toBeVisible();

  // Wait for the form itself, not for the network. Everyone the student rates
  // is on the one page, each with their own scale, themselves first. Check the
  // exact count from that group's roster, so a different assessment cannot
  // pass just by having several members.
  await expect(page.getByRole("radiogroup").first()).toBeVisible();
  await expect(
    page.getByRole("radiogroup"),
    "every member of the seeded group, the student included, should have a rating scale",
  ).toHaveCount(rateeCount);
  await expect(page.getByText(/how did you contribute/i)).toBeVisible();

  // FR-16: submission is refused while anyone is unrated, and says who.
  await page.getByRole("radiogroup").first().getByRole("radio").nth(1).check();
  await page
    .getByRole("link", { name: /review/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/review$/);
  // Wait for the review screen itself: the URL changes before it paints, and
  // the form still on screen says "Not rated" - which let this pass without
  // ever reading the review page. It names each unrated member instead.
  await expect(page.getByRole("heading", { name: /check before you submit/i })).toBeVisible();
  await expect(page.getByText(/haven't chosen a rating|haven't rated/i).first()).toBeVisible();

  // Go back and finish the rest.
  await page.goBack();
  await expect(page.getByRole("radiogroup").first()).toBeVisible();
  for (let i = 0; i < rateeCount; i += 1) {
    await page.getByRole("radiogroup").nth(i).getByRole("radio").nth(1).check();
  }
  await expect(
    page.getByText(new RegExp(`${rateeCount} of ${rateeCount} rated`, "i")),
  ).toBeVisible();

  await page
    .getByRole("link", { name: /review/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/review$/);

  const submit = page.getByRole("button", { name: /submit/i }).first();
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page).toHaveURL(/\/submitted$/);
  await expect(page.getByText(/submitted/i).first()).toBeVisible();

  // The lecturer's monitor now shows them as submitted, which is the point.
  const after = await (
    await lecturer.get(`/api/assessments/${open.assessment.id}/progress`)
  ).json();
  const stillOutstanding = after.progress
    .flatMap((g: { outstanding: Array<{ studentNumber: string }> }) => g.outstanding)
    .map((s: { studentNumber: string }) => s.studentNumber);
  expect(stillOutstanding).not.toContain(outstanding.studentNumber);

  await context.close();
  await lecturer.dispose();
});
