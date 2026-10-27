import { db, membersTable, organizationRolesTable, organizationsTable, usersTable } from "@repo/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import {
  isBuiltInRole,
  ORGANIZATION_ROLES,
  parseRoleNames,
  resolveRolePermissions,
  roleHoldsOwnerOnlyPermission,
  type Permission
} from "./auth.permissions";
import type { AuthenticatedOrganizationScope } from "./auth.scope";
import type { OrganizationMembershipProof } from "./auth.scope";
import type { AuthOrganization, AuthOrganizationMember } from "./auth.type";
import { resolveActiveOrganizationId, slugifyOrganizationName } from "./auth.util";

interface OrganizationWriteExecutor {
  insert: typeof db.insert;
  update: typeof db.update;
}

function personalOrganizationSlug(userId: string): string {
  return `personal-${userId.slice(0, 8)}`;
}

// Why the server refuses an organization action. Each value is also the
// better-auth error code the web app translates.
export const ORGANIZATION_REFUSALS = {
  ACTIVE_ORGANIZATION_MISMATCH: "ACTIVE_ORGANIZATION_MISMATCH",
  CUSTOM_ROLE_NAME_INVALID: "CUSTOM_ROLE_NAME_INVALID",
  CUSTOM_ROLE_PERMISSION_NOT_ALLOWED: "CUSTOM_ROLE_PERMISSION_NOT_ALLOWED",
  CUSTOM_ROLE_RENAME_NOT_SUPPORTED: "CUSTOM_ROLE_RENAME_NOT_SUPPORTED",
  NO_ACTIVE_ORGANIZATION: "NO_ACTIVE_ORGANIZATION",
  ONLY_AN_OWNER_CAN_TRANSFER_OWNERSHIP: "ONLY_AN_OWNER_CAN_TRANSFER_OWNERSHIP",
  OWNER_ROLE_REQUIRES_TRANSFER: "OWNER_ROLE_REQUIRES_TRANSFER",
  PERSONAL_ORGANIZATION_CANNOT_BE_DELETED: "PERSONAL_ORGANIZATION_CANNOT_BE_DELETED",
  PERSONAL_ORGANIZATION_CANNOT_BE_LEFT: "PERSONAL_ORGANIZATION_CANNOT_BE_LEFT",
  PERSONAL_ORGANIZATION_CANNOT_BE_TRANSFERRED: "PERSONAL_ORGANIZATION_CANNOT_BE_TRANSFERRED",
  MEMBER_EXCEEDS_YOUR_PERMISSIONS: "MEMBER_EXCEEDS_YOUR_PERMISSIONS",
  ROLE_IS_ASSIGNED_TO_INVITATIONS: "ROLE_IS_ASSIGNED_TO_INVITATIONS",
  ROLE_EXCEEDS_YOUR_PERMISSIONS: "ROLE_EXCEEDS_YOUR_PERMISSIONS",
  TRANSFER_TARGET_NOT_FOUND: "TRANSFER_TARGET_NOT_FOUND"
} as const;

export type OrganizationRefusal =
  (typeof ORGANIZATION_REFUSALS)[keyof typeof ORGANIZATION_REFUSALS];

// The user's personal organizations, oldest first, each with the user's
// membership id or null when they no longer belong to it.
async function findPersonalOrganizationsForUser(userId: string) {
  return db
    .select({ organization: organizationsTable, memberId: membersTable.id })
    .from(organizationsTable)
    .leftJoin(
      membersTable,
      and(eq(membersTable.organizationId, organizationsTable.id), eq(membersTable.userId, userId))
    )
    .where(and(eq(organizationsTable.userId, userId), eq(organizationsTable.personal, true)))
    .orderBy(asc(organizationsTable.createdAt));
}

