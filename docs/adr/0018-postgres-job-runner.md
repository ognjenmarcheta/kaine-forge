# ADR 0018: Postgres background job runner (pg-boss)

- Status: Accepted
- Date: 2026-10-27

## Context

The API had no background job runner. Auth emails (password reset, email verification, invitation, two-factor code, and the four email one-time codes) were sent inline from `packages/auth/src/auth.instance.ts`. A failed send was swallowed and lost, with no retry. Later work needs the same runner: HTML transactional emails (#703), webhook delivery (#709), and data export (#710).

Constraints from the owner (issue #702):

- Postgres only, on the existing `DATABASE_URL`. No Redis or other broker.
- pg-boss is the default choice. This ADR compares it with graphile-worker.
- The storage sweep and image processing stay in-process. The runner does not run them.
- Graceful shutdown (#695, `apps/api/src/api.shutdown.ts`) stops every background worker before `pool.end()`.

## Decision

Use **pg-boss** (`pg-boss@^12.38.0`, catalog entry in `pnpm-workspace.yaml`) in a new package `@repo/jobs` (`packages/jobs`).

- **Typed jobs.** A job is a key in a definitions record with a zod payload schema, a retry policy, and an optional retention policy (`jobs.definition.ts`). `enqueue(name, payload)` and the handler map are checked against the record at compile time; an unknown name or a wrong payload does not compile. The handler wrapper parses the stored payload with the schema before the handler runs. The app's jobs live in `jobs.registry.ts`. The first one is `email.send` (`jobs.email.ts`); its handler calls `EmailSender.send` from `@repo/email`, unchanged.
- **Retries.** Each definition's retry policy becomes the pg-boss queue options (`retryLimit`, `retryDelay`, `retryBackoff`, `retryDelayMax`), applied by `createQueue`/`updateQueue` on every start. `email.send` retries 5 times with exponential backoff from 10 s, capped at 10 min. A failed attempt logs one warn line; the last failed attempt logs one error line, `job failed after its last attempt`, with the job name and id. No log line prints the payload or the error message, because both can carry codes, links, or provider details. pg-boss keeps the error on the job row until retention deletes it.
- **One pool.** pg-boss runs on the API's own node-postgres pool through a small adapter (`jobs.pool.ts`), so it adds no second pool, shares the SSL settings of `@repo/db/client`, and ends with that pool. LISTEN/NOTIFY stays off; workers poll every 2 s.
- **Schema ownership.** pg-boss owns its tables in its own Postgres schema, `pgboss`. `start()` creates and migrates that schema (pg-boss serializes its migrations with an advisory lock), so the API and a worker can both start it. Drizzle migrations in `packages/db` stay the source of truth for app tables and never touch `pgboss`. A pg-boss major upgrade is a reviewed dependency change; read its migration notes first.
- **Where it runs.** `apps/api/src/index.ts` starts the queue after migrations and after `listen()`, in the same event-loop turn, so a request that enqueues waits for the start in flight. By default the API also runs the handlers. `JOBS_RUNNER_ENABLED=false` keeps the API enqueue-only. A separate entry, `apps/api/src/worker.ts` (built to `apps/api/dist/worker.js`), runs only the runner. It ships in the existing `Dockerfile.api` image with a different command; there is no new deployable app.
- **Shutdown.** `jobQueue.stop()` stops fetching jobs and waits up to 5 s for running handlers; a handler still running after that is failed and retried later. The API pushes it into `stopBackgroundWork`, so it finishes before `pool.end()` and inside `API_SHUTDOWN_TIMEOUT_MS` (8 s). The worker stops the queue, then ends the pool, on SIGTERM or SIGINT.
- **Auth emails.** Every auth email hook calls `enqueueAuthEmail`, which enqueues an `email.send` job and does not await it. Every request takes the same path, so the auth response never varies on enqueue or delivery outcome, and timing does not reveal whether an account exists. A failed enqueue is logged by the queue (job name only) and never reaches the HTTP response.
- **Payload retention.** `email.send` payloads hold codes, links, and tokens. Its queue sets `deleteAfterSeconds: 60`: a completed or failed job is deleted by pg-boss maintenance at most 60 s plus one maintenance interval (60 s) after its last attempt, so within about 2 minutes. A job still unrun after 24 h (`retentionSeconds`) is deleted unsent. Every queue instance supervises, so retention runs even when the API is enqueue-only. Other jobs keep the pg-boss defaults (7 days after completion) unless they set a retention policy.
- **Tests run on PGlite.** pg-boss 12 has a `pglite` backend profile and a `fromPglite` adapter. `packages/jobs/src/jobs.queue.test.ts` runs the real queue on in-process PGlite: a typed round trip, a throwing handler retried to its limit and then failed with one error line and no payload in the logs, and `stop()` waiting for a running handler. The gap: PGlite is one connection, so these tests do not cover the node-postgres pool adapter or concurrent workers. That path was checked by hand against `postgres:17` (see the PR for #702); the CI e2e job (`postgres:17` service) starts the API with the runner on.

## Alternatives Considered

| Criterion                       | pg-boss 12                                                                                                                           | graphile-worker 0.18                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Postgres-only operation         | Yes. Polling by default; LISTEN/NOTIFY optional. Runs on a caller-supplied query function, so it can share the app pool.             | Yes. Uses LISTEN/NOTIFY on a dedicated connection for low latency.                            |
| Retry and backoff               | Per queue and per job: `retryLimit`, `retryDelay`, exponential `retryBackoff`, `retryDelayMax`.                                      | Per job `max_attempts`; the backoff curve is fixed exponential and not configurable per task. |
| Scheduling                      | Delayed jobs (`startAfter`) and cron/rrule schedules built in.                                                                       | Delayed jobs (`run_at`) and a crontab built in.                                               |
| Schema ownership and migrations | Own schema (configurable name); `start()` installs and migrates it under an advisory lock; migration SQL can be exported for review. | Own schema (`graphile_worker`); migrates on start.                                            |
| Shutdown                        | `stop({ graceful, timeout })`: stop fetching, wait for active handlers up to a timeout, then fail them for retry.                    | `runner.stop()` and built-in signal handling; waits for running tasks.                        |
| Testability                     | Official `pglite` backend: the real queue runs in Vitest without Docker, which matches the repo's PGlite test database.              | Needs a real Postgres in tests.                                                               |
| Payload retention               | Completed and failed jobs deleted after a per-queue `deleteAfterSeconds`; unrun jobs after `retentionSeconds`.                       | Completed jobs are deleted at once; permanently failed jobs stay until removed.               |
| Maintenance                     | Active, frequent releases (several a month in 2026); one maintainer plus contributors.                                               | Active, slower release cadence; maintained by Graphile.                                       |

- **graphile-worker**: a strong runner with lower pickup latency. It was not chosen because its backoff is not configurable per job, it needs a real Postgres in tests (the unit-test CI jobs have none), and it holds a dedicated LISTEN connection. None of these overturn the owner's default.
- **BullMQ or another broker**: out of scope; it needs Redis.
- **In-process retry loop around `EmailSender.send`**: loses jobs on restart and cannot move to a separate worker.

## Consequences

- Pros:
  - Failed auth email sends are retried with backoff instead of lost, and responses never wait on the email provider.
  - One typed seam for later jobs (#703, #709, #710): add a definition and a handler, and the compiler checks every enqueue.
  - No new infrastructure: the jobs share the API database and pool. Runner tests need no Docker.
- Cons:
  - Delivery is asynchronous: an email leaves up to one polling interval (2 s) after the request.
  - The `pgboss` schema is managed outside Drizzle; a pg-boss major upgrade can migrate it on start.
  - The API pool now also serves job polling and maintenance queries.
  - With the console email adapter, the delivered message (including links) is still logged by that adapter in development, as before.
