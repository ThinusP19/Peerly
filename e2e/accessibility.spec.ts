import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  request as playwrightRequest,
  test,
  type JSHandle,
  type Locator,
  type Page,
} from "@playwright/test";

import {
  ADMIN_PAGES,
  DEV_PASSWORD,
  LECTURER_PAGES,
  STUDENT_PAGES,
  hideDevTools,
  seededClass,
  storageStateFor,
} from "./helpers.ts";

/**
 * UI-04 and UR-09: WCAG 2.1 AA, audited and driven from the keyboard.
 *
 * Two halves. The audit runs axe over every screen in the three portals and
 * the public pages, and fails on any violation at all - an audit that tolerates
 * "only a few" is how a pass quietly becomes a fail. The keyboard half proves
 * what axe cannot: that a student can rate and submit without a mouse, that a
 * dialog holds focus and gives it back, that focus is visible, and that the
 * navigation can be skipped.
 *
 * Axe checks what is rendered, so each page is audited once it has settled -
 * after the boot preloader has lifted, and with the data on screen.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/** Pages outside the portals. /login needs an audience or it redirects. */
const PUBLIC_PAGES = [
  "/",
  "/login?as=student",
  "/login?as=lecturer",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/reset-password?token=expired",
  "/activate",
  "/activate?token=expired",
  "/no-such-page",
];

/** Waits for the full-screen preloader to lift, so axe sees the page itself. */
async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".preloader")).toHaveCount(0, { timeout: 15_000 });
}

/**
 * Waits for every running animation - a dialog's fade and zoom, a sheet's
 * slide - to finish.
 *
 * axe measures colours as they are painted at that instant. Mid-fade, a dialog's
 * text sits over a half-dark overlay and reads as a contrast failure that no
 * user ever sees once it has opened. It showed up only when the page happened
 * to be slower, so it passed alone and failed in the full suite.
 */
async function animationsFinished(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        // Only animations that end. A spinner or a skeleton's pulse repeats
        // forever, and waiting on it would never return.
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}

/** Runs axe over what is on screen and fails listing every violation. */
async function audit(page: Page, label: string) {
  await animationsFinished(page);
  const results = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    // The development role switcher is stripped from production builds
    // (DevRoleSwitcher.tsx), so it is not part of what anyone is served.
    .exclude("[data-dev-role-switcher]")
    .analyze();

  const found = results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact}, ${violation.nodes.length}): ${violation.help}\n` +
      violation.nodes
        .slice(0, 6)
        .map(
          (node) => `    ${node.target.join(" ")} - ${node.failureSummary?.split("\n")[1] ?? ""}`,
        )
        .join("\n"),
  );
  expect(found, `axe violations on ${label}`).toEqual([]);
}

async function visitAndAudit(page: Page, path: string) {
  await page.goto(path);
  await settle(page);
  await audit(page, path);
}

/** Presses Tab until `target` has focus, failing if it never does. */
async function tabTo(page: Page, target: Locator, limit = 60) {
  for (let i = 0; i < limit; i += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Tab never reached ${target}`);
}

/**
 * Walks the page by Tab and names every stop that showed no focus indicator.
 *
 * Each stop's outline and box-shadow are read while it has focus, then again
 * once focus has moved on: if nothing changed, focus was invisible there.
 * Tailwind's rings draw with box-shadow, the global :focus-visible with outline.
 */
async function focusStopsWithoutIndicator(page: Page, limit = 40) {
  const look = (element: Element) => {
    const style = getComputedStyle(element);
    return `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor} | ${style.boxShadow}`;
  };
  const unmarked: string[] = [];
  let previous: { handle: JSHandle<Element>; focused: string; name: string } | null = null;

  for (let i = 0; i < limit; i += 1) {
    await page.keyboard.press("Tab");
    if (previous && (await previous.handle.evaluate(look)) === previous.focused) {
      unmarked.push(previous.name);
    }
    const handle = await page.evaluateHandle(() => document.activeElement!);
    const name = await handle.evaluate(
      (element) =>
        `${element.tagName.toLowerCase()} "${(element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 40)}"`,
    );
    // Off the end of the page and into the browser's own chrome.
    if (name.startsWith("body")) break;
    previous = { handle, focused: await handle.evaluate(look), name };
  }
  return unmarked;
}

