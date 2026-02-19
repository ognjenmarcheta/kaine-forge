import { config } from "dotenv";
import { Pool } from "pg";

config({ path: "../../.env" });

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
      console.log(`database "${databaseName}" already exists`);
      return;
    }

    await pool.query(`create database ${quoteIdentifier(databaseName)}`);
    console.log(`created database "${databaseName}"`);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "42P04") {
      console.log(`database "${databaseName}" already exists`);
      return;
    }

    throw error;
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error("db ensure failed", error);
  process.exitCode = 1;
});
