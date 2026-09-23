import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Rebuilds the development database before the suite runs.
 *
 * These tests change real data: a student submits, a lecturer imports a class
 * and confirms groups. Without a reset the second run starts from the first
 * run's leftovers - and the student journey, which needs somebody who has not
 * submitted, eventually finds nobody and fails for a reason that has nothing
 * to do with the application.
 *
 * The seed is deterministic, so every run starts from the same place.
 */
export default async function globalSetup() {
  const serverRoot = join(dirname(fileURLToPath(import.meta.url)), "../server");
  await run("npm", ["run", "seed"], { cwd: serverRoot });
  process.stdout.write("Reseeded peerly_dev for the browser tests.\n");
}
