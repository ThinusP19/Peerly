import { expect, request as playwrightRequest, test } from "@playwright/test";

import { DEV_PASSWORD, seededClass } from "./helpers.ts";

/**
 * A student on a shared computer rates a classmate and signs out.
 *
 * Nothing about whom they rated, or how, may stay in that browser for the next
 * person - and nothing may be lost either: the draft lives on the server, so
 * it is still there when they sign in again.
 */
test("signing out leaves no ratings in the browser, and the draft survives on the server", async ({
  browser,
}) => {
  const lecturer = await playwrightRequest.newContext({ baseURL: "http://127.0.0.1:7331" });
  await lecturer.post("/api/auth/login", {
    data: { email: "anneke.vdmerwe@nwu.ac.za", password: DEV_PASSWORD },
  });
  const classes = await (await lecturer.get("/api/classes")).json();
  const rows = await (
    await lecturer.get(`/api/classes/${seededClass(classes.classes).klass.id}/assessments`)
  ).json();
  const open = rows.assessments.find(
    (r: { assessment: { status: string } }) => r.assessment.status === "open",
  );
  const progress = await (
    await lecturer.get(`/api/assessments/${open.assessment.id}/progress`)
  ).json();
  // The second one outstanding: the student journey takes the first and the
  // keyboard walk-through the last, and this leaves a draft behind that would
  // change where their Tab lands.
  const student = progress.progress.flatMap(
    (g: { outstanding: Array<{ studentNumber: string }> }) => g.outstanding,
  )[1];
  expect(student, "the seed should leave someone outstanding").toBeTruthy();
  const email = `${student.studentNumber}@mynwu.ac.za`;

  const context = await browser.newContext({ baseURL: "http://127.0.0.1:7331" });
  const page = await context.newPage();
  await page.request.post("/api/auth/login", { data: { email, password: DEV_PASSWORD } });

  await page.goto("/student");
  await page
    .getByRole("link", { name: /start evaluation|continue/i })
    .first()
    .click();
  const firstPeer = page.getByRole("radiogroup").first();
  await expect(firstPeer).toBeVisible();
  const chosen = firstPeer.getByRole("radio").nth(2);
  await chosen.check();

  // The draft is written to this browser at once.
  const drafts = () =>
    page.evaluate(() =>
      Object.keys(window.localStorage).filter((key) => key.startsWith("peerly.draft.")),
    );
  await expect.poll(drafts).not.toHaveLength(0);

  // Sign out straight away, before the delayed autosave would have fired.
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page).toHaveURL(/\/$/);
  expect(await drafts(), "no ratings may be left for the next person").toHaveLength(0);

  // Signing in again finds the rating, from the server.
  await page.request.post("/api/auth/login", { data: { email, password: DEV_PASSWORD } });
  await page.goto("/student");
  await page
    .getByRole("link", { name: /start evaluation|continue/i })
    .first()
    .click();
  await expect(page.getByRole("radiogroup").first().getByRole("radio").nth(2)).toBeChecked();
});

/**
 * Work only this browser holds - changes to a submitted evaluation that were
 * never resubmitted - is not thrown away without asking.
 */
test("signing out with unsent changes asks before removing them", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:7331" });
  const page = await context.newPage();
  await page.request.post("/api/auth/login", {
    data: { email: "41200419@mynwu.ac.za", password: DEV_PASSWORD },
  });
  await page.goto("/student");
  await page.waitForLoadState("networkidle");

  // A reopened, not yet resubmitted evaluation, as the evaluation form leaves it.
  await page.evaluate(() =>
    window.localStorage.setItem(
      "peerly.draft.an-assessment.a-student",
      JSON.stringify({ entries: {}, reopenedAt: new Date().toISOString() }),
    ),
  );

  const signOut = page.getByRole("button", { name: "Sign out" }).first();
  await signOut.click();
  const dialog = page.getByRole("dialog", { name: /unsent changes/i });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "Go back" }).click();
  await expect(dialog).toBeHidden();
  expect((await page.request.get("/api/auth/me")).status(), "still signed in").toBe(200);

  await signOut.click();
  await page.getByRole("dialog").getByRole("button", { name: "Sign out anyway" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(
    await page.evaluate(() =>
      Object.keys(window.localStorage).filter((key) => key.startsWith("peerly.draft.")),
    ),
  ).toHaveLength(0);
});
