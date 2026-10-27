import { isAuditAction, type AuditAction } from "@repo/auth/audit";
import { hasRoleAtLeast, ORGANIZATION_ROLES, type OrganizationRole } from "@repo/auth/permissions";
import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import { auditEventsTable, usersTable, type AuditEventMetadataValue } from "@repo/db/schema";
import type { Database } from "@repo/db/types";
import { desc, inArray, sql } from "drizzle-orm";

import { AUDIT_CONFIG } from "./audit.definition";
import { clampPagination, type ScopedData } from "../../context.data";

export interface AuditEventsPageInput {
  after?: string | null;
  first?: number | null;
}

export interface AuditEventView {
  action: AuditAction;
  actor: { email: string; id: string; name: string } | null;
  createdAt: Date;
  id: string;
  ipAddress: string | null;
  targetId: string;
  targetLabel: string | null;
  targetType: string;
  userAgent: string | null;
}

export interface AuditEventsPage {
  endCursor: string | null;
  events: AuditEventView[];
  hasNextPage: boolean;
}

/** The Active Organization's Audit Events, readable by its owners and admins only. */
export interface AuditEvents {
  list: (input: AuditEventsPageInput) => Promise<AuditEventsPage>;
}

export interface AuditEventsDeps {
  data: ScopedData;
  db: Database;
  requireOrganizationScope: () => AuthenticatedOrganizationScope;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface Cursor {
  createdAt: Date;
  id: string;
}

// An opaque position after one event: its (created_at, id), newest first.
function encodeCursor(cursor: Cursor): string {
  return Buffer.from(`${cursor.createdAt.toISOString()}|${cursor.id}`).toString("base64url");
}

function decodeCursor(value: string): Cursor {
  const [createdAt = "", id = ""] = Buffer.from(value, "base64url").toString("utf8").split("|");
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime()) || !UUID_PATTERN.test(id)) {
    throw new Error("invalid cursor");
  }

  return { createdAt: date, id };
}

function targetLabelOf(metadata: Record<string, AuditEventMetadataValue>): string | null {
  const label = metadata.email ?? metadata.name ?? metadata.originalName;
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

      // SAFETY: member roles are written only by the better-auth organization
      // plugin from the ORGANIZATION_ROLES vocabulary, and hasRoleAtLeast fails
      // closed (returns false) for any string outside the role hierarchy.
      if (!hasRoleAtLeast(scope.membership.role as OrganizationRole, ORGANIZATION_ROLES.ADMIN)) {
        throw new Error("admin role required");
      }

      const { limit } = clampPagination({ limit: input.first }, AUDIT_CONFIG.pagination);
      const after = input.after ? decodeCursor(input.after) : null;
      const rows = await data
        .selectFrom(
          auditEventsTable,
          after
            ? sql`(${auditEventsTable.createdAt}, ${auditEventsTable.id}) < (${after.createdAt.toISOString()}::timestamptz, ${after.id}::uuid)`
            : undefined
        )
        .orderBy(desc(auditEventsTable.createdAt), desc(auditEventsTable.id))
        .limit(limit + 1);
      const page = rows.slice(0, limit);
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
      const last = page.at(-1);

      return {
        // Only recordAuditEvent writes this table, so every action is known;
        // a row from a newer release is skipped rather than failing the page.
        events: page.flatMap((row) => {
          const action = row.action;

          if (!isAuditAction(action)) {
            return [];
          }

          return [
            {
              action,
              actor: row.actorUserId ? (actorById.get(row.actorUserId) ?? null) : null,
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
        endCursor: last ? encodeCursor(last) : null,
        hasNextPage: rows.length > limit
      };
    }
  };
}
