import { expect, test } from "@playwright/test";

import { ACCOUNTS, DEV_PASSWORD } from "./helpers.ts";

/**
 * Administrators have their own quiet door on the welcome page. It changes the
 * form's wording only - the portal still comes from the account's role - so
 * this follows it all the way into the Admin Portal.
 */
test("an administrator signs in through their own link and lands in the Admin Portal", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: /I.m an administrator/ }).click();

  await expect(page).toHaveURL(/\/login\?as=admin/);
  await expect(page.getByRole("heading", { name: "Administrator sign in" })).toBeVisible();
  await expect(
    page.getByText("Administrator accounts are set up by another administrator."),
  ).toBeVisible();

  // Forgot password keeps the door, so "Back to sign in" returns here.
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password\?as=admin/);
  await page.goBack();

  await page.getByLabel("Email address").fill(ACCOUNTS.admin);
  await page.getByRole("textbox", { name: /^Password/ }).fill(DEV_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page).toHaveURL(/\/admin$/);
});

test("an administrator on the lecturer form is refused and pointed to their own", async ({
  page,
}) => {
  await page.goto("/login?as=lecturer");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email address").fill(ACCOUNTS.admin);
  await page.getByRole("textbox", { name: /^Password/ }).fill(DEV_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(
    page.getByText("This is an administrator account. Use the administrator sign-in."),
  ).toBeVisible();
  // Refused means refused: no session was created.
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);

  await page.getByRole("link", { name: "Go to administrator sign in" }).click();
  await expect(page).toHaveURL(/\/login\?as=admin/);
});
