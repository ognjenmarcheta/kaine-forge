---
"@repo/jobs": minor
"@repo/api": minor
"@repo/auth": major
---

Add a Postgres background job runner (ADR 0018). The new `@repo/jobs` package wraps pg-boss on the existing `DATABASE_URL`, with typed job definitions, retries with backoff, and a bounded `stop()`. Its tables live in the `pgboss` schema, which pg-boss creates on start.

The API starts the job queue after migrations and after it listens, runs the job handlers by default, and stops them before the database pool closes on shutdown. Set the new `JOBS_RUNNER_ENABLED=false` to keep the API enqueue-only and run `node apps/api/dist/worker.js` from the same image as a separate worker.

`@repo/auth` no longer sends email inline. Every auth email (password reset, email verification, invitation, two-factor code, and email one-time codes) is enqueued as an `email.send` job and delivered by the runner, which retries a failed send. A process that imports `@repo/auth/instance` must now call `jobQueue.start()` from `@repo/jobs/client`, and run the runner or a worker, or auth emails are not delivered.
