import { FEATURE_FLAG_REGISTRY, unknownFeatureFlagVariables } from "@repo/feature-flags";
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

const unknownFlagVariables = unknownFeatureFlagVariables(process.env, FEATURE_FLAG_REGISTRY);
if (unknownFlagVariables.length > 0) {
  logger.warn(
    { variables: unknownFlagVariables },
    "feature flag variables match no registry key and are ignored"
  );
}

const { db, pool } = await import("@repo/db/client");
const { createEmailSender } = await import("@repo/email");
const { createJobHandlers } = await import("@repo/jobs");
const { jobQueue } = await import("@repo/jobs/client");
const { runMigrations } = await import("@repo/db/migrate");
const { startApiRuntime } = await import("./api.runtime");
const { registerApiShutdown } = await import("./api.shutdown");
const { createApiServer } = await import("./server");
const { resolveApiStartupConfig } = await import("./startup.config");
const {
  startAttachmentSweep,
  sweepAttachmentObjects,
  sweepDeletedOrganizations,
  sweepDeletedPublicAssets,
  sweepStaleObjects,
  withSweepLock
} = await import("./features/storage/attachment.sweep");
const { PUBLIC_ASSET_CONFIG } = await import("./features/public-assets/public-assets.definition");
const { publicAssetStorage, s3ObjectStore } = await import("./features/storage/attachment.store");
const { resolveAttachmentSweepConfig } = await import("./features/storage/storage.config");
const { setNotificationDispatcher } = await import("@repo/auth/notifications");
const { renderEmail } = await import("@repo/email");
const { createNotificationDelivery } =
  await import("./features/notifications/notifications.delivery");
const { pubsub } = await import("./pubsub");
const { startHousekeeping } = await import("./features/housekeeping/housekeeping.sweep");
const { resolveHousekeepingConfig } = await import("./features/housekeeping/housekeeping.config");

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

// Called before the first event-loop turn after listen, so a request that
// enqueues finds start() in flight and waits for it (ADR 0018).
try {
  await jobQueue.start();

  if (env.JOBS_RUNNER_ENABLED === "true") {
    await jobQueue.startRunner(createJobHandlers({ emailSender: createEmailSender() }));
  } else {
    logger.info("job runner disabled; this process only enqueues jobs");
  }
} catch (error) {
  logger.error({ err: error }, "job queue failed to start");
  process.exit(1);
}
stopBackgroundWork.push(() => jobQueue.stop());

// Auth actions in this process hand their Notification events to this
// delivery; the in-process pubsub streams them, so delivery stays here.
setNotificationDispatcher(
  createNotificationDelivery({
    db,
    publish: (payload) => pubsub.publish("notification:created", payload),
    sendEmail: async (to, email, locale) => {
      await jobQueue.enqueue("email.send", { to, ...(await renderEmail(email, locale)) });
    }
  })
);
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
        const organizations = await sweepDeletedOrganizations({
          db: tx,
          logger,
          store: s3ObjectStore,
          publicStorage: publicAssetStorage(),
          pendingCutoff: cutoff
        });
        const publicAssets = await sweepDeletedPublicAssets({
          db: tx,
          logger,
          store: s3ObjectStore,
          publicStorage: publicAssetStorage()
        });

        if (
          result.purged > 0 ||
          result.failed > 0 ||
          staged > 0 ||
          organizations.deletedObjects > 0 ||
          organizations.failed > 0 ||
          publicAssets.deleted > 0 ||
          publicAssets.failed > 0
        ) {
          logger.info(
            { ...result, staged, organizations, publicAssets },
            "attachment sweep finished"
          );
        }
      });
    }
  });
  stopBackgroundWork.push(stopSweep);
}

const housekeeping = resolveHousekeepingConfig(process.env);

if (housekeeping) {
  stopBackgroundWork.push(startHousekeeping({ db, intervalMs: housekeeping.intervalMs, logger }));
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
