import { createLogger } from "@repo/logger";

import { validateApiEnv, type ApiEnv } from "./env.config";

const logger = createLogger({ name: "api" });

let env: ApiEnv;
try {
  env = validateApiEnv(process.env);
} catch (error) {
  logger.error({ err: error }, "environment validation failed");
  process.exit(1);
}

const { pool } = await import("@repo/db/client");
const { runMigrations } = await import("@repo/db/migrate");
const { startApiRuntime } = await import("./api.runtime");
const { createApiServer } = await import("./server");
const { resolveApiStartupConfig } = await import("./startup.config");

await startApiRuntime({
  createServer: createApiServer,
  exit: process.exit,
  logger,
  migrations: {
    run: runMigrations
  },
  host: env.API_HOST,
  port: env.API_PORT,
  startupConfig: resolveApiStartupConfig(process.env),
  verifyDatabase: async () => {
    const client = await pool.connect();
    client.release();
  }
});
