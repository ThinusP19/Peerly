import { expect, test } from "@playwright/test";

import { hideDevTools } from "./helpers.ts";

/**
 * The account lifecycle an administrator is responsible for (FR-01).
 *
 * Creating a staff account, seeing it arrive unverified, deactivating it, and
 * being refused when the account is the last administrator. The last of those
 * is the one worth having: a system with nobody who can manage accounts cannot
 * be recovered from through the interface.
 */

const stamp = Date.now().toString().slice(-6);
const EMAIL = `journey.${stamp}@nwu.ac.za`;

test("an administrator creates a staff account, which arrives unverified", async ({ page }) => {
  test.setTimeout(90_000);
  await hideDevTools(page);

  await page.goto("/admin/accounts");
  await expect(page.getByRole("table")).toBeVisible();

  /* ------------------------------ create it -------------------------------- */
  await page.getByRole("button", { name: "Create account" }).first().click();
  const create = page.getByRole("dialog");
  await expect(create).toBeVisible();

  await create.getByLabel("First name").fill("Journey");
  await create.getByLabel("Surname").fill("Tester");
  await create.getByLabel(/email/i).fill(EMAIL);
  await create.getByRole("button", { name: /create account/i }).click();

  await expect(create).toBeHidden();

  // FR-03: it arrives unverified. Nobody sets a password for anybody - the
  // holder chooses one from the emailed link, so the administrator never knows
  // it and the account cannot be used until they do.
  const row = page.getByRole("row").filter({ hasText: EMAIL });
  await expect(row).toBeVisible();
  await expect(row.getByText(/unverified/i)).toBeVisible();

  /* ------------- activation is not the administrator's to perform ----------- */
  // Only the holder can activate the account, by using the link they were
  // emailed (FR-03). The menu used to offer "Activate account" anyway, and the
  // server's refusal was thrown away - so the dialog sat there having
  // apparently done nothing. The action is no longer offered.
  await row.getByRole("button").last().click();
  await expect(page.getByRole("menuitem", { name: "View / edit details" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /activate account/i })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await expect(
    page
      .getByRole("row")
      .filter({ hasText: EMAIL })
      .getByText(/unverified/i),
  ).toBeVisible();
});

test("an administrator deactivates an active staff account", async ({ page }) => {
  await hideDevTools(page);
  await page.goto("/admin/accounts");

  // A seeded lecturer who is active, and not the only administrator.
  const row = page.getByRole("row").filter({ hasText: "sipho.dlamini@nwu.ac.za" });
  await expect(row).toBeVisible();
  await expect(row.getByText(/active/i)).toBeVisible();

  await row.getByRole("button").last().click();
  await page.getByRole("menuitem", { name: "Deactivate account" }).click();

  const confirm = page.getByRole("dialog");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Deactivate account" }).click();
  await expect(confirm).toBeHidden();

  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "sipho.dlamini@nwu.ac.za" })
      .getByText(/deactivated/i),
  ).toBeVisible();

  // SR-05: deactivating ends their sessions, so they cannot sign in again.
  const attempt = await page.request.post("/api/auth/login", {
    data: { email: "sipho.dlamini@nwu.ac.za", password: "peerly-dev-password" },
    failOnStatusCode: false,
  });
  expect(attempt.status()).toBe(401);
});

test("the last administrator cannot lock everybody out", async ({ page }) => {
  await hideDevTools(page);

  // Only meaningful while there is exactly one active administrator, which is
  // what the seed provides.
  const accounts = await (await page.request.get("/api/accounts")).json();
  expect(accounts.activeAdmins, "the seed should have a single administrator").toBe(1);

  await page.goto("/admin/accounts");
  const self = page.getByRole("row").filter({ hasText: "riaan.botha@nwu.ac.za" });
  await expect(self).toBeVisible();

  await self.getByRole("button").last().click();
  await page.getByRole("menuitem", { name: /deactivate/i }).click();

  // Refused with an explanation rather than a disabled control with no reason.
  await expect(page.getByText(/can't be deactivated/i)).toBeVisible();
  await expect(page.getByText(/another system administrator/i)).toBeVisible();
});
