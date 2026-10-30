import { createLogger } from "@repo/logger";

import { pool } from "../client";
import { SYNC_TRIGGERS_SQL } from "../sync.triggers";

const logger = createLogger({ name: "db-sync-triggers" });

// Runs after `drizzle-kit push`; see sync.triggers.ts.
async function run(): Promise<void> {
  await pool.query(SYNC_TRIGGERS_SQL);
  await pool.end();
}

run().catch(async (error) => {
  logger.error({ err: error }, "installing the sync triggers failed");
  await pool.end();
  process.exitCode = 1;
});
