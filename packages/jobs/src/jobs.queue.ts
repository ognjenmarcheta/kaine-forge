import type { Logger } from "@repo/logger";
import { PgBoss, type Db, type JobWithMetadata } from "pg-boss";

import type { JobDefinitions, JobHandlers, JobPayload, JobPayloadData } from "./jobs.definition";

/** Postgres schema that holds the runner's own tables (ADR 0018). */
export const JOBS_SCHEMA = "pgboss";

const DEFAULT_POLLING_INTERVAL_SECONDS = 2;
// Retention runs inside pg-boss maintenance, so this bounds how long a
// finished job's payload outlives its deleteAfterSeconds.
const MAINTENANCE_INTERVAL_SECONDS = 60;
// pg-boss 12 raises any stop() timeout below this to it.
const MIN_BOSS_STOP_TIMEOUT_MS = 1000;

export interface JobQueueOptions<TDefinitions extends JobDefinitions> {
  backend?: "pglite" | "postgres";
  db: Db;
  definitions: TDefinitions;
  logger: Pick<Logger, "error" | "info" | "warn">;
  pollingIntervalSeconds?: number;
  /** How long stop() waits for running handlers before it fails them for a retry. */
  stopTimeoutMs: number;
}

export interface JobQueue<TDefinitions extends JobDefinitions> {
  /** Installs or migrates the job schema and creates one queue per definition. */
  start(): Promise<void>;
  /** Stores the job and resolves with its id. Waits for a start() in progress. */
  enqueue<TName extends keyof TDefinitions & string>(
    name: TName,
    payload: JobPayload<TDefinitions[TName]>
  ): Promise<string>;
  /** Runs the handlers in this process. Without it, the process only enqueues. */
  startRunner(handlers: JobHandlers<TDefinitions>): Promise<void>;
  /** Stops taking jobs and waits up to stopTimeoutMs for running handlers. */
  stop(): Promise<void>;
}

export function createJobQueue<TDefinitions extends JobDefinitions>(
  options: JobQueueOptions<TDefinitions>
): JobQueue<TDefinitions> {
  const { definitions, logger } = options;
  // Every instance supervises (expiry and payload retention), so retention
  // holds even where no runner is on. pg-boss coordinates supervisors through
  // the database.
  const boss = new PgBoss({
    backend: options.backend ?? "postgres",
    db: options.db,
    maintenanceIntervalSeconds: MAINTENANCE_INTERVAL_SECONDS,
    schedule: false,
    schema: JOBS_SCHEMA
  });
  // pg-boss reports its own query failures here; an unhandled "error" event
  // would crash the process.
  boss.on("error", (error) => logger.error({ err: error }, "job queue error"));
  let starting: Promise<void> | undefined;
  // Enqueues not yet stored. Auth hooks do not await theirs, so stop() waits
  // for these before the caller ends the pool.
  const pending = new Set<Promise<string>>();

  const start = async (): Promise<void> => {
    await boss.start();

    for (const [name, definition] of Object.entries(definitions)) {
      const queue = {
        retryLimit: definition.retry.limit,
        retryDelay: definition.retry.delaySeconds,
        retryBackoff: definition.retry.backoff,
        ...(definition.retry.maxDelaySeconds === undefined
          ? {}
          : { retryDelayMax: definition.retry.maxDelaySeconds }),
        ...(definition.retention
          ? {
              deleteAfterSeconds: definition.retention.deleteAfterSeconds,
              retentionSeconds: definition.retention.pendingSeconds
            }
          : {})
      };

      if (await boss.getQueue(name)) {
        await boss.updateQueue(name, queue);
      } else {
        await boss.createQueue(name, queue);
      }
    }
  };

  const storeJob = async (name: string, payload: JobPayloadData): Promise<string> => {
    if (!starting) {
      throw new Error("job queue is not started");
    }

    try {
      await starting;
      const id = await boss.send(name, payload);

      if (!id) {
        throw new Error(`job ${name} was not stored`);
      }

      return id;
    } catch (error) {
      // Fire-and-forget callers swallow the rejection, so the queue logs
      // the lost job here, by name only.
      logger.error({ jobName: name }, "job enqueue failed");
      throw error;
    }
  };

  const runHandler = async (
    name: string,
    handler: (payload: JobPayloadData) => Promise<void>,
    job: JobWithMetadata<unknown>
  ): Promise<void> => {
    const definition = definitions[name];

    if (!definition) {
      throw new Error(`no job definition for ${name}`);
    }

    try {
      await handler(definition.payload.parse(job.data));
    } catch (error) {
      // The payload and the error message can carry codes, links, or
      // provider details, so the log names the job only. pg-boss keeps the
      // error on the job row until retention deletes it.
      const fields = { jobId: job.id, jobName: name };

      if (job.retryCount >= job.retryLimit) {
        logger.error(fields, "job failed after its last attempt");
      } else {
        logger.warn({ ...fields, attempt: job.retryCount + 1 }, "job attempt failed; will retry");
      }

      throw error;
    }
  };

  return {
    start: () => {
      starting ??= start();
      return starting;
    },

    enqueue(name, payload) {
      const sending = storeJob(name, payload);
      pending.add(sending);
      // The catch only keeps this bookkeeping chain from becoming an
      // unhandled rejection; the caller receives `sending` itself.
      sending.finally(() => pending.delete(sending)).catch(() => undefined);
      return sending;
    },

    async startRunner(handlers) {
      if (!starting) {
        throw new Error("job queue is not started");
      }

      await starting;

      for (const [name, handler] of Object.entries(handlers)) {
        await boss.work(
          name,
          {
            includeMetadata: true,
            pollingIntervalSeconds:
              options.pollingIntervalSeconds ?? DEFAULT_POLLING_INTERVAL_SECONDS
          },
          async ([job]: JobWithMetadata<unknown>[]) => {
            if (job) await runHandler(name, handler, job);
          }
        );
      }

      logger.info({ jobs: Object.keys(definitions) }, "job runner started");
    },

    async stop() {
      if (!starting) return;
      await starting.catch(() => undefined);
      // One stopTimeoutMs budget covers both waits. allSettled: a failed
      // enqueue is already logged and must not block shutdown.
      const deadline = Date.now() + options.stopTimeoutMs;
      await settleWithin(Promise.allSettled(pending), options.stopTimeoutMs);
      // Enqueues may use the whole budget; the handler drain still gets the
      // pg-boss minimum, so stop() can take up to stopTimeoutMs + 1 s.
      await boss.stop({
        graceful: true,
        close: false,
        timeout: Math.max(MIN_BOSS_STOP_TIMEOUT_MS, deadline - Date.now())
      });
    }
  };
}

async function settleWithin(work: Promise<unknown>, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });

  try {
    await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