export async function ensurePersonalOrganizationForUser(userId: string) {
  const personalOrganizations = await findPersonalOrganizationsForUser(userId);
  const current = personalOrganizations.find((row) => row.memberId !== null);

  if (current) {
    return current.organization;
  }

  if (personalOrganizations.length > 0) {
    // The user no longer belongs to their personal organization: an owner
    // removed them. Never restore that membership. Start a new personal
    // organization; its slug must differ from the original one.
    const [replacement] = await db
      .insert(organizationsTable)
      .values({ userId, name: "Personal", slug: `personal-${randomUUID()}`, personal: true })
      .returning();

    if (!replacement) {
      throw new Error("failed to create personal organization");
    }

    await db.insert(membersTable).values({
      userId,
      organizationId: replacement.id,
      role: ORGANIZATION_ROLES.OWNER
    });

    return replacement;
  }

  const createdOrganizations = await db
    .insert(organizationsTable)
    .values({
      userId,
      name: "Personal",
      slug: personalOrganizationSlug(userId),
      personal: true
    })
    // Two concurrent first sign-ins can both pass the existence check; the
    // loser's slug conflict yields an empty returning array instead of a 500,
    // and the re-select below picks up the winner's row.
    .onConflictDoNothing()
    .returning();

  const organization =
    createdOrganizations[0] ?? (await findPersonalOrganizationsForUser(userId))[0]?.organization;

  if (!organization) {
    throw new Error("failed to create personal organization");
  }

  await db
    .insert(membersTable)
    .values({
      userId,
      organizationId: organization.id,
      role: ORGANIZATION_ROLES.OWNER
    })
    .onConflictDoNothing();

  return organization;
}

export async function isPersonalOrganization(organizationId: string): Promise<boolean> {
  const [organization] = await db
    .select({ personal: organizationsTable.personal })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, organizationId))
    .limit(1);

  return organization?.personal === true;
}

/**
 * Hands an organization to another member in one transaction: the target
 * becomes owner, the caller becomes admin, and organizations.user_id moves to
 * the target, so deleting the old owner's account cannot cascade the
 * organization away. Returns why it refused, or null when it moved ownership.
 */
export async function transferOrganizationOwnership(params: {
  organizationId: string;
  targetMemberId: string;
  userId: string;
}): Promise<OrganizationRefusal | null> {
  return db.transaction(async (tx) => {
    const [organization] = await tx
      .select({ personal: organizationsTable.personal })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, params.organizationId))
      .for("update");

    if (!organization) {
      return ORGANIZATION_REFUSALS.NO_ACTIVE_ORGANIZATION;
    }

    if (organization.personal) {
      return ORGANIZATION_REFUSALS.PERSONAL_ORGANIZATION_CANNOT_BE_TRANSFERRED;
    }

    const members = await tx
      .select({ id: membersTable.id, role: membersTable.role, userId: membersTable.userId })
      .from(membersTable)
      .where(eq(membersTable.organizationId, params.organizationId));
    const caller = members.find((member) => member.userId === params.userId);
    const target = members.find((member) => member.id === params.targetMemberId);

    if (!caller || !roleHoldsOwnerOnlyPermission(caller.role, "organization:transfer")) {
      return ORGANIZATION_REFUSALS.ONLY_AN_OWNER_CAN_TRANSFER_OWNERSHIP;
    }

    if (!target || target.id === caller.id) {
      return ORGANIZATION_REFUSALS.TRANSFER_TARGET_NOT_FOUND;
    }

    await tx
      .update(membersTable)
      .set({ role: ORGANIZATION_ROLES.ADMIN })
      .where(eq(membersTable.id, caller.id));
    await tx
      .update(membersTable)
      .set({ role: ORGANIZATION_ROLES.OWNER })
      .where(eq(membersTable.id, target.id));
    await tx
      .update(organizationsTable)
      .set({ userId: target.userId })
      .where(eq(organizationsTable.id, params.organizationId));

    return null;
  });
}

export async function createOwnedOrganizationForUser(params: {
  database: OrganizationWriteExecutor;
  name: string;
  userId: string;
}) {
  const baseSlug = slugifyOrganizationName(params.name);

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const suffix = attempt === 0 ? "" : `-${String(attempt + 1)}`;
    const slug = `${baseSlug}${suffix}`;
    const createdOrganizations = await params.database
      .insert(organizationsTable)
      .values({
        userId: params.userId,
        name: params.name,
        slug
      })
      .onConflictDoNothing()
      .returning();
    const organization = createdOrganizations[0];

    if (!organization) {
      continue;
    }

    await params.database
      .insert(membersTable)
      .values({
        userId: params.userId,
        organizationId: organization.id,
        role: ORGANIZATION_ROLES.OWNER
      })
      .onConflictDoNothing();

    return organization;
  }

  throw new Error("failed to create organization");
}

async function getOrganizationIdsForUser(userId: string): Promise<string[]> {
  const organizations = await db
    .select({
      organizationId: membersTable.organizationId
    })
    .from(membersTable)
    .where(eq(membersTable.userId, userId))
    .orderBy(asc(membersTable.createdAt));

  return organizations.map((organization) => organization.organizationId);
}

