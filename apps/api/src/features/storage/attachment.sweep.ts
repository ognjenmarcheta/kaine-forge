import {
  filesTable,
  organizationStoragePurgesTable,
  publicAssetPurgesTable
} from "@repo/db/schema";
import type { Database } from "@repo/db/types";
import type { Logger } from "@repo/logger";
import { publicAssetKeyFromUrl, type PublicAssetConfig } from "@repo/storage";
import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";

import { objectRefsOf, type ObjectStore } from "./attachment.store";
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
        key: filesTable.key,
        mimeType: filesTable.mimeType
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

          await Promise.all(objectRefsOf(row).map((ref) => store.delete(ref)));
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
 * Deletes objects under `prefix` that were last written before `before`: staged
 * uploads that were never confirmed. Returns how many it deleted.
 */
export async function sweepStaleObjects({
  logger,
  store,
  prefix,
  before,
  limit = STORAGE_CONFIG.sweep.batchSize
}: {
  logger: Pick<Logger, "warn">;
  store: Pick<ObjectStore, "delete" | "listBefore">;
  prefix: string;
  before: Date;
  limit?: number;
}): Promise<number> {
  const refs = await store.listBefore(prefix, before, limit);
  const outcomes = await Promise.all(
    refs.map(async (ref) => {
      try {
        await store.delete(ref);
        return true;
      } catch (err) {
        logger.warn(
          { error: formatLoggableError(err), key: ref.key },
          "failed to sweep stale object"
        );
        return false;
      }
    })
  );

  return outcomes.filter(Boolean).length;
}

/**
 * Deletes what a deleted Organization left in storage: every private object
 * under its `<organizationId>/` prefix and its logo in the public bucket. The
 * organizations delete trigger queues each one in organization_storage_purges,
 * also on a cascade from a deleted user. A queued row stays until every delete
 * succeeds, its prefix is empty, and `pendingCutoff` has passed its deletion,
 * so an upload URL issued just before the deletion cannot leave an object
 * behind and a failed logo delete is retried.
 */
export async function sweepDeletedOrganizations({
  db,
  logger,
  store,
  publicStorage,
  pendingCutoff,
  batchSize = STORAGE_CONFIG.sweep.batchSize
}: {
  db: Database;
  logger: Pick<Logger, "warn">;
  store: Pick<ObjectStore, "delete" | "listBefore">;
  /** The public bucket of organization logos, or null when Public Assets are off. */
  publicStorage: PublicAssetConfig | null;
  pendingCutoff: Date;
  batchSize?: number;
}): Promise<{ deletedObjects: number; failed: number }> {
  const totals = { deletedObjects: 0, failed: 0 };
  const purges = await db
    .select()
    .from(organizationStoragePurgesTable)
    // Never-tried rows first, then the longest-waiting failures, so a row
    // that keeps failing cannot starve later Organizations.
    .orderBy(
      sql`${organizationStoragePurgesTable.attemptedAt} asc nulls first`,
      asc(organizationStoragePurgesTable.createdAt)
    )
    .limit(batchSize);

  for (const purge of purges) {
    const logoKey =
      purge.logo && publicStorage ? publicAssetKeyFromUrl(publicStorage.baseUrl, purge.logo) : null;

    // A logo that fails to delete keeps the row queued for a retry, like a
    // private object, but never blocks the private cleanup below.
    let failed = false;

    if (publicStorage && logoKey) {
      try {
        await store.delete({ bucket: publicStorage.bucket, key: logoKey });
      } catch (err) {
        failed = true;
        logger.warn(
          { error: formatLoggableError(err), organizationId: purge.organizationId },
          "failed to delete deleted organization logo"
        );
      }
    }

    for (;;) {
      const refs = await store.listBefore(`${purge.organizationId}/`, new Date(), batchSize);
      const outcomes = await Promise.all(
        refs.map(async (ref) => {
          try {
            await store.delete(ref);
            return true;
          } catch (err) {
            logger.warn(
              { error: formatLoggableError(err), key: ref.key },
              "failed to delete deleted organization object"
            );
            return false;
          }
        })
      );
      const deleted = outcomes.filter(Boolean).length;
      totals.deletedObjects += deleted;

      if (deleted < outcomes.length) {
        failed = true;
        break;
      }

      if (refs.length < batchSize) {
        break;
      }
    }

    if (failed) {
      totals.failed += 1;
      await db
        .update(organizationStoragePurgesTable)
        .set({ attemptedAt: new Date() })
        .where(eq(organizationStoragePurgesTable.organizationId, purge.organizationId));
    } else if (purge.createdAt < pendingCutoff) {
      await db
        .delete(organizationStoragePurgesTable)
        .where(eq(organizationStoragePurgesTable.organizationId, purge.organizationId));
    }
  }

  return totals;
}

/**
 * Deletes the Public Assets that deleted users left in the public bucket (their
 * avatars), best effort. The users delete trigger queues each URL in
 * public_asset_purges. A URL outside the public bucket, such as a social
 * provider's avatar, is only dropped; a failed delete stays queued, behind
 * rows not tried yet.
 */
export async function sweepDeletedPublicAssets({
  db,
  logger,
  store,
  publicStorage,
  batchSize = STORAGE_CONFIG.sweep.batchSize
}: {
  db: Database;
  logger: Pick<Logger, "warn">;
  store: Pick<ObjectStore, "delete">;
  /** The public bucket of avatars, or null when Public Assets are off. */
  publicStorage: PublicAssetConfig | null;
  batchSize?: number;
}): Promise<{ deleted: number; failed: number }> {
  const totals = { deleted: 0, failed: 0 };
  const purges = await db
    .select({ url: publicAssetPurgesTable.url })
    .from(publicAssetPurgesTable)
    .orderBy(
      sql`${publicAssetPurgesTable.attemptedAt} asc nulls first`,
      asc(publicAssetPurgesTable.createdAt)
    )
    .limit(batchSize);

  for (const { url } of purges) {
    const key = publicStorage ? publicAssetKeyFromUrl(publicStorage.baseUrl, url) : null;

    if (publicStorage && key) {
      try {
        await store.delete({ bucket: publicStorage.bucket, key });
        totals.deleted += 1;
      } catch (err) {
        totals.failed += 1;
        logger.warn({ error: formatLoggableError(err), key }, "failed to delete public asset");
        await db
          .update(publicAssetPurgesTable)
          .set({ attemptedAt: new Date() })
          .where(eq(publicAssetPurgesTable.url, url));
        continue;
      }
    }

    await db.delete(publicAssetPurgesTable).where(eq(publicAssetPurgesTable.url, url));
  }

  return totals;
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
