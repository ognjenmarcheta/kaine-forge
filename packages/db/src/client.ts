import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

config({ path: "../../.env" });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL must be defined");
}

const pool = new Pool({
  connectionString: databaseUrl
});

export const db = drizzle(pool);
export { pool };
