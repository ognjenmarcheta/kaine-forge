import { pool } from "@repo/db/client";
import { createLogger } from "@repo/logger";

import { fromPgPool } from "./jobs.pool";
import { createJobQueue } from "./jobs.queue";
import { JOB_DEFINITIONS } from "./jobs.registry";

// Below the API's default API_SHUTDOWN_TIMEOUT_MS (8000), so a handler that
// overruns is failed for a retry before the process is forced to exit.
const JOBS_STOP_TIMEOUT_MS = 5000;

/**
 * The process-wide job queue on DATABASE_URL. The process entry calls start()
 * before the first enqueue, and stop() before the pool ends.
 */
export const jobQueue = createJobQueue({
  db: fromPgPool(pool),
  definitions: JOB_DEFINITIONS,
  logger: createLogger({ name: "jobs" }),
  stopTimeoutMs: JOBS_STOP_TIMEOUT_MS
});
