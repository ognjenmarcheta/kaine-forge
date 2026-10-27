import { createLogger } from "@repo/logger";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";

import { validateApiEnv, type ApiEnv } from "./env.config";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const logger = createLogger({ name: "api" });

let env: ApiEnv;
try {
  env = validateApiEnv(process.env);
} catch (error) {
  logger.error({ err: error }, "environment validation failed");
  process.exit(1);
}

const { db, pool } = await import("@repo/db/client");
const { runMigrations } = await import("@repo/db/migrate");
const { startApiRuntime } = await import("./api.runtime");
const { registerApiShutdown } = await import("./api.shutdown");
const { createApiServer } = await import("./server");
const { resolveApiStartupConfig } = await import("./startup.config");
const { startAttachmentSweep, sweepAttachmentObjects, sweepStaleObjects, withSweepLock } =
  await import("./features/storage/attachment.sweep");
const { PUBLIC_ASSET_CONFIG } = await import("./features/public-assets/public-assets.definition");
const { s3ObjectStore } = await import("./features/storage/attachment.store");
const { resolveAttachmentSweepConfig } = await import("./features/storage/storage.config");

const { server, subscriptions, wsServer } = await startApiRuntime({
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

const stopBackgroundWork: Array<() => void | Promise<void>> = [];
const sweep = resolveAttachmentSweepConfig(process.env);

if (sweep) {
  const stopSweep = startAttachmentSweep({
    intervalMs: sweep.intervalMs,
    logger,
    sweep: async () => {
      await withSweepLock(db, async (tx) => {
        const cutoff = new Date(Date.now() - sweep.pendingTtlMs);
        const result = await sweepAttachmentObjects({
          db: tx,
          logger,
          store: s3ObjectStore,
          pendingCutoff: cutoff
        });
        const staged = await sweepStaleObjects({
          logger,
          store: s3ObjectStore,
          prefix: PUBLIC_ASSET_CONFIG.stagingPrefix,
          before: cutoff
        });

        if (result.purged > 0 || result.failed > 0 || staged > 0) {
          logger.info({ ...result, staged }, "attachment sweep finished");
        }
      });
    }
  });
  stopBackgroundWork.push(stopSweep);
}

registerApiShutdown({
  closePool: () => pool.end(),
  exit: process.exit,
  logger,
  server,
  stopBackgroundWork,
  subscriptions,
  timeoutMs: env.API_SHUTDOWN_TIMEOUT_MS,
  wsServer
});
