import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { env } from "../config/env.ts";
import { closePool, pool, withTransaction } from "./pool.ts";

/**
 * Versioned SQL migrations (OR-21): any environment can be rebuilt to a known
 * state from the repository alone. Each file runs once, inside its own
 * transaction, and its checksum is recorded - so an already-applied migration
 * that is later edited is reported rather than silently ignored.
 */

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../../migrations");

const checksum = (contents: string) => createHash("sha256").update(contents).digest("hex");

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     text PRIMARY KEY,
      checksum    text        NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function readMigrations() {
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  return Promise.all(
    files.map(async (file) => {
      const contents = await readFile(join(migrationsDir, file), "utf8");
      return { version: file.replace(/\.sql$/, ""), file, contents, checksum: checksum(contents) };
    }),
  );
}

async function applied() {
  const { rows } = await pool.query<{ version: string; checksum: string }>(
    "SELECT version, checksum FROM schema_migrations",
  );
  return new Map(rows.map((row) => [row.version, row.checksum]));
}

async function up() {
  await ensureMigrationsTable();
  const migrations = await readMigrations();
  const done = await applied();

  let ran = 0;
  for (const migration of migrations) {
    const previous = done.get(migration.version);

    if (previous && previous !== migration.checksum) {
      throw new Error(
        `Migration ${migration.file} has already been applied but its contents have changed.\n` +
          `Migrations are immutable once applied - add a new migration instead of editing this one.`,
      );
    }
    if (previous) continue;

    await withTransaction(async (sql) => {
      await sql.query(migration.contents);
      await sql.query("INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)", [
        migration.version,
        migration.checksum,
      ]);
    });

    console.log(`  applied  ${migration.file}`);
    ran += 1;
  }

  console.log(ran === 0 ? "Database is up to date." : `Applied ${ran} migration(s).`);
}

async function status() {
  await ensureMigrationsTable();
  const migrations = await readMigrations();
  const done = await applied();

  for (const migration of migrations) {
    const previous = done.get(migration.version);
    const state = !previous
      ? "PENDING"
      : previous === migration.checksum
        ? "applied"
        : "CHANGED SINCE APPLIED";
    console.log(`  ${state.padEnd(22)} ${migration.file}`);
  }
}

/** Destructive: drops and recreates the public schema. Development only. */
async function reset() {
  const name = env.databaseUrl.split("/").pop()?.split("?")[0] ?? "";
  if (env.isProduction || !/(_dev|_test)$/.test(name)) {
    throw new Error(
      `Refusing to reset "${name}". Reset only runs against a database whose name ends in _dev or _test, and never in production.`,
    );
  }
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  console.log(`Dropped and recreated the public schema of ${name}.`);
  await up();
}

const commands = { up, status, reset } as const;
const command = (process.argv[2] ?? "up") as keyof typeof commands;

if (!(command in commands)) {
  console.error(`Unknown command "${command}". Use one of: ${Object.keys(commands).join(", ")}`);
  process.exit(1);
}

try {
  await commands[command]();
} catch (error) {
  console.error(`\nMigration failed: ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await closePool();
}
