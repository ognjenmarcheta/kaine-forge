import { isAuditAction, type AuditAction } from "@repo/auth/audit";
import {
  requireOrganizationPermission,
  type AuthenticatedOrganizationScope
} from "@repo/auth/scope";
import { auditEventsTable, usersTable, type AuditEventMetadataValue } from "@repo/db/schema";
import type { Database } from "@repo/db/types";
import { inArray } from "drizzle-orm";

import { AUDIT_CONFIG } from "./audit.definition";
import type { Connection, PageInput, ScopedData } from "../../context.data";

export interface AuditEventView {
  action: AuditAction;
  actor: { email: string; id: string; name: string } | null;
  /** The API Key the actor's request used, when one did. */
  apiKeyId: string | null;
  createdAt: Date;
  id: string;
  ipAddress: string | null;
  targetId: string;
  targetLabel: string | null;
  targetType: string;
  userAgent: string | null;
}

/** The Active Organization's Audit Events, readable with the `audit:read` permission. */
export interface AuditEvents {
  /** Newest first; throws `invalid cursor` for a malformed or foreign `after`. */
  list: (input: PageInput) => Promise<Connection<AuditEventView>>;
}

export interface AuditEventsDeps {
  data: ScopedData;
  db: Database;
  requireOrganizationScope: () => AuthenticatedOrganizationScope;
}

function targetLabelOf(metadata: Record<string, AuditEventMetadataValue>): string | null {
  const label = metadata.email ?? metadata.name ?? metadata.originalName ?? metadata.url;
  return typeof label === "string" ? label : null;
}

export function createAuditEvents({
  data,
  db,
  requireOrganizationScope
}: AuditEventsDeps): AuditEvents {
  return {
    async list(input) {
      const scope = requireOrganizationScope();

      requireOrganizationPermission(scope, "audit:read");

      const { items: page, pageInfo } = await data.page(auditEventsTable, input, {
        orderBy: auditEventsTable.createdAt,
        direction: "desc",
        limits: AUDIT_CONFIG.pagination
      });
      const actorIds = [
        ...new Set(page.flatMap((row) => (row.actorUserId ? [row.actorUserId] : [])))
      ];
      const actors =
        actorIds.length > 0
          ? await db
              .select({ email: usersTable.email, id: usersTable.id, name: usersTable.name })
              .from(usersTable)
              .where(inArray(usersTable.id, actorIds))
          : [];
      const actorById = new Map(actors.map((actor) => [actor.id, actor]));

      return {
        // Only recordAuditEvent writes this table, so every action is known;
        // a row from a newer release is skipped rather than failing the page.
        items: page.flatMap((row) => {
          const action = row.action;

          if (!isAuditAction(action)) {
            return [];
          }

          return [
            {
              action,
              actor: row.actorUserId ? (actorById.get(row.actorUserId) ?? null) : null,
              apiKeyId: typeof row.metadata.apiKeyId === "string" ? row.metadata.apiKeyId : null,
              createdAt: row.createdAt,
              id: row.id,
              ipAddress: row.ipAddress,
              targetId: row.targetId,
              targetLabel: targetLabelOf(row.metadata),
              targetType: row.targetType,
              userAgent: row.userAgent
            }
          ];
        }),
        pageInfo
      };
    }
  };
}
