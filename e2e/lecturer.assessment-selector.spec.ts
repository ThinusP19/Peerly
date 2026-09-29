import { expect, test } from "@playwright/test";

import { seededClass } from "./helpers.ts";

test("assessment header selectors follow the assessment page being viewed", async ({ page }) => {
  const classes = (await (await page.request.get("/api/classes")).json()).classes;
  const withAssessments = seededClass(classes).klass;
  const otherClass = classes.find(
    (row: { klass: { moduleCode: string } }) => row.klass.moduleCode === "CMPG315",
  )?.klass;
  expect(otherClass).toBeDefined();

  const emptyClassResponse = await page.request.post("/api/classes", {
    data: {
      moduleCode: "SWCH001",
      name: "Selector Empty Class",
      academicPeriod: "2026 Semester 2",
    },
  });
  expect(emptyClassResponse.ok(), await emptyClassResponse.text()).toBe(true);

  const assessmentRows = (
    await (await page.request.get(`/api/classes/${withAssessments.id}/assessments`)).json()
  ).assessments;
  const first = assessmentRows[0].assessment;
  const second = assessmentRows[1].assessment;
  expect(second).toBeDefined();

  await page.goto("/lecturer/assessments");
  await expect(page.locator("#context-class")).toBeVisible();
  await expect(page.locator("#context-assessment")).toHaveCount(0);

  await page.goto("/lecturer/assessments/new");
  await expect(page.locator("#context-class")).toBeVisible();
  await expect(page.locator("#context-assessment")).toHaveCount(0);

  await page.goto(`/lecturer/assessments/${first.id}`);
  await expect(page.getByRole("heading", { name: first.name, exact: true })).toBeVisible();
  await page.locator("#context-assessment").click();
  await page.getByRole("option", { name: second.name, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/lecturer/assessments/${second.id}$`));
  await expect(page.getByRole("heading", { name: second.name, exact: true })).toBeVisible();

  // A class with no assessments falls back to its overview.
  await page.locator("#context-class").click();
  await page.getByRole("option", { name: /SWCH001/ }).click();
  await expect(page).toHaveURL(/\/lecturer\/assessments\/?$/);
  await expect(page.locator("#context-class")).toContainText("SWCH001");
  await expect(page.locator("#context-assessment")).toHaveCount(0);

  const groups = (await (await page.request.get(`/api/classes/${otherClass.id}/groups`)).json())
    .groups;
  const createdResponse = await page.request.post("/api/assessments", {
    data: {
      classId: otherClass.id,
      name: "Selector navigation test",
      description: "",
      groupIds: [groups[0].id],
      opensAt: new Date(Date.now() + 86_400_000).toISOString(),
      closesAt: new Date(Date.now() + 172_800_000).toISOString(),
      maxMark: 100,
    },
  });
  expect(createdResponse.ok(), await createdResponse.text()).toBe(true);
  const created = (await createdResponse.json()).assessment;

  await page.goto(`/lecturer/assessments/${created.id}`);
  await expect(page.getByRole("heading", { name: created.name, exact: true })).toBeVisible();
  await page.locator("#context-class").click();
  await page.getByRole("option", { name: /CMPG323/ }).click();
  await expect(page).toHaveURL(new RegExp(`/lecturer/assessments/${first.id}$`));
  await expect(page.locator("#context-class")).toContainText("CMPG323");
  await expect(page.getByRole("heading", { name: first.name, exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Edit setup" }).click();
  await expect(page).toHaveURL(new RegExp(`/lecturer/assessments/${first.id}/edit$`));
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#context-assessment").click();
  await page.getByRole("option", { name: second.name, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/lecturer/assessments/${second.id}$`));
});
