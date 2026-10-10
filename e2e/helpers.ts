import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import type { Page } from "@playwright/test";

export const DEV_PASSWORD = "peerly-dev-password";

/**
 * The seeded class, which holds the seeded assessments and submissions.
 *
 * Found by module code, never by "the first class with an assessment": the
 * lecturer journey creates a class whose code came from the clock and sorted
 * ahead of CMPG323 about three runs in ten, and every test that took the first
 * match then worked on the wrong class. The journey now sorts first on every
 * run, so this can't pass by luck.
 */
export const SEEDED_MODULE = "CMPG323";

export const seededClass = <T extends { klass: { moduleCode: string } }>(classes: T[]): T => {
  const found = classes.find((c) => c.klass.moduleCode === SEEDED_MODULE);
  if (!found)
    throw new Error(`The seeded class ${SEEDED_MODULE} is missing - reseed the database.`);
  return found;
};

export const ACCOUNTS = {
  lecturer: "anneke.vdmerwe@nwu.ac.za",
  admin: "riaan.botha@nwu.ac.za",
  student: "41200345@mynwu.ac.za",
};

/**
 * Every screen in each portal that needs no id in its path.
 *
 * Shared by the smoke specs and the accessibility audit, so a page added here
 * is both loaded and audited. Pages under an id (an assessment, an evaluation)
 * are reached by following the app's own links, in the specs that need them.
 */
export const LECTURER_PAGES = [
  "/lecturer",
  "/lecturer/classes",
  "/lecturer/classes/import",
  "/lecturer/groups",
  "/lecturer/groups/generate",
  "/lecturer/assessments",
  "/lecturer/assessments/new",
  "/lecturer/monitor",
  "/lecturer/matrix",
  "/lecturer/marks",
  "/lecturer/results",
  "/lecturer/export",
  "/lecturer/audit",
  "/lecturer/settings",
];

export const STUDENT_PAGES = ["/student", "/student/group", "/student/guide", "/student/settings"];

export const ADMIN_PAGES = [
  "/admin",
  "/admin/accounts",
  "/admin/rating-values",
  "/admin/audit",
  "/admin/settings",
];

/** Where each role's saved session cookie lives. */
export const storageStateFor = (role: string) =>
  join(dirname(fileURLToPath(import.meta.url)), `.auth/${role}.json`);

/** Collects console errors and failed requests while a page is driven. */
export function watchForProblems(page: Page) {
  const problems: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`uncaught: ${error.message}`));
  page.on("response", (response) => {
    // Anything the page asked the API for and did not get. 401 on /me is the
    // ordinary "nobody is signed in" answer and is not a problem.
    if (response.url().includes("/api/") && response.status() >= 400) {
      if (response.status() === 401 && response.url().endsWith("/auth/me")) return;
      problems.push(`${response.status()} ${new URL(response.url()).pathname}`);
    }
  });

  return problems;
}

/**
 * Hides the development role switcher for the duration of a test.
 *
 * It is a fixed widget in the bottom-right corner, which is exactly where the
 * panel footers put their primary action - so it intercepts clicks on
 * "Continue" and "Confirm". It is stripped from production builds entirely, so
 * hiding it here removes a development-only obstacle rather than papering over
 * something a real user would meet.
 */
export async function hideDevTools(page: Page) {
  // addInitScript rather than addStyleTag: the style has to survive every
  // navigation, and a tag added to one document goes with it.
  await page.addInitScript(() => {
    const hide = () => {
      const style = document.createElement("style");
      style.textContent = "[data-dev-role-switcher] { display: none !important; }";
      document.head.append(style);
    };
    if (document.head) hide();
    else document.addEventListener("DOMContentLoaded", hide);
  });
}
