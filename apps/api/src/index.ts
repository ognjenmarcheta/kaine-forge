import { pool } from "@repo/db/client";
import { runMigrations } from "@repo/db/migrate";
import { createLogger } from "@repo/logger";

import { startApiRuntime } from "./api.runtime";
import { createApiServer } from "./server";
import { resolveApiStartupConfig } from "./startup.config";

const logger = createLogger({ name: "api" });
const port = Number(process.env.API_PORT ?? 4000);
const host = process.env.API_HOST;
const startupConfig = resolveApiStartupConfig(process.env);

await startApiRuntime({
  createServer: createApiServer,
  exit: process.exit,
  logger,
  migrations: {
    run: runMigrations
  },
  host,
  port,
  startupConfig,
  verifyDatabase: async () => {
    const client = await pool.connect();
    client.release();
  }
});
