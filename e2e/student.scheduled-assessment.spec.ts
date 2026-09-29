import { expect, request as playwrightRequest, test } from "@playwright/test";

import { DEV_PASSWORD, seededClass } from "./helpers.ts";

const BASE = "http://127.0.0.1:7331";
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

/**
 * An assessment opened before its opening time (#13, #14, #19).
 *
 * The lecturer may publish it early so students see it coming, but nobody can
 * rate anyone until the opening time: students see it under "Coming up", the
 * form says when it opens, the API refuses work, and the lecturer's list shows
 * when it opens rather than a bare "Open".
 */
test("an assessment opened early is coming up, not open, until its opening time", async ({
  browser,
}) => {
  const lecturer = await playwrightRequest.newContext({
    baseURL: BASE,
    extraHTTPHeaders: { Origin: BASE },
  });
  await lecturer.post("/api/auth/login", {
    data: { email: "anneke.vdmerwe@nwu.ac.za", password: DEV_PASSWORD },
  });
  const { classes } = await (await lecturer.get("/api/classes")).json();
  const klass = seededClass(classes).klass;
  const { groups } = await (await lecturer.get(`/api/classes/${klass.id}/groups`)).json();

  const name = `Scheduled check ${Date.now().toString().slice(-6)}`;
  const created = await lecturer.post("/api/assessments", {
    data: {
      classId: klass.id,
      name,
      description: "",
      groupIds: groups.map((g: { id: string }) => g.id),
      opensAt: inDays(2),
      closesAt: inDays(9),
      maxMark: 100,
    },
  });
  expect(created.status()).toBe(201);
  const { assessment } = await created.json();

  try {
    const opened = await lecturer.post(`/api/assessments/${assessment.id}/status`, {
      data: { transition: "open" },
    });
    expect(opened.status()).toBe(200);

    const context = await browser.newContext({ baseURL: BASE });
    const page = await context.newPage();
    await page.request.post("/api/auth/login", {
      data: { email: "41200419@mynwu.ac.za", password: DEV_PASSWORD },
    });

    // The student sees it coming, not as something to do now.
    await page.goto("/student");
    const row = page.locator("li", { hasText: name });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Opens");
    // Not offered as something to start now.
    await expect(row.getByRole("link", { name: /start evaluation/i })).toHaveCount(0);

    // The form says when it opens, and the API refuses work before then.
    await page.goto(`/student/evaluate/${assessment.id}`);
    await expect(page.getByText("This assessment isn't open yet")).toBeVisible();
    await expect(page.getByText(/It opens on/)).toBeVisible();
    const draft = await page.request.put(`/api/student/evaluations/${assessment.id}/draft`, {
      headers: { Origin: BASE },
      data: { entries: [] },
    });
    expect(draft.status()).toBe(409);
    expect((await draft.json()).error.message).toMatch(/opens on/);
    await context.close();

    // The lecturer sees when it opens, not a bare "Open".
    const lecturerPage = await browser.newPage({
      baseURL: BASE,
      storageState: await lecturer.storageState(),
    });
    await lecturerPage.goto(`/lecturer/assessments/${assessment.id}`);
    await expect(lecturerPage.getByText(/^Opens /).first()).toBeVisible();
    await lecturerPage.close();
  } finally {
    await lecturer.delete(`/api/assessments/${assessment.id}`);
    await lecturer.dispose();
  }
});
