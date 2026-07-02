import { db, invitationsTable, membersTable } from "@repo/db";
import type { EmailSender } from "@repo/email";
import { and, asc, eq, gt } from "drizzle-orm";

import { AUTH_DEFINITIONS } from "./auth.definition";
import { hasRoleAtLeast, ORGANIZATION_ROLES, type OrganizationRole } from "./auth.permissions";
import type { AuthenticatedOrganizationScope } from "./auth.scope";
import { getOrganizationMembershipProof } from "./auth.server.organization";
import type { AuthInvitation, AuthSessionUser } from "./auth.type";

export const INVITATION_STATUSES = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  REVOKED: "revoked"
} as const;

const INVITABLE_ROLES: readonly OrganizationRole[] = [
  ORGANIZATION_ROLES.ADMIN,
  ORGANIZATION_ROLES.MEMBER
];

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

export async function createInvitationForScope(params: {
  email: string;
  emailSender: EmailSender;
  role: string;
  scope: AuthenticatedOrganizationScope;
}): Promise<AuthInvitation> {
  await requireAdminMembership(params.scope);

  const email = params.email.trim().toLowerCase();

  if (!email) {
    throw new Error("email is required");
  }

  if (!INVITABLE_ROLES.includes(params.role as OrganizationRole)) {
    throw new Error("role must be admin or member");
  }

  const pendingInvitations = await db
    .select()
    .from(invitationsTable)
    .where(
      and(
        eq(invitationsTable.organizationId, params.scope.organizationId),
        eq(invitationsTable.email, email),
        eq(invitationsTable.status, INVITATION_STATUSES.PENDING),
        gt(invitationsTable.expiresAt, new Date())
      )
    )
    .limit(1);

  if (pendingInvitations[0]) {
    throw new Error("invitation already pending for this email");
  }

  const expiresAt = new Date(Date.now() + AUTH_DEFINITIONS.INVITATION_MAX_AGE_SECONDS * 1000);

  const invitations = await db
    .insert(invitationsTable)
    .values({
      organizationId: params.scope.organizationId,
      email,
      role: params.role,
      status: INVITATION_STATUSES.PENDING,
      expiresAt,
      inviterId: params.scope.userId
    })
    .returning();

  const invitation = invitations[0];

  if (!invitation) {
    throw new Error("failed to create invitation");
  }

  try {
    await params.emailSender.send({
      to: email,
      subject: "You have been invited to an organization",
      text: `You were invited to join an organization as ${params.role}. Sign in with this email address and accept invitation ${invitation.id} before ${expiresAt.toISOString()}.`
    });
  } catch {
    throw new Error("invitation created but email delivery failed");
  }

  return toAuthInvitation(invitation);
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

export async function acceptInvitation(params: {
  invitationId: string;
  user: AuthSessionUser;
}): Promise<void> {
  const invitations = await db
    .select()
    .from(invitationsTable)
    .where(eq(invitationsTable.id, params.invitationId))
    .limit(1);

  const invitation = invitations[0];

  if (!invitation || invitation.status !== INVITATION_STATUSES.PENDING) {
    throw new Error("invitation not found");
  }

  if (invitation.email !== params.user.email.toLowerCase()) {
    throw new Error("invitation not found");
  }

  if (invitation.expiresAt.getTime() <= Date.now()) {
    throw new Error("invitation expired");
  }

  await db.transaction(async (transaction) => {
    const accepted = await transaction
      .update(invitationsTable)
      .set({ status: INVITATION_STATUSES.ACCEPTED })
      .where(
        and(
          eq(invitationsTable.id, invitation.id),
          eq(invitationsTable.status, INVITATION_STATUSES.PENDING)
        )
      )
      .returning();

    if (!accepted[0]) {
      throw new Error("invitation not found");
    }

    await transaction
      .insert(membersTable)
      .values({
        userId: params.user.id,
        organizationId: invitation.organizationId,
        role: invitation.role
      })
      .onConflictDoNothing();
  });
}

export async function revokeInvitationForScope(params: {
  invitationId: string;
  scope: AuthenticatedOrganizationScope;
}): Promise<void> {
  await requireAdminMembership(params.scope);

  const revoked = await db
    .update(invitationsTable)
    .set({ status: INVITATION_STATUSES.REVOKED })
    .where(
      and(
        eq(invitationsTable.id, params.invitationId),
        eq(invitationsTable.organizationId, params.scope.organizationId),
        eq(invitationsTable.status, INVITATION_STATUSES.PENDING)
      )
    )
    .returning();

  if (!revoked[0]) {
    throw new Error("invitation not found");
  }
}
