import {
  auditEventsTable,
  dataExportsTable,
  filesTable,
  notificationsTable
} from "@repo/db/schema";
import type { Database } from "@repo/db/types";
import { and, asc, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";

import { HOUSEKEEPING_CONFIG } from "./housekeeping.definition";
import { runBatchPurges, withHousekeepingLock, type BatchPurge } from "./housekeeping.sweep";
import type { ObjectStore } from "../storage/attachment.store";

/** How long each kind of row stays; see `.env.example` for the variables and defaults. */
export interface RetentionWindows {
  /** Audit Events, by creation time. */
  auditEventsMs: number;
  /** Failed and expired data exports, by their last change. */
  dataExportsMs: number;
  /** Notifications, read or not, by creation time. */
  notificationsMs: number;
  /** Attachment rows whose object the storage sweep already deleted, by purge time. */
  purgedFilesMs: number;
}

type RetentionCounts = Record<
  | "purgedFiles"
  | "auditEvents"
  | "notifications"
  | "stalledExports"
  | "exportArchives"
  | "dataExports",
  number
>;

const cutoff = (now: Date, windowMs: number) => new Date(now.getTime() - windowMs);

type RowPurgeName = Exclude<keyof RetentionCounts, "exportArchives" | "dataExports">;

function retentionPurges(now: Date, windows: RetentionWindows): Array<[RowPurgeName, BatchPurge]> {
  return [
    [
      "purgedFiles",
      // Only rows whose object is gone; a deleted row without purged_at still
      // names an object the storage sweep must delete first.
      async (tx, limit) => {
        const expired = tx
          .select({ id: filesTable.id })
          .from(filesTable)
          .where(
            and(
              eq(filesTable.status, "deleted"),
              lt(filesTable.purgedAt, cutoff(now, windows.purgedFilesMs))
            )
          )
          .limit(limit);
        const rows = await tx
          .delete(filesTable)
          .where(inArray(filesTable.id, expired))
          .returning({ id: filesTable.id });
        return rows.length;
      }
    ],
    [
      "auditEvents",
      async (tx, limit) => {
        const expired = tx
          .select({ id: auditEventsTable.id })
          .from(auditEventsTable)
          .where(lt(auditEventsTable.createdAt, cutoff(now, windows.auditEventsMs)))
          .limit(limit);
        const rows = await tx
          .delete(auditEventsTable)
          .where(inArray(auditEventsTable.id, expired))
          .returning({ id: auditEventsTable.id });
        return rows.length;
      }
    ],
    [
      "notifications",
      async (tx, limit) => {
        const expired = tx
          .select({ id: notificationsTable.id })
          .from(notificationsTable)
          .where(lt(notificationsTable.createdAt, cutoff(now, windows.notificationsMs)))
          .limit(limit);
        const rows = await tx
          .delete(notificationsTable)
          .where(inArray(notificationsTable.id, expired))
          .returning({ id: notificationsTable.id });
        return rows.length;
      }
    ],
    [
      "stalledExports",
      // A job lost in a crash, or never run, leaves its export pending or
      // running; failing it frees the requester's slot for that kind.
      async (tx, limit) => {
        const stalled = tx
          .select({ id: dataExportsTable.id })
          .from(dataExportsTable)
          .where(
            and(
              inArray(dataExportsTable.status, ["pending", "running"]),
              lt(dataExportsTable.updatedAt, cutoff(now, HOUSEKEEPING_CONFIG.stalledExportMs))
            )
          )
          .limit(limit);
        const rows = await tx
          .update(dataExportsTable)
          .set({ status: "failed", completedAt: now, updatedAt: now })
          .where(inArray(dataExportsTable.id, stalled))
          .returning({ id: dataExportsTable.id });
        return rows.length;
      }
    ]
  ];
}

function dataExportPurges(
  now: Date,
  windows: RetentionWindows
): Array<["dataExports", BatchPurge]> {
  return [
    [
      "dataExports",
      // Only finished rows: a ready row still names its archive.
      async (tx, limit) => {
        const expired = tx
          .select({ id: dataExportsTable.id })
          .from(dataExportsTable)
          .where(
            and(
              inArray(dataExportsTable.status, ["failed", "expired"]),
              lt(dataExportsTable.updatedAt, cutoff(now, windows.dataExportsMs))
            )
          )
          .limit(limit);
        const rows = await tx
          .delete(dataExportsTable)
          .where(inArray(dataExportsTable.id, expired))
          .returning({ id: dataExportsTable.id });
        return rows.length;
      }
    ]
  ];
}

const archiveDue = (now: Date) =>
  and(
    eq(dataExportsTable.status, "ready"),
    or(
      lt(dataExportsTable.expiresAt, now),
      // The requester deleted their account: their own data goes now.
      and(eq(dataExportsTable.kind, "user"), isNull(dataExportsTable.userId))
    )
  );

/** What retention logs: an archive it could not delete. */
interface RetentionLogger {
  warn: (fields: { exportId: string }, message: string) => void;
}

interface ArchiveRow {
  id: string;
  bucket: string | null;
  key: string | null;
}

/**
 * Deletes the archives of exports past their expiry and marks those exports
 * expired. Rows are read and marked under the housekeeping lock; the object
 * deletes run outside any transaction. A delete that fails is logged and its
 * row stays ready for the next run, without blocking the rows after it.
 * Resolves null when another replica holds the lock.
 */
async function expireExportArchives({
  db,
  store,
  now,
  batchSize,
  logger
}: {
  db: Database;
  store: Pick<ObjectStore, "delete">;
  now: Date;
  batchSize: number;
  logger: RetentionLogger;
}): Promise<number | null> {
  let expired = 0;
  let after: string | null = null;

  for (;;) {
    const lastId: string | null = after;
    const due: ArchiveRow[] | null = await withHousekeepingLock(db, (tx) =>
      tx
        .select({
          id: dataExportsTable.id,
          bucket: dataExportsTable.bucket,
          key: dataExportsTable.key
        })
        .from(dataExportsTable)
        .where(and(archiveDue(now), lastId === null ? undefined : gt(dataExportsTable.id, lastId)))
        .orderBy(asc(dataExportsTable.id))
        .limit(batchSize)
    );

    if (due === null) {
      return expired > 0 ? expired : null;
    }

    const deleted: string[] = [];

    for (const row of due) {
      try {
        if (row.bucket && row.key) {
          await store.delete({ bucket: row.bucket, key: row.key });
        }
        deleted.push(row.id);
      } catch {
        logger.warn({ exportId: row.id }, "expired data export archive not deleted");
      }
    }

    if (deleted.length > 0) {
      // At most one batch of ids.
      const marked = await withHousekeepingLock(db, (tx) =>
        tx
          .update(dataExportsTable)
          .set({ status: "expired", bucket: null, key: null, updatedAt: now })
          .where(and(inArray(dataExportsTable.id, deleted), eq(dataExportsTable.status, "ready")))
          .returning({ id: dataExportsTable.id })
      );
      expired += marked?.length ?? 0;
    }

    const last = due.at(-1);

    if (!last || due.length < batchSize) {
      return expired;
    }

    after = last.id;
  }
}

/**
 * Deletes rows older than their retention window, and export archives past
 * their expiry. A system job: it takes no client input. Database work runs in
 * batches under the housekeeping advisory lock, so on several replicas only
 * one deletes at a time; a step that cannot take the lock deletes nothing.
 */
export async function applyRetention({
  db,
  store,
  now,
  windows,
  logger,
  batchSize = HOUSEKEEPING_CONFIG.batchSize
}: {
  db: Database;
  store: Pick<ObjectStore, "delete">;
  now: Date;
  windows: RetentionWindows;
  logger: RetentionLogger;
  batchSize?: number;
}): Promise<RetentionCounts> {
  const rows = await runBatchPurges(db, retentionPurges(now, windows), batchSize);
  // Archives expire before the export purge, which removes their rows later.
  const exportArchives = (await expireExportArchives({ db, store, now, batchSize, logger })) ?? 0;
  const exports = await runBatchPurges(db, dataExportPurges(now, windows), batchSize);

  return { ...rows, exportArchives, ...exports };
}