export async function listOrganizationsForUser(userId: string): Promise<AuthOrganization[]> {
  return db
    .select({
      id: organizationsTable.id,
      name: organizationsTable.name,
      slug: organizationsTable.slug,
      role: membersTable.role
    })
    .from(membersTable)
    .innerJoin(organizationsTable, eq(membersTable.organizationId, organizationsTable.id))
    .where(eq(membersTable.userId, userId))
    .orderBy(asc(membersTable.createdAt));
}

export async function getCurrentOrganizationForScope(
  scope: AuthenticatedOrganizationScope
): Promise<AuthOrganization | null> {
  const organizations = await db
    .select({
      id: organizationsTable.id,
      name: organizationsTable.name,
      slug: organizationsTable.slug,
      role: membersTable.role
    })
    .from(membersTable)
    .innerJoin(organizationsTable, eq(membersTable.organizationId, organizationsTable.id))
    .where(
      and(
        eq(membersTable.userId, scope.userId),
        eq(membersTable.organizationId, scope.organizationId)
      )
    )
    .limit(1);

  return organizations[0] ?? null;
}

/**
 * The Permissions `role` grants in the Organization. Built-in roles need no
 * read; Custom Roles are read from this Organization only, so a role name of
 * another Organization grants nothing.
 */
export async function loadRolePermissions(params: {
  organizationId: string;
  role: string;
}): Promise<Permission[]> {
  const customRoleNames = parseRoleNames(params.role).filter((name) => !isBuiltInRole(name));
  const customRoles =
    customRoleNames.length === 0
      ? []
      : await db
          .select({
            permission: organizationRolesTable.permission,
            role: organizationRolesTable.role
          })
          .from(organizationRolesTable)
          .where(
            and(
              eq(organizationRolesTable.organizationId, params.organizationId),
              inArray(organizationRolesTable.role, customRoleNames)
            )
          );

  return resolveRolePermissions(params.role, customRoles);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The role of the Organization's member that remove-member names by member id
 * or email; null when no member matches.
 */
export async function findMemberRole(params: {
  memberIdOrEmail: string;
  organizationId: string;
}): Promise<string | null> {
  const match = params.memberIdOrEmail.includes("@")
    ? eq(usersTable.email, params.memberIdOrEmail.toLowerCase())
    : UUID_PATTERN.test(params.memberIdOrEmail)
      ? eq(membersTable.id, params.memberIdOrEmail)
      : null;

  if (!match) {
    return null;
  }

  const [member] = await db
    .select({ role: membersTable.role })
    .from(membersTable)
    .innerJoin(usersTable, eq(membersTable.userId, usersTable.id))
    .where(and(eq(membersTable.organizationId, params.organizationId), match));

  return member?.role ?? null;
}

export async function getOrganizationMembershipProof(params: {
  organizationId: string;
  userId: string;
}): Promise<OrganizationMembershipProof | null> {
  const [membership] = await db
    .select({
      id: membersTable.id,
      organizationId: membersTable.organizationId,
      role: membersTable.role,
      userId: membersTable.userId
    })
    .from(membersTable)
    .where(
      and(
        eq(membersTable.userId, params.userId),
        eq(membersTable.organizationId, params.organizationId)
      )
    )
    .limit(1);

  if (!membership) {
    return null;
  }

  return {
    ...membership,
    permissions: await loadRolePermissions({
      organizationId: membership.organizationId,
      role: membership.role
    })
  };
}

export async function listOrganizationMembersForScope(
  scope: AuthenticatedOrganizationScope
): Promise<AuthOrganizationMember[]> {
  return db
    .select({
      id: membersTable.id,
      userId: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: membersTable.role
    })
    .from(membersTable)
    .innerJoin(usersTable, eq(membersTable.userId, usersTable.id))
    .where(eq(membersTable.organizationId, scope.organizationId))
    .orderBy(asc(membersTable.createdAt));
}

export async function resolveActiveOrganizationForUser(params: {
  requestedActiveOrganizationId: string | null;
  userId: string;
}): Promise<string> {
  const organizationIds = await getOrganizationIdsForUser(params.userId);

  const resolvedActiveOrganizationId = resolveActiveOrganizationId({
    availableOrganizationIds: organizationIds,
    requestedActiveOrganizationId: params.requestedActiveOrganizationId
  });

  if (resolvedActiveOrganizationId) {
    return resolvedActiveOrganizationId;
  }

  const personalOrganization = await ensurePersonalOrganizationForUser(params.userId);
  return personalOrganization.id;
}
