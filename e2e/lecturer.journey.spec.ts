import { expect, test } from "@playwright/test";

import { hideDevTools } from "./helpers.ts";

/**
 * A lecturer sets a class up and runs an assessment, through the interface.
 *
 * One test rather than several, because each step needs what the one before it
 * produced: there is no class to import into until one is created, and nothing
 * to calculate until marks are entered. Splitting it would mean either fixtures
 * or hidden ordering between tests.
 *
 * Waits are on elements. Navigation is client-side, so the network can be quiet
 * while the previous screen is still on display.
 */

const stamp = Date.now().toString().slice(-6);
// Unique per run: module code and academic period are unique together, so a
// short suffix collides across runs and the second create is refused with a
// 409 - which looked like the navigation failing.
// Four letters and three digits, as the form requires. The leading 0 makes it
// sort ahead of the seeded CMPG323 on every run, so a test that picks "the
// first class" instead of the seeded one fails every time rather than three
// runs in ten. See `seededClass` in helpers.ts.
const MODULE_CODE = `CMPG0${stamp.slice(-2)}`;

/**
 * Students who already hold Peerly accounts, from the seed.
 *
 * This matters: FR-04 matches an imported row to an account by student number,
 * and a row with no account stays unmatched - which is correct, and means it
 * cannot be put in a group. Inventing numbers produced a class of four
 * unmatched students that could not be grouped at all, which is the rule
 * working rather than a fault. A student may belong to several classes, so
 * enrolling seeded students in a new one is legitimate.
 *
 * The names must be the accounts' own names too: FR-04 sets Conflict, not
 * Matched, when a number is held by an account whose name differs from the
 * list - the impersonation case - and a conflicting row cannot be grouped.
 *
 * The last row is deliberately invalid, to prove FR-09 reports it by row.
 */
const REGISTERED = [
  ["41200345", "Lerato", "Mokoena"],
  ["41200382", "Thandi", "Nkosi"],
  ["41200419", "Johan", "Pretorius"],
  ["41200456", "Aisha", "Patel"],
];

const CSV = [
  "Student Number,Name,Surname,Email",
  ...REGISTERED.map(([n, name, surname]) => `${n},${name},${surname},${n}@mynwu.ac.za`),
  "not-a-number,Broken,Row,bad@mynwu.ac.za",
].join("\n");

test("a lecturer creates a class, imports a list, groups it and runs an assessment", async ({
  page,
}) => {
  test.setTimeout(120_000);

  /* ---------------------------- create the class --------------------------- */
  // Before the first navigation, so it applies to every page in the journey.
  await hideDevTools(page);
  await page.goto("/lecturer/classes");
  await page
    .getByRole("button", { name: /create class|new class/i })
    .first()
    .click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // The academic period is a select that already defaults to the current one,
  // so only the two free-text fields need filling.
  await dialog.getByPlaceholder("CMPG323").fill(MODULE_CODE);
  await dialog.getByLabel("Class name").fill("Journey Test Module");
  await dialog.getByRole("button", { name: /create/i }).click();

  // Surface why, rather than only that the navigation did not happen.
  const dialogError = dialog.getByText(/already exists|couldn't create/i);
  if (await dialogError.count()) {
    throw new Error(`Creating the class was refused: ${await dialogError.first().innerText()}`);
  }

  // Creating a class lands on the import screen.
  await expect(page).toHaveURL(/\/lecturer\/classes\/import/);

  /* ------------------------------ import a list ---------------------------- */
  await page.setInputFiles('input[type="file"]', {
    name: "class-list.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(CSV),
  });

  // The server reads the file and reports its columns (SI-04). The button is
  // only enabled once that has come back.
  const continueButton = page.getByRole("button", { name: "Continue", exact: true });
  await expect(continueButton).toBeEnabled();
  await continueButton.click();

  // Wait for the step itself, not just for any Continue button: both steps have
  // one, and clicking the old one mid-transition waits forever for an element
  // that is on its way out.
  await expect(page.getByRole("heading", { name: /confirm the columns/i })).toBeVisible();
  await expect(page.getByText("Student Number", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Continue", exact: true }).click();

  // FR-09: four good rows and the deliberately broken one, reported by row.
  await expect(page.getByRole("heading", { name: /check the rows/i })).toBeVisible();
  await expect(page.getByText(/not an 8-digit student number/i).first()).toBeVisible();

  // The button names the count, and stays disabled while nothing is valid.
  const importButton = page.getByRole("button", { name: /^import \d+ student/i });
  await expect(importButton).toBeEnabled();
  await importButton.click();

  // ConfirmDialog is built on Dialog rather than AlertDialog, so it is a
  // "dialog" - the comment in that component explains why.
  const confirm = page.getByRole("dialog");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: /import class list/i }).click();

  await expect(page).toHaveURL(/\/lecturer\/classes$/);
  await expect(page.getByText(REGISTERED[0]![0]!).first()).toBeVisible();

  /* ------------------------------- make groups ----------------------------- */
  await page.goto("/lecturer/groups/generate");
  await expect(page.getByRole("button", { name: /generate groups/i })).toBeVisible();

  // The radio that chooses the mode and the number field share that wording,
  // so target the number input by role.
  await page.getByRole("spinbutton").first().fill("2");
  await page.getByRole("button", { name: /generate groups/i }).click();

  // Four matched students into two groups.
  await expect(page.getByText(/group 1/i).first()).toBeVisible();
  await page
    .getByRole("button", { name: /confirm/i })
    .first()
    .click();
  const groupConfirm = page.getByRole("dialog");
  if (await groupConfirm.count()) {
    await groupConfirm
      .getByRole("button", { name: /confirm/i })
      .last()
      .click();
  }
  await expect(page.getByText(/2 groups|group 2/i).first()).toBeVisible();

  /* ---------------------------- create an assessment ----------------------- */
  await page.goto("/lecturer/assessments/new");
  await expect(page.getByLabel("Assessment name")).toBeVisible();
  await page.getByLabel("Assessment name").fill("Journey Assessment");
  await page.getByLabel(/description/i).fill("Created by the browser journey test.");

  // FR-12: the closing time must be after the opening one, so both are set
  // rather than relying on whatever the form defaults to.
  await page.getByLabel("Opens").fill("2026-10-01T08:00");
  await page.getByLabel(/closes/i).fill("2026-10-14T20:00");

  // Every group takes part.
  for (const box of await page.getByRole("checkbox").all()) {
    if (!(await box.isChecked())) await box.check();
  }

  await page
    .getByRole("button", { name: /create assessment|save/i })
    .first()
    .click();

  // FR-13: it lands as a draft; activation is a separate, deliberate act.
  await expect(page).toHaveURL(/\/lecturer\/assessments\/[0-9a-f-]{36}/);
  await expect(page.getByText("Journey Assessment").first()).toBeVisible();
  await expect(page.getByText(/draft/i).first()).toBeVisible();

  /* ------------------------------- activate it ----------------------------- */
  await page.getByRole("button", { name: "Open to students" }).click();
  const activate = page.getByRole("dialog");
  await expect(activate).toBeVisible();
  await activate.getByRole("button", { name: "Open assessment" }).click();

  // Once open, the draft action is replaced by the closing one.
  await expect(page.getByRole("button", { name: /close/i }).first()).toBeVisible();
});
