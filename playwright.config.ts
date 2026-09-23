import { defineConfig } from "@playwright/test";

/**
 * Browser tests against the real application.
 *
 * No mocking and no fixtures: these sign in through the API, against a seeded
 * PostgreSQL database, and drive the same pages a person would. That is the
 * point - every requirement in this project was verified at the HTTP layer or
 * in a unit test, and the one class of bug none of those could catch was a
 * screen still reading fixtures while its endpoints worked perfectly.
 *
 * Locally, both servers must already be running (`npm run dev` here and in
 * `server/`). In CI (process.env.CI is set) Playwright starts them itself - see
 * `webServer` below and .github/workflows/ci.yml.
 */
const isCI = !!process.env["CI"];

export default defineConfig({
  testDir: "./e2e",

  // Rebuilds the database first: these tests write, so each run needs the same
  // starting point. See e2e/global-setup.ts.
  globalSetup: "./e2e/global-setup.ts",
  // Serially: these share one database, and a test that regroups a class would
  // otherwise race one reading its groups.
  workers: 1,
  fullyParallel: false,
  // CI also writes the HTML report, which the workflow uploads when a run fails.
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "lecturer",
      dependencies: ["setup"],
      use: { storageState: "e2e/.auth/lecturer.json" },
      testMatch: /lecturer\./,
    },
    {
      name: "student",
      dependencies: ["setup"],
      use: { storageState: "e2e/.auth/student.json" },
      testMatch: /student\./,
    },
    {
      name: "admin",
      dependencies: ["setup"],
      use: { storageState: "e2e/.auth/admin.json" },
      testMatch: /admin\./,
    },
    { name: "anonymous", dependencies: ["setup"], testMatch: /anonymous\./ },
    // Spans every role, so it sets each describe block's session itself
    // rather than taking one from the project.
    { name: "accessibility", dependencies: ["setup"], testMatch: /accessibility\./ },
  ],

  use: {
    baseURL: "http://127.0.0.1:7331",
    // Screenshots and traces only when something fails, so a green run leaves
    // nothing behind.
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },

  // CI only: start the API and the web app for the run. The database settings
  // come from the workflow's environment (a throwaway Postgres service), and the
  // schema is migrated before Playwright starts. Locally this is undefined, so
  // nothing changes: you keep running both servers yourself.
  webServer: isCI
    ? [
        {
          command: "npm start",
          cwd: "server",
          url: "http://localhost:4000/health",
          timeout: 120_000,
          stdout: "pipe",
          stderr: "pipe",
        },
        {
          command: "npm run dev",
          url: "http://127.0.0.1:7331",
          timeout: 120_000,
          stdout: "ignore",
          stderr: "pipe",
        },
      ]
    : undefined,
});
