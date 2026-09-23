import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Brings the test database up to the current schema once, before any test file
 * runs.
 *
 * It shells out to the real migration runner rather than importing it: that
 * module executes its command at import time, so importing it would run a
 * migration as a side effect of loading the file. Shelling out also means the
 * tests exercise the same path a developer does, so a migration that only works
 * when invoked one particular way cannot pass here and fail there.
 */
export async function setup() {
  const serverRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

  const { stdout } = await run("npx", ["tsx", "src/db/migrate.ts", "up"], {
    cwd: serverRoot,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl(), NODE_ENV: "test" },
  });

  // Only worth showing when it actually did something.
  if (!stdout.includes("up to date")) process.stdout.write(stdout);
}

export const testDatabaseUrl = () =>
  process.env["TEST_DATABASE_URL"] ?? "postgres://localhost:5432/peerly_test";
