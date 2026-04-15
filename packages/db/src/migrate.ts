import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { db } from "./client";

const directory = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(): Promise<void> {
  await migrate(db, {
    migrationsFolder: path.resolve(directory, "../drizzle")
  });
}
