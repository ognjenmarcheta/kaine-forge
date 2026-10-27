import { createLogger } from "@repo/logger";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";

import { validateApiEnv } from "./env.config";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

// Runs only the job runner, from the API image with a different command
// (`node apps/api/dist/worker.js`). Pair it with JOBS_RUNNER_ENABLED=false on
// the API. The API owns app migrations; pg-boss installs its own schema.
const logger = createLogger({ name: "worker" });

try {
  validateApiEnv(process.env);
} catch (error) {
  logger.error({ err: error }, "environment validation failed");
  process.exit(1);
}

const { pool } = await import("@repo/db/client");
const { jobQueue } = await import("@repo/jobs/client");
const { createApiJobHandlers } = await import("./api.jobs");

try {
  await jobQueue.start();
  await jobQueue.startRunner(createApiJobHandlers(logger));
} catch (error) {
  logger.error({ err: error }, "job worker failed to start");
  process.exit(1);
}

let stopping = false;

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, "job worker stopping");
    // stop() waits a bounded time for running handlers, then the pool ends.
    void jobQueue
      .stop()
      .then(() => pool.end())
      .then(
        () => {
          logger.info("job worker stopped");
          process.exit(0);
        },
        (error: unknown) => {
          logger.error({ err: error }, "job worker shutdown failed");
          process.exit(1);
        }
      );
  });
}
