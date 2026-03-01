import { createLogger } from "@repo/logger";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

config({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) });

const logger = createLogger({ name: "db-ensure" });

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be defined`);
  }
  return value;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function run(): Promise<void> {
  const databaseUrl = getRequiredEnv("DATABASE_URL");
  const targetUrl = new URL(databaseUrl);
  const databaseName = targetUrl.pathname.replace(/^\//, "");

  if (!databaseName) {
    throw new Error("DATABASE_URL must include a database name");
  }

  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";

  const pool = new Pool({ connectionString: adminUrl.toString() });

  try {
    const existingDatabase = await pool.query<{ exists: number }>(
      "select 1 as exists from pg_database where datname = $1",
      [databaseName]
    );

    if (existingDatabase.rowCount && existingDatabase.rows[0]?.exists === 1) {
      logger.info({ databaseName }, "database already exists");
      return;
    }

    await pool.query(`create database ${quoteIdentifier(databaseName)}`);
    logger.info({ databaseName }, "created database");
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "42P04") {
      logger.info({ databaseName }, "database already exists");
      return;
    }

    throw error;
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  logger.error({ err: error }, "db ensure failed");
  process.exitCode = 1;
});
