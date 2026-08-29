import pg from "pg";

import { env } from "../config/env.ts";

const { Pool, types } = pg;

// numeric/decimal arrives as a string by default so precision is not lost through
// a float. Marks matter, so parse deliberately at the point of use instead of
// letting the driver silently coerce. NUMERIC = OID 1700.
types.setTypeParser(1700, (value) => value);

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (error) => {
  // A pooled client can drop while idle; log it rather than taking the process
  // down, since the pool will make a fresh connection on the next query.
  console.error("[db] idle client error:", error.message);
});

export type Sql = Pick<pg.PoolClient, "query">;

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as never[]);
}

/**
 * Runs `fn` inside a single transaction, so a multi-record operation — a class
 * list commit, a group confirmation, a submission, a calculation run — either
 * lands whole or not at all (OR-05).
 */
export async function withTransaction<T>(fn: (sql: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool() {
  await pool.end();
}
