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
  const classes = await (await lecturer.get("/api/classes")).json();
  const withOpen = seededClass(classes.classes);
  const rows = await (await lecturer.get(`/api/classes/${withOpen.klass.id}/assessments`)).json();
  const open = rows.assessments.find(
    (r: { assessment: { status: string } }) => r.assessment.status === "open",
  );
  const before = await (
    await lecturer.get(`/api/assessments/${open.assessment.id}/progress`)
  ).json();
  const outstanding = before.progress.flatMap(
    (g: { outstanding: Array<{ studentNumber: string }> }) => g.outstanding,
  )[0];
  expect(outstanding, "the seed should leave someone outstanding").toBeTruthy();

  const context = await browser.newContext({ baseURL: "http://127.0.0.1:7331" });
  const page = await context.newPage();
  await page.request.post("/api/auth/login", {
    data: { email: `${outstanding.studentNumber}@mynwu.ac.za`, password: DEV_PASSWORD },
  });

  await page.goto("/student");
  // The dashboard offers the same assessment in the summary and in the list,
  // so there is more than one way in - take the first.
  const start = page.getByRole("link", { name: /start evaluation/i }).first();
  await expect(start).toBeVisible();
  await start.click();

  // Wait for the form itself, not for the network. Every peer is on the one
  // page, each with their own scale, so wait until they have all mounted -
  // counting too early found one card and concluded the group had one member.
  await expect(page.getByRole("radiogroup").first()).toBeVisible();
  await expect
    .poll(() => page.getByRole("radiogroup").count(), {
      message: "waiting for every peer's rating scale to render",
    })
    .toBeGreaterThan(1);

  const peerCount = await page.getByRole("radiogroup").count();

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
  for (let i = 0; i < peerCount; i += 1) {
    await page.getByRole("radiogroup").nth(i).getByRole("radio").nth(1).check();
  }
  await expect(page.getByText(new RegExp(`${peerCount} of ${peerCount} rated`, "i"))).toBeVisible();

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
