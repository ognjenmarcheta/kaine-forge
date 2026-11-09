# ADR 0027: Webhook deliveries in the write's transaction

- Status: Accepted
- Date: 2026-11-09
- Applies to: `apps/api/src/features/webhooks/webhooks.dispatch.ts`, `apps/api/src/features/todos/todos.module.ts`, `apps/api/src/features/notes/notes.module.ts`, `apps/api/src/context.data.ts`, `apps/api/src/pubsub.ts`, `packages/jobs/src/jobs.queue.ts`

## Context

A Todo or Note write committed first. Then `publish` streamed the event and handed it to the
webhook dispatcher, which looked up the Organization's Webhook Endpoints and enqueued one
`webhook.deliver` job per endpoint, without awaiting it. A failed lookup or enqueue was logged and
the event was lost. A process that stopped between the commit and the enqueue lost it too. Nothing
stated this guarantee, so a receiver could not know that an event can go missing.

pg-boss stores a job on a caller-supplied connection (`send(name, data, { db })`). The job table is
in the same database as the application tables, so a job stored on the write's own connection
commits or rolls back with the write.

## Decision

1. **Record in the transaction.** An organization event's webhook deliveries are stored through the
   write's transaction. `RecordOrganizationEvent` in `pubsub.ts` is the seam: a module calls it
   inside the transaction of the write, and calls `publish` for the live stream after the commit.
   The Todo and Note modules open a transaction for each write that emits an event. A sync push
   runs them in its savepoints, so a rejected mutation or a failed push stores no delivery. A Todo
   delete soft-deletes its Attachments in the same transaction, in a savepoint so that a failed
   detach does not stop the delete, and purges their objects only after the commit.
2. **The connection.** `ScopedData.jobConnection()` gives the job queue a connection on the
   ScopedData's handle. It turns pg-boss's `$n` placeholders into Drizzle parameters, so the
   statement runs inside the open transaction. `JobQueue.enqueue` takes it as `{ connection }`.
3. **Failure fails the write.** A failed endpoint lookup or enqueue rejects, and the write rolls back
   with it. The client gets an error and can retry; the event is not lost silently.
4. **At least once.** A committed write's deliveries are retried until they succeed or reach their
   retry limit (ADR 0018). A delivery can repeat, so a receiver deduplicates by the event id.
5. **Test.** `webhooks.dispatch.test.ts` runs the real Todo and Note modules, the dispatcher, and the
   job queue on one PGlite database: a committed write stores its delivery, a rolled-back
   transaction stores none, and a failed enqueue undoes every create, update, toggle, and delete.

## Alternatives Considered

- An outbox table and a relay that moves its rows to the queue: rejected. It needs a table, a
  migration, a poller, and duplicate handling between the relay and the fast path, while pg-boss
  already stores the job in the transaction.
- Keep the dispatch after the commit, and document that events can be lost: rejected. Webhook
  receivers sync state from these events, and a lost event leaves them wrong with no signal.
- Enqueue one `webhook.dispatch` job in the transaction and fan out to endpoints in the runner:
  rejected for now. It moves the endpoint lookup out of the write, but adds a job type and a second
  hop. The lookup is one query on the Organization's endpoints, the same one the old dispatcher ran.

## Consequences

- Pros:
  - an event's deliveries are stored if and only if its write commits
  - a broken queue surfaces as a failed write, not as a log line
- Cons:
  - every Todo and Note write runs the endpoint lookup, and the job insert when an endpoint
    subscribes, inside its transaction
  - when the job tables are unavailable, Todo and Note writes of an Organization with a subscribed
    endpoint fail
  - `jobConnection()` runs raw SQL without the organization predicate; only the job queue may use it
