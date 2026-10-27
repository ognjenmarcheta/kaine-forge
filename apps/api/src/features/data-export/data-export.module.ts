import type { AuditEventInput } from "@repo/auth/audit";
import {
  requireOrganizationPermission,
  type AuthenticatedOrganizationScope
} from "@repo/auth/scope";
import { dataExportsTable } from "@repo/db/schema";
import type { Database } from "@repo/db/types";
import { and, eq, isNull, type SQL } from "drizzle-orm";
import { GraphQLError } from "graphql";

import { DATA_EXPORT_CONFIG, DATA_EXPORT_IN_PROGRESS } from "./data-export.definition";
import { pageOwnedByUser, type Connection, type PageInput } from "../../context.data";
import type { ObjectStore } from "../storage/attachment.store";

export type DataExportKind = (typeof dataExportsTable.$inferSelect)["kind"];

export interface DataExportView {
  id: string;
  kind: DataExportKind;
  status: (typeof dataExportsTable.$inferSelect)["status"];
  sizeBytes: number | null;
  failureReason: (typeof dataExportsTable.$inferSelect)["failureReason"];
  createdAt: Date;
  completedAt: Date | null;
  expiresAt: Date | null;
}

/**
 * The signed-in user's data exports. A user export holds the caller's own
 * data; an Organization export holds the Active Organization's data and needs
 * the `organization:export` Permission for every call.
 */
export interface DataExports {
  /** The caller's own exports of this kind, newest first. */
  list: (kind: DataExportKind, input: PageInput) => Promise<Connection<DataExportView>>;
  /** Records a pending export and queues its job; one in progress per kind. */
  request: (kind: DataExportKind) => Promise<DataExportView>;
  /** A presigned URL of a ready archive the caller requested. */
  downloadUrl: (id: string) => Promise<string>;
}

export interface DataExportsDeps {
  db: Database;
  store: Pick<ObjectStore, "presignDownload">;
  requireUserId: () => string;
  requireOrganizationScope: () => AuthenticatedOrganizationScope;
  /** Queues the export's job. */
  enqueue: (exportId: string) => Promise<unknown>;
  recordAuditEvent: (event: AuditEventInput) => Promise<void>;
}

type DataExportRow = typeof dataExportsTable.$inferSelect;

function toView(row: DataExportRow): DataExportView {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    sizeBytes: row.sizeBytes,
    failureReason: row.failureReason,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    expiresAt: row.expiresAt
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createDataExports({
  db,
  store,
  requireUserId,
  requireOrganizationScope,
  enqueue,
  recordAuditEvent
}: DataExportsDeps): DataExports {
  // Who the caller is for this kind, and which rows of theirs it covers. The
  // Organization comes from the session's scope, never from the client.
  const owner = (kind: DataExportKind): { userId: string; organizationId: string | null } => {
    if (kind === "user") {
      return { userId: requireUserId(), organizationId: null };
    }

    const scope = requireOrganizationScope();
    requireOrganizationPermission(scope, "organization:export");
    return { userId: scope.userId, organizationId: scope.organizationId };
  };

  const ownedBy = (kind: DataExportKind, organizationId: string | null): SQL | undefined =>
    and(
      eq(dataExportsTable.kind, kind),
      organizationId === null
        ? isNull(dataExportsTable.organizationId)
        : eq(dataExportsTable.organizationId, organizationId)
    );

  return {
    async list(kind, input) {
      const { userId, organizationId } = owner(kind);
      const page = await pageOwnedByUser(
        db,
        userId,
        dataExportsTable,
        input,
        {
          orderBy: dataExportsTable.createdAt,
          direction: "desc",
          limits: DATA_EXPORT_CONFIG.pagination
        },
        ownedBy(kind, organizationId)
      );

      return { items: page.items.map(toView), pageInfo: page.pageInfo };
    },

    async request(kind) {
      const { userId, organizationId } = owner(kind);
      // The partial unique index allows one pending or running export per
      // requester and kind, also across replicas.
      const [row] = await db
        .insert(dataExportsTable)
        .values({ kind, userId, organizationId })
        .onConflictDoNothing()
        .returning();

      if (!row) {
        throw new GraphQLError("a data export of this kind is already in progress", {
          extensions: { code: DATA_EXPORT_IN_PROGRESS }
        });
      }

      try {
        await enqueue(row.id);
      } catch (error) {
        // Without a job the export would block the next request until
        // housekeeping fails it.
        await db
          .update(dataExportsTable)
          .set({ status: "failed", completedAt: new Date(), updatedAt: new Date() })
          .where(eq(dataExportsTable.id, row.id));
        throw error;
      }

      if (organizationId) {
        await recordAuditEvent({
          action: "organization_exported",
          actorUserId: userId,
          organizationId,
          targetId: organizationId,
          metadata: {}
        });
      }

      return toView(row);
    },

    async downloadUrl(id) {
      const userId = requireUserId();
      const [row] = UUID_PATTERN.test(id)
        ? await db
            .select()
            .from(dataExportsTable)
            .where(and(eq(dataExportsTable.id, id), eq(dataExportsTable.userId, userId)))
            .limit(1)
        : [];

      if (!row || row.status !== "ready" || !row.bucket || !row.key) {
        throw new Error("data export not found");
      }

      // An Organization archive needs the Permission again, in the Organization it holds.
      const { organizationId } = owner(row.kind);

      if (organizationId !== row.organizationId) {
        throw new Error("data export not found");
      }

      if (organizationId) {
        await recordAuditEvent({
          action: "organization_export_downloaded",
          actorUserId: userId,
          organizationId,
          targetId: organizationId,
          metadata: {}
        });
      }

      return store.presignDownload(
        { bucket: row.bucket, key: row.key },
        `attachment; filename="${row.kind}-export-${row.createdAt.toISOString().slice(0, 10)}.zip"`
      );
    }
  };
}
