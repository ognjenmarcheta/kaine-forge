import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";

import { pool } from "./client";
import { withMigrationLock } from "./migrate.lock";

const directory = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(): Promise<void> {
  await withMigrationLock<PoolClient>(pool, (client) =>
    migrate(drizzle(client), {
      migrationsFolder: path.resolve(directory, "../drizzle")
    })
  );
}
