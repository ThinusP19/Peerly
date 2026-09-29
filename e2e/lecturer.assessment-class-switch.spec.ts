import { expect, test } from "@playwright/test";

import { seededClass } from "./helpers.ts";

test("creating an assessment after switching classes uses only the new class's groups", async ({
  page,
}) => {
  const classes = await (await page.request.get("/api/classes")).json();
  const firstClass = seededClass(classes.classes).klass;
  const secondClass = classes.classes.find(
    (row: { klass: { moduleCode: string } }) => row.klass.moduleCode === "CMPG315",
  )?.klass;
  expect(secondClass).toBeDefined();

  const secondGroups = await (
    await page.request.get(`/api/classes/${secondClass.id}/groups`)
  ).json();
  const secondGroupIds = secondGroups.groups.map((group: { id: string }) => group.id);
  expect(secondGroupIds.length).toBeGreaterThan(0);

  await page.goto("/lecturer/assessments/new");
  await page.locator("#context-class").click();
  await page.getByRole("option", { name: /CMPG323/ }).click();
  await expect(page.locator("#context-class")).toContainText(firstClass.moduleCode);
  await expect(page.getByRole("checkbox").first()).toBeVisible();

  await page.getByRole("checkbox").first().check();
  await page.getByLabel("Assessment name").fill("Class switch regression");

  await page.locator("#context-class").click();
  await page.getByRole("option", { name: /CMPG315/ }).click();
  await expect(page.locator("#context-class")).toContainText("CMPG315");
  await expect(page.getByRole("checkbox").first()).toBeVisible();
  await expect(page.getByRole("checkbox").first()).not.toBeChecked();
  await expect(page.getByLabel("Assessment name")).toHaveValue("Class switch regression");

  await page.getByRole("checkbox").first().check();
  await page.getByLabel("Opens").fill(new Date(Date.now() + 86_400_000).toISOString().slice(0, 16));
  await page
    .getByLabel(/closes/i)
    .fill(new Date(Date.now() + 172_800_000).toISOString().slice(0, 16));

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/assessments") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save as draft" }).click();
  const response = await responsePromise;
  expect(response.ok(), await response.text()).toBe(true);
  const { assessment } = await response.json();
  expect(assessment.classId).toBe(secondClass.id);
  expect(assessment.groupIds).toHaveLength(1);
  expect(secondGroupIds).toContain(assessment.groupIds[0]);
});
