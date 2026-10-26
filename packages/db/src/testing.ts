import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
