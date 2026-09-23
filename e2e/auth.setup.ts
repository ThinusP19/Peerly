import { existsSync } from "node:fs";

import { request, test as setup } from "@playwright/test";

import { ACCOUNTS, DEV_PASSWORD, storageStateFor } from "./helpers.ts";

/**
 * Signs in once per role and saves the session cookie for the suite.
 *
 * It reuses a saved session when that session still works, and only signs in
 * again when it does not. Signing in on every run tripped CI-07's rate limit
 * after a handful of iterations and made a working application look broken -
 * which is the limiter doing its job, not a fault to design around. Reusing a
 * live session is also what a person does: they sign in once and keep working.
 */
for (const [role, email] of Object.entries(ACCOUNTS)) {
  setup(`sign in as ${role}`, async ({ page }) => {
    const path = storageStateFor(role);

    // A reseed drops every session row, so a saved cookie may name an account
    // that no longer exists. The check below is what catches that.
    if (existsSync(path)) {
      const context = await request.newContext({
        baseURL: "http://127.0.0.1:7331",
        storageState: path,
      });
      const stillValid = (await context.get("/api/auth/me")).ok();
      await context.dispose();
      if (stillValid) return;
    }

    const response = await page.request.post("/api/auth/login", {
      data: { email, password: DEV_PASSWORD },
    });
    if (!response.ok()) {
      throw new Error(
        `Could not sign in as ${email}: ${response.status()} ${await response.text()}`,
      );
    }
    await page.context().storageState({ path });
  });
}
