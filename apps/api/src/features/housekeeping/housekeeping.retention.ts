import {
  auditEventsTable,
  dataExportsTable,
  filesTable,
  notificationsTable
} from "@repo/db/schema";
import type { Database } from "@repo/db/types";
import { and, asc, eq, inArray, isNull, lt, or } from "drizzle-orm";

import { HOUSEKEEPING_CONFIG } from "./housekeeping.definition";
import { runBatchPurges, type BatchPurge } from "./housekeeping.sweep";
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

function retentionPurges(
  now: Date,
  windows: RetentionWindows,
  store: Pick<ObjectStore, "delete">
): Array<[keyof RetentionCounts, BatchPurge]> {
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
    ],
    [
      "exportArchives",
      // The archive goes first; a failed object delete throws and keeps the
      // row ready for the next run.
      async (tx, limit) => {
        const due = await tx
          .select({
            id: dataExportsTable.id,
            bucket: dataExportsTable.bucket,
            key: dataExportsTable.key
          })
          .from(dataExportsTable)
          .where(
            and(
              eq(dataExportsTable.status, "ready"),
              or(
                lt(dataExportsTable.expiresAt, now),
                // The requester deleted their account: their own data goes now.
                and(eq(dataExportsTable.kind, "user"), isNull(dataExportsTable.userId))
              )
            )
          )
          .orderBy(asc(dataExportsTable.expiresAt))
          .limit(limit);

        for (const row of due) {
          if (row.bucket && row.key) {
            await store.delete({ bucket: row.bucket, key: row.key });
          }
        }

        if (due.length > 0) {
          await tx
            .update(dataExportsTable)
            .set({ status: "expired", bucket: null, key: null, updatedAt: now })
            .where(
              inArray(
                dataExportsTable.id,
                due.map((row) => row.id)
              )
            );
        }

        return due.length;
      }
    ],
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

/**
 * Deletes rows older than their retention window, and export archives past
 * their expiry. A system job: it takes no client input. It runs in batches
 * under the housekeeping advisory lock, so on several replicas only one
 * deletes at a time; when another holds the lock, the run stops.
 */
export function applyRetention({
  db,
  store,
  now,
  windows,
  batchSize = HOUSEKEEPING_CONFIG.batchSize
}: {
  db: Database;
  store: Pick<ObjectStore, "delete">;
  now: Date;
  windows: RetentionWindows;
  batchSize?: number;
}): Promise<RetentionCounts> {
  return runBatchPurges(db, retentionPurges(now, windows, store), batchSize);
}
