import { PGlite } from "@electric-sql/pglite";
import { fromPglite } from "pg-boss";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { defineJob } from "./jobs.definition";
import { createJobQueue, type JobQueue } from "./jobs.queue";

// pg-boss runs on PGlite through its own `pglite` backend profile (ADR 0018),
// so these tests drive the real queue tables in process, without DATABASE_URL.
const TEST_JOBS = {
  greet: defineJob({
    payload: z.object({ name: z.string() }),
    retry: { limit: 0, delaySeconds: 0, backoff: false }
  }),
  flaky: defineJob({
    payload: z.object({ secret: z.string() }),
    retry: { limit: 2, delaySeconds: 0, backoff: false }
  })
};

type TestJobs = typeof TEST_JOBS;

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function createLoggerSpy() {
  return { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
}

describe("createJobQueue", () => {
  let client: PGlite;
  let logger: ReturnType<typeof createLoggerSpy>;
  let queue: JobQueue<TestJobs>;

  beforeEach(async () => {
    client = new PGlite();
    logger = createLoggerSpy();
    queue = createJobQueue({
      backend: "pglite",
      db: fromPglite(client),
      definitions: TEST_JOBS,
      logger,
      pollingIntervalSeconds: 0.5,
      stopTimeoutMs: 5000
    });
    await queue.start();
  });

  afterEach(async () => {
    await queue.stop();
    await client.close();
  });

  it("delivers a typed payload from enqueue to its handler", async () => {
    const received = deferred<{ name: string }>();

    await queue.startRunner({
      greet: async (payload) => received.resolve(payload),
      flaky: async () => undefined
    });
    await queue.enqueue("greet", { name: "Ada" });

    await expect(received.promise).resolves.toEqual({ name: "Ada" });
  });

  it("rejects an unknown job name and a mistyped payload at compile time", () => {
    // Never called: the directives fail typecheck if either mistake compiles.
    const typeOnly = (typed: JobQueue<TestJobs>) => {
      // @ts-expect-error -- "unknown" is not a defined job name.
      void typed.enqueue("unknown", { name: "Ada" });
      // @ts-expect-error -- greet takes { name: string }.
      void typed.enqueue("greet", { name: 1 });
    };

    expect(typeOnly).toBeTypeOf("function");
  });

  it("retries a throwing handler up to its limit, then fails the job and logs no payload", async () => {
    let attempts = 0;

    await queue.startRunner({
      greet: async () => undefined,
      flaky: async () => {
        attempts += 1;
        throw new Error("provider unavailable");
      }
    });
    const id = await queue.enqueue("flaky", { secret: "reset-token-123" });

    await vi.waitFor(() => expect(logger.error).toHaveBeenCalledTimes(1), {
      timeout: 15_000,
      interval: 100
    });

    expect(attempts).toBe(3);
    expect(logger.error).toHaveBeenCalledWith(
      { jobId: id, jobName: "flaky" },
      "job failed after its last attempt"
    );
    const { rows } = await client.query<{ state: string }>(
      "SELECT state FROM pgboss.job WHERE id = $1",
      [id]
    );
    expect(rows[0]?.state).toBe("failed");
    const logged = JSON.stringify([...logger.error.mock.calls, ...logger.warn.mock.calls]);
    expect(logged).not.toContain("reset-token-123");
  }, 20_000);

  it("waits in stop() for a running handler to finish", async () => {
    const started = deferred<void>();
    let finished = false;

    await queue.startRunner({
      greet: async () => {
        started.resolve(undefined);
        await new Promise((resolve) => setTimeout(resolve, 500));
        finished = true;
      },
      flaky: async () => undefined
    });
    await queue.enqueue("greet", { name: "slow" });
    await started.promise;

    await queue.stop();

    expect(finished).toBe(true);
  });
});
