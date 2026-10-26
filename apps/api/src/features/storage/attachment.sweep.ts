import { filesTable } from "@repo/db/schema";
import type { Database } from "@repo/db/types";
import type { Logger } from "@repo/logger";
import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";

import type { ObjectStore } from "./attachment.store";
import { STORAGE_CONFIG } from "./storage.definition";
import { formatLoggableError } from "../../observability";

export interface AttachmentSweepDeps {
  db: Database;
  logger: Pick<Logger, "warn">;
  store: Pick<ObjectStore, "delete">;
  /** A pending row created before this was abandoned: its upload URL expired long ago. */
  pendingCutoff: Date;
  batchSize?: number;
}

/**
 * Deletes the stored object of every `deleted` Attachment and every abandoned
 * `pending` one, then marks the row purged (and deleted). A system job, not a
 * request: it reads every organization's rows, so it trusts no input and never
 * deletes a key outside the row's own organization prefix.
 *
 * A failed or refused row is touched (`updated_at`) and stays unpurged, so the
 * next batch and the next run try other rows first and then retry it.
 */
export async function sweepAttachmentObjects({
  db,
  logger,
  store,
  pendingCutoff,
  batchSize = STORAGE_CONFIG.sweep.batchSize
}: AttachmentSweepDeps): Promise<{ purged: number; failed: number }> {
  const totals = { purged: 0, failed: 0 };

  for (;;) {
    const rows = await db
      .select({
        id: filesTable.id,
        organizationId: filesTable.organizationId,
        bucket: filesTable.bucket,
        key: filesTable.key
      })
      .from(filesTable)
      .where(
        and(
          isNull(filesTable.purgedAt),
          or(
            eq(filesTable.status, "deleted"),
            and(eq(filesTable.status, "pending"), lt(filesTable.createdAt, pendingCutoff))
          )
        )
      )
      .orderBy(asc(filesTable.updatedAt))
      .limit(batchSize);

    const outcomes = await Promise.all(
      rows.map(async (row) => {
        const now = new Date();

        try {
          if (!row.key.startsWith(`${row.organizationId}/`)) {
            throw new Error("object key is outside its organization prefix");
          }

          await store.delete(row);
        } catch (err) {
          logger.warn(
            { error: formatLoggableError(err), fileId: row.id },
            "failed to sweep attachment object"
          );
          await db.update(filesTable).set({ updatedAt: now }).where(eq(filesTable.id, row.id));
          return false;
        }

        await db
          .update(filesTable)
          .set({ status: "deleted", purgedAt: now, updatedAt: now })
          .where(eq(filesTable.id, row.id));
        return true;
      })
    );

    const purged = outcomes.filter(Boolean).length;
    totals.purged += purged;
    totals.failed += outcomes.length - purged;

    if (rows.length < batchSize || purged === 0) {
      return totals;
    }
  }
}

/**
 * Runs `task` in a transaction that holds the sweep's transaction-scoped
 * advisory lock, so only one API replica sweeps at a time. Resolves false
 * without running `task` when another replica holds the lock.
 */
export async function withSweepLock(
  db: Database,
  task: (tx: Database) => Promise<void>
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const result: unknown = await tx.execute(
      sql`select pg_try_advisory_xact_lock(${STORAGE_CONFIG.sweep.advisoryLockKey}) as locked`
    );
    const locked =
      typeof result === "object" &&
      result !== null &&
      "rows" in result &&
      Array.isArray(result.rows) &&
      isLockedRow(result.rows[0]);

    if (!locked) {
      return false;
    }

    await task(tx);
    return true;
  });
}

function isLockedRow(row: unknown): boolean {
  return typeof row === "object" && row !== null && "locked" in row && row.locked === true;
}

/** Runs `sweep` every `intervalMs`, never two at once in this process. Returns a stop function. */
export function startAttachmentSweep({
  intervalMs,
  logger,
  sweep
}: {
  intervalMs: number;
  logger: Pick<Logger, "error">;
  sweep: () => Promise<void>;
}): () => void {
  let running = false;

  const timer = setInterval(() => {
    if (running) {
      return;
    }

    running = true;
    sweep()
      .catch((error: unknown) => {
        logger.error({ err: error }, "attachment sweep failed");
      })
      .finally(() => {
        running = false;
      });
  }, intervalMs);

  // The sweep never keeps the process alive on its own.
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}
