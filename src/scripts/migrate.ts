/**
 * Migration runner.
 *
 * Reads every *.sql file from database/migrations/ in filename order,
 * skips files already recorded in _migrations, and runs each one
 * inside a transaction using the DIRECT_URL (required for DDL on Neon).
 *
 * Idempotent: safe to run multiple times.
 */
import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "../../database/migrations");

async function main(): Promise<void> {
  const directUrl = process.env.DIRECT_URL;

  if (!directUrl) {
    throw new Error(
      "DIRECT_URL is missing from .env — set it to the Neon DIRECT (non-pooler) connection string.",
    );
  }

  const pool = new Pool({
    connectionString: directUrl,
    ssl: { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 15_000,
  });

  try {
    // Ensure the migration-tracking table exists (uses TEXT id, not INT).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id          TEXT PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .sort(); // lexicographic order matches 001_, 002_, … naming

    for (const file of files) {
      const migrationId = path.basename(file, ".sql");

      const { rowCount } = await pool.query(
        "SELECT id FROM _migrations WHERE id = $1",
        [migrationId],
      );

      if ((rowCount ?? 0) > 0) {
        console.log(`  skip  ${migrationId}`);
        continue;
      }

      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO _migrations (id) VALUES ($1)", [
          migrationId,
        ]);
        await client.query("COMMIT");
        console.log(`  apply ${migrationId}`);
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`  FAIL  ${migrationId}:`, err);
        throw err;
      } finally {
        client.release();
      }
    }

    console.log("Migrations complete.");
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error("Migration failed:", err);
  process.exitCode = 1;
});
