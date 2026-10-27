import { dataExportsTable, usersTable } from "@repo/db/schema";
import type { Database } from "@repo/db/types";
import type { EmailTemplate } from "@repo/email";
import type { DataExportJobPayload } from "@repo/jobs";
import type { Logger } from "@repo/logger";
import { and, eq, inArray } from "drizzle-orm";

import {
  collectOrganizationExport,
  collectUserExport,
  DataExportTooLargeError,
  zipArchive,
  type ArchiveFiles
} from "./data-export.archive";
import { DATA_EXPORT_CONFIG } from "./data-export.definition";
import type { ObjectStore } from "../storage/attachment.store";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DataExportJobDeps {
  db: Database;
  store: Pick<ObjectStore, "delete" | "place" | "put">;
  /** How long a ready archive stays downloadable. */
  archiveTtlMs: number;
  /** Cap on the archive's JSON before compression. */
  maxArchiveBytes?: number;
  /** Web app origin for the email's link to the export section. */
  webAppUrl: string;
  /** Queues one email through the job runner (#703 templates). */
  sendEmail: (to: string, email: EmailTemplate, locale: string | null) => Promise<void>;
  logger: Pick<Logger, "error" | "warn">;
  now?: () => Date;
}

type DataExportRow = typeof dataExportsTable.$inferSelect;

function archiveKey(row: DataExportRow): string {
  return row.kind === "organization" && row.organizationId
    ? `${row.organizationId}/exports/${row.id}.zip`
    : `${DATA_EXPORT_CONFIG.userKeyPrefix}/${row.userId ?? "deleted"}/${row.id}.zip`;
}

async function collect(db: Database, row: DataExportRow): Promise<ArchiveFiles> {
  const subject = row.kind === "user" ? row.userId : row.organizationId;

  if (!subject) {
    throw new Error("export subject no longer exists");
  }

  const files =
    row.kind === "user"
      ? await collectUserExport(db, subject)
      : await collectOrganizationExport(db, subject);

  return {
    "export.json": { id: row.id, kind: row.kind, createdAt: row.createdAt },
    ...files
  };
}

/**
 * Builds one export: it collects the rows, writes one zip to the private
 * bucket, marks the export ready with its expiry, and emails the requester.
 * A failure marks the export failed and is not rethrown, so the job does not
 * retry. An export that is no longer pending or running is left alone.
 */
export function createDataExportJobHandler({
  db,
  store,
  archiveTtlMs,
  maxArchiveBytes = DATA_EXPORT_CONFIG.maxArchiveBytes,
  webAppUrl,
  sendEmail,
  logger,
  now = () => new Date()
}: DataExportJobDeps): (payload: DataExportJobPayload) => Promise<void> {
  return async ({ exportId }) => {
    const [row] = await db
      .update(dataExportsTable)
      .set({ status: "running", updatedAt: now() })
      .where(
        and(
          eq(dataExportsTable.id, exportId),
          inArray(dataExportsTable.status, ["pending", "running"])
        )
      )
      .returning();

    if (!row) {
      return;
    }

    const ref = store.place(archiveKey(row));
    let stored = false;

    try {
      const archive = await zipArchive(await collect(db, row), maxArchiveBytes);
      await store.put(ref, archive, DATA_EXPORT_CONFIG.archiveContentType);
      stored = true;
      const completedAt = now();
      const expiresAt = new Date(completedAt.getTime() + archiveTtlMs);
      await db
        .update(dataExportsTable)
        .set({
          status: "ready",
          bucket: ref.bucket,
          key: ref.key,
          sizeBytes: archive.byteLength,
          completedAt,
          expiresAt,
          updatedAt: completedAt
        })
        .where(eq(dataExportsTable.id, row.id));
    } catch (error) {
      // The error can name rows or storage details; the log names the export only.
      logger.error(
        { exportId, error: error instanceof Error ? error.name : "UnknownError" },
        "data export failed"
      );
      // A stored archive whose row never became ready would never be swept.
      if (stored) {
        await store.delete(ref).catch(() => {
          logger.warn({ exportId }, "failed data export archive not deleted");
        });
      }

      const failedAt = now();
      await db
        .update(dataExportsTable)
        .set({
          status: "failed",
          failureReason: error instanceof DataExportTooLargeError ? "too_large" : "error",
          completedAt: failedAt,
          updatedAt: failedAt
        })
        .where(eq(dataExportsTable.id, row.id));
      return;
    }

    if (!row.userId) {
      return;
    }

    // The archive is ready either way; a lost email leaves it in the export list.
    try {
      const [requester] = await db
        .select({ email: usersTable.email, locale: usersTable.locale })
        .from(usersTable)
        .where(eq(usersTable.id, row.userId))
        .limit(1);

      if (requester) {
        await sendEmail(
          requester.email,
          {
            template: "dataExportReady",
            url: new URL(row.kind === "user" ? "/account" : "/members", webAppUrl).toString(),
            expiresInDays: Math.max(1, Math.round(archiveTtlMs / DAY_MS))
          },
          requester.locale
        );
      }
    } catch {
      logger.warn({ exportId }, "data export ready email not queued");
    }
  };
}
