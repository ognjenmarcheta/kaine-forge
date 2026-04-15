import { pool } from "@repo/db/client";
import { runMigrations } from "@repo/db/migrate";
import { createLogger } from "@repo/logger";

import { createApiServer } from "./server";
import { resolveApiStartupConfig } from "./startup.config";

const logger = createLogger({ name: "api" });
const port = Number(process.env.API_PORT ?? 4000);
const startupConfig = resolveApiStartupConfig(process.env);

try {
  const client = await pool.connect();
  client.release();
  logger.info("database connection verified");
} catch (error) {
  logger.error({ err: error }, "database connection failed");
  process.exit(1);
}

if (startupConfig.runMigrations) {
  try {
    await runMigrations();
    logger.info("database migrations applied");
  } catch (error) {
    logger.error({ err: error }, "database migrations failed");
    process.exit(1);
  }
} else {
  logger.info("database migrations skipped");
}

const { server } = createApiServer({ logger });

server.listen(port, () => {
  logger.info({ port }, "api server started");
});
