import { db, invitationsTable } from "@repo/db";
import { and, asc, eq, gt } from "drizzle-orm";

import { hasRoleAtLeast, ORGANIZATION_ROLES, type OrganizationRole } from "./auth.permissions";
import type { AuthenticatedOrganizationScope } from "./auth.scope";
import { getOrganizationMembershipProof } from "./auth.server.organization";
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

async function requireAdminMembership(scope: AuthenticatedOrganizationScope): Promise<void> {
  const membership =
    scope.membership ??
    (await getOrganizationMembershipProof({
      organizationId: scope.organizationId,
      userId: scope.userId
    }));

  if (
    !membership ||
    !hasRoleAtLeast(membership.role as OrganizationRole, ORGANIZATION_ROLES.ADMIN)
  ) {
    throw new Error("admin role required");
  }
}

export async function listInvitationsForScope(
  scope: AuthenticatedOrganizationScope
): Promise<AuthInvitation[]> {
  await requireAdminMembership(scope);

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
