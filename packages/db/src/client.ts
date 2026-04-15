import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL must be defined");
}

function resolveSslConfig(connectionString: string): { rejectUnauthorized: boolean } | undefined {
  try {
    const url = new URL(connectionString);
    const sslMode = url.searchParams.get("sslmode")?.toLowerCase();

    if (!sslMode || sslMode === "disable") {
      return undefined;
    }

    return {
      rejectUnauthorized: sslMode === "verify-ca" || sslMode === "verify-full"
    };
  } catch {
    return undefined;
  }
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: resolveSslConfig(databaseUrl)
});

export const db = drizzle(pool);
export { pool };
