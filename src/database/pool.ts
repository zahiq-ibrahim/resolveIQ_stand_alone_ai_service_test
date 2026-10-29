import pg from "pg";

const { Pool } = pg;

/**
 * Shared connection pool backed by the Neon POOLED URL.
 * All runtime database access (API + worker) must use this pool.
 * Do NOT open per-file `new Client()` connections.
 */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export type { PoolClient } from "pg";

/**
 * Runs `fn` inside a single Postgres transaction.
 * Automatically commits on success and rolls back on any thrown error.
 */
export async function withTx<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
