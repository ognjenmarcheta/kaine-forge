import { db, invitationsTable, organizationRolesTable } from "@repo/db";
import { and, asc, eq, gt } from "drizzle-orm";

import { parseRoleNames } from "./auth.permissions";
import { requireOrganizationPermission, type AuthenticatedOrganizationScope } from "./auth.scope";
import type { AuthInvitation } from "./auth.type";

// Invitation writes (create/accept/revoke) go through the better-auth
// organization plugin now; this module only keeps the organization-scoped
// read the ServerAuth facade exposes. better-auth owns the write-side status
// vocabulary, so only the value the read filters on lives here.
export const INVITATION_STATUSES = {
  PENDING: "pending"
} as const;

interface InvitationRow {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: Date;
}

function toAuthInvitation(row: InvitationRow): AuthInvitation {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    expiresAt: row.expiresAt.toISOString()
  };
}

export async function listInvitationsForScope(
  scope: AuthenticatedOrganizationScope
): Promise<AuthInvitation[]> {
  requireOrganizationPermission(scope, "invitation:read");

  const rows = await db
    .select()
    .from(invitationsTable)
    .where(
      and(
        eq(invitationsTable.organizationId, scope.organizationId),
        eq(invitationsTable.status, INVITATION_STATUSES.PENDING),
        gt(invitationsTable.expiresAt, new Date())
      )
    )
    .orderBy(asc(invitationsTable.createdAt));

  return rows.map(toAuthInvitation);
}

/**
 * Whether a pending, unexpired Invitation of the Organization names the Custom
 * Role, given by name or id. Accepting it would give a role that no longer
 * exists, and a later role of the same name would grant its Permissions.
 */
export async function customRoleHasPendingInvitations(params: {
  organizationId: string;
  roleId: string | null;
  roleName: string | null;
}): Promise<boolean> {
  let roleName = params.roleName;

  if (!roleName && params.roleId) {
    const [role] = await db
      .select({ role: organizationRolesTable.role })
      .from(organizationRolesTable)
      .where(
        and(
          eq(organizationRolesTable.organizationId, params.organizationId),
          eq(organizationRolesTable.id, params.roleId)
        )
      );
    roleName = role?.role ?? null;
  }

  if (!roleName) {
    return false;
  }

  const pending = await db
    .select({ role: invitationsTable.role })
    .from(invitationsTable)
    .where(
      and(
        eq(invitationsTable.organizationId, params.organizationId),
        eq(invitationsTable.status, INVITATION_STATUSES.PENDING),
        gt(invitationsTable.expiresAt, new Date())
      )
    );

  return pending.some((invitation) => parseRoleNames(invitation.role).includes(roleName));
}
