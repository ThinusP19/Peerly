import { expect, test } from "@playwright/test";

import { LECTURER_PAGES, watchForProblems } from "./helpers.ts";

/**
 * Every lecturer screen, loaded as a person would load it.
 *
 * Deliberately shallow: it asserts that a page renders and makes no failing API
 * call. A page that quietly asks for a stale id and gets a 400 passes every
 * server test and fails here, which is why this file exists.
 */

for (const path of LECTURER_PAGES) {
  test(`${path} loads without errors`, async ({ page }) => {
    const problems = watchForProblems(page);

    await page.goto(path);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("main, [role=main]").first()).toBeVisible();
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);

    expect(problems, `problems on ${path}`).toEqual([]);
  });
}
