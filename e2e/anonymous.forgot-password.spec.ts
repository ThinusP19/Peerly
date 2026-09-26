import { expect, test } from "@playwright/test";

/**
 * The prototype offered an "Open the reset link" button here, pointing at a
 * demo token. On a real system that is a trap: a student who clicks it instead
 * of opening their email lands on "This reset link has expired". The only way
 * forward from this screen must be the email itself.
 */
test("after asking for a reset link, the screen points to the email and nowhere else", async ({
  page,
}) => {
  await page.goto("/forgot-password?as=student");
  // Typing before the page hydrates is lost when React takes over the field.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email address").fill("nobody.at.all@mynwu.ac.za");
  await page.getByRole("button", { name: "Send reset link" }).click();

  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the reset link" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Back to sign in" })).toHaveAttribute(
    "href",
    "/login?as=student",
  );
});