test.describe("axe: public pages", () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} has no WCAG 2.1 AA violations`, async ({ page }) => {
      await visitAndAudit(page, path);
    });
  }
});

test.describe("axe: lecturer portal", () => {
  test.use({ storageState: storageStateFor("lecturer") });

  for (const path of LECTURER_PAGES) {
    test(`${path} has no WCAG 2.1 AA violations`, async ({ page }) => {
      await visitAndAudit(page, path);
    });
  }

  // The assessment pages sit under an id, so take the first one the lecturer has.
  test("an assessment's detail and edit pages have no violations", async ({ page }) => {
    const { classes } = await (await page.request.get("/api/classes")).json();
    const withAssessment = seededClass(classes);
    const { assessments } = await (
      await page.request.get(`/api/classes/${withAssessment.klass.id}/assessments`)
    ).json();
    const id = assessments[0].assessment.id;

    await visitAndAudit(page, `/lecturer/assessments/${id}`);
    await visitAndAudit(page, `/lecturer/assessments/${id}/edit`);
  });

  // Below lg the sidebar folds into a sheet behind a menu button.
  test("the shell at phone width has no violations, menu open or closed", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await visitAndAudit(page, "/lecturer/classes");
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await audit(page, "/lecturer/classes with the navigation sheet open");
  });
});

test.describe("axe: admin portal", () => {
  test.use({ storageState: storageStateFor("admin") });

  for (const path of ADMIN_PAGES) {
    test(`${path} has no WCAG 2.1 AA violations`, async ({ page }) => {
      await visitAndAudit(page, path);
    });
  }
});

test.describe("axe: student portal", () => {
  test.use({ storageState: storageStateFor("student") });

  for (const path of STUDENT_PAGES) {
    test(`${path} has no WCAG 2.1 AA violations`, async ({ page }) => {
      await visitAndAudit(page, path);
    });
  }

  // The Student Portal is built for phones first (UI-02), and below lg its
  // navigation is a different element - a bottom tab bar.
  for (const path of STUDENT_PAGES) {
    test(`${path} at phone width has no violations`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 780 });
      await visitAndAudit(page, path);
    });
  }
});

test.describe("keyboard", () => {
  test.beforeEach(async ({ page }) => {
    await hideDevTools(page);
  });

  test.describe("signed in as a lecturer", () => {
    test.use({ storageState: storageStateFor("lecturer") });

    test("a skip link is the first stop and moves focus to the page content", async ({ page }) => {
      await page.goto("/lecturer/classes");
      await settle(page);

      await page.keyboard.press("Tab");
      const skip = page.getByRole("link", { name: /skip to main content/i });
      await expect(skip).toBeFocused();
      await expect(skip).toBeVisible();

      await page.keyboard.press("Enter");
      await expect(page.locator("main")).toBeFocused();
    });

    test("every focusable control shows a visible focus indicator", async ({ page }) => {
      await page.goto("/lecturer/classes");
      await settle(page);
      expect(await focusStopsWithoutIndicator(page), "focus stops with no indicator").toEqual([]);
    });

    test("a dialog traps focus, closes on Escape and returns focus", async ({ page }) => {
      await page.goto("/lecturer/classes");
      await settle(page);

      const opener = page.getByRole("button", { name: "New class" });
      await tabTo(page, opener);
      await page.keyboard.press("Enter");

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await audit(page, "the New class dialog");

      // However far Tab goes, focus never leaves the dialog.
      for (let i = 0; i < 15; i += 1) {
        await page.keyboard.press("Tab");
        expect(
          await dialog.evaluate((element) => element.contains(document.activeElement)),
          "focus stayed inside the dialog",
        ).toBe(true);
      }
      await page.keyboard.press("Shift+Tab");
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
        true,
      );

      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(opener).toBeFocused();
    });

    test("menus open from the keyboard and close on Escape", async ({ page }) => {
      await page.goto("/lecturer");
      await settle(page);

      const trigger = page.getByRole("button", { name: /open account menu/i });
      await tabTo(page, trigger);
      await page.keyboard.press("Enter");
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      await expect(menu.getByRole("menuitem", { name: "Sign out" })).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect(trigger).toBeFocused();
    });
  });

  test.describe("as a student", () => {
    test.use({ storageState: storageStateFor("student") });

    test("the student shell has a skip link too", async ({ page }) => {
      await page.goto("/student");
      await settle(page);

      await page.keyboard.press("Tab");
      const skip = page.getByRole("link", { name: /skip to main content/i });
      await expect(skip).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.locator("main")).toBeFocused();
    });
  });

  // UR-09's own example: the whole rating flow, keyboard only, audited at every
  // step. It takes the last outstanding student so the student journey spec,
  // which takes the first, still finds someone who has not submitted.
  test("a student completes and submits an evaluation with the keyboard alone", async ({
    browser,
  }) => {
    const lecturer = await playwrightRequest.newContext({ baseURL: "http://127.0.0.1:7331" });
    await lecturer.post("/api/auth/login", {
      data: { email: "anneke.vdmerwe@nwu.ac.za", password: DEV_PASSWORD },
    });
    const { classes } = await (await lecturer.get("/api/classes")).json();
    const withOpen = seededClass(classes);
    const { assessments } = await (
      await lecturer.get(`/api/classes/${withOpen.klass.id}/assessments`)
    ).json();
    const open = assessments.find(
      (r: { assessment: { status: string } }) => r.assessment.status === "open",
    );
    const { progress } = await (
      await lecturer.get(`/api/assessments/${open.assessment.id}/progress`)
    ).json();
    const outstanding = progress
      .flatMap((g: { outstanding: Array<{ studentNumber: string }> }) => g.outstanding)
      .at(-1);
    expect(outstanding, "the seed should leave someone outstanding").toBeTruthy();
    await lecturer.dispose();

    const context = await browser.newContext({ baseURL: "http://127.0.0.1:7331" });
    const page = await context.newPage();
    await hideDevTools(page);
    await page.request.post("/api/auth/login", {
      data: { email: `${outstanding.studentNumber}@mynwu.ac.za`, password: DEV_PASSWORD },
    });

    await page.goto(`/student/evaluate/${open.assessment.id}`);
    await settle(page);
    await expect
      .poll(() => page.getByRole("radiogroup").count(), {
        message: "waiting for every peer's rating scale to render",
      })
      .toBeGreaterThan(1);
    await audit(page, "the evaluation form");
    expect(
      await focusStopsWithoutIndicator(page, 80),
      "focus stops on the form with no indicator",
    ).toEqual([]);
    // Start the rating itself from the top of the page again.
    await page.reload();
    await settle(page);

    // Tab into each peer's scale, then pick with the arrow keys - the pattern a
    // radio group is meant to be used with.
    const groups = page.getByRole("radiogroup");
    const peerCount = await groups.count();
    for (let i = 0; i < peerCount; i += 1) {
      const group = groups.nth(i);
      await tabTo(page, group.getByRole("radio").first());
      // Held briefly, as a finger does. Radix selects the radio that focus
      // arrives on only while the arrow key is still down, and moves focus on
      // a timeout - an instant synthetic press is released before it lands.
      await page.keyboard.press("ArrowDown", { delay: 50 });
      await expect(group.getByRole("radio", { checked: true })).toHaveCount(1);
    }
    await expect(
      page.getByText(new RegExp(`${peerCount} of ${peerCount} rated`, "i")),
    ).toBeVisible();

    const review = page.getByRole("link", { name: /review your ratings/i });
    await tabTo(page, review);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/review$/);
    await settle(page);
    await audit(page, "the review page");

    const submit = page.getByRole("button", { name: /submit/i }).first();
    await expect(submit).toBeEnabled();
    await tabTo(page, submit);
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/submitted$/);
    await settle(page);
    await audit(page, "the confirmation page");

    await context.close();
  });
});
