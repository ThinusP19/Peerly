import { defineConfig } from "vitest/config";

/**
 * The API's own test config.
 *
 * It has to exist even though it is nearly empty: without it, vitest walks up
 * out of `server/` and loads the web app's config at the repository root, which
 * imports plugins that are not - and should not be - among the API's
 * dependencies. The failure that produces names `vitest/config` as unresolved,
 * which points at the wrong package entirely.
 *
 * No tsconfig-paths plugin here on purpose: the API uses relative imports with
 * explicit `.ts` extensions, not the `@/` alias the front end uses.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],

    // Brings the test database up to the current schema before anything runs.
    globalSetup: ["src/test/global-setup.ts"],

    // Set before `config/env.ts` calls dotenv, which does not overwrite what is
    // already in the environment - so this wins and the tests can never be
    // pointed at the development database by a stray .env.
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env["TEST_DATABASE_URL"] ?? "postgres://localhost:5432/peerly_test",
    },

    // One database, shared. Test files truncate between cases, so two running
    // at once would clear each other's rows mid-flight.
    fileParallelism: false,

    // The default 5s is too tight for a case that hashes a password and
    // truncates every table, particularly on a cold database or a loaded CI
    // box. More than a generous ceiling, though, and a genuinely stuck test
    // stops looking stuck.
    testTimeout: 20_000,

    // Bounds the damage when a test does time out. Its query is still holding a
    // pool client, so closePool() in afterAll waits on it - without this, one
    // 20s timeout turned into a ten-minute run that looked like a hang.
    teardownTimeout: 15_000,
  },
});
