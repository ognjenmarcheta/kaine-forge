import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePostgres, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate as migratePostgres } from "drizzle-orm/node-postgres/migrator";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient } from "pg";

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../drizzle");

export interface TestDatabase {
  /** The raw PGlite client, for SQL a test runs outside Drizzle. */
  client: PGlite;
  db: PgliteDatabase;
  close: () => Promise<void>;
}

/**
 * In-process Postgres (PGlite) with every migration in `packages/db/drizzle`
 * applied. For tests only: it never reads `DATABASE_URL`. PGlite has one
 * connection, so it does not cover the pg pool or concurrency.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const client = new PGlite();
  const db = drizzle(client);
  await migrate(db, { migrationsFolder });
  return { client, db, close: () => client.close() };
}

/** One connection of a PostgresTestDatabase's pool, for a test's own transactions. */
export type PostgresTestClient = PoolClient;

export interface PostgresTestDatabase {
  /** The pool behind `db`, for tests that hold their own connections and transactions. */
  pool: Pool;
  db: NodePgDatabase;
  /** Ends the pool and drops the database. */
  close: () => Promise<void>;
}

/**
 * A new, empty database on a real Postgres with every migration applied, for
 * tests that need concurrent connections, which PGlite cannot give. It is
 * created through `adminUrl` and dropped on close. For tests only.
 */
export async function createPostgresTestDatabase(adminUrl: string): Promise<PostgresTestDatabase> {
  const name = `kaine_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: adminUrl, max: 1 });
  await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: url.toString(), max: 20 });
  const db = drizzlePostgres(pool);
  await migratePostgres(db, { migrationsFolder });
  return {
    pool,
    db,
    close: async () => {
      await pool.end();
      await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
      await admin.end();
    }
  };
}
