import { db, membersTable, organizationsTable, usersTable } from "@repo/db";
import { and, asc, eq } from "drizzle-orm";

import { ORGANIZATION_ROLES } from "./auth.permissions";
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

export async function ensurePersonalOrganizationForUser(userId: string) {
  const existing = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, userId))
    .orderBy(asc(organizationsTable.createdAt))
    .limit(1);

  const currentOrganization = existing[0];

  if (currentOrganization) {
    const existingMembership = await db
      .select({ id: membersTable.id })
      .from(membersTable)
      .where(
        and(
          eq(membersTable.userId, userId),
          eq(membersTable.organizationId, currentOrganization.id)
        )
      )
      .limit(1);

    if (!existingMembership[0]) {
      await db.insert(membersTable).values({
        userId,
        organizationId: currentOrganization.id,
        role: ORGANIZATION_ROLES.OWNER
      });
    }

    return currentOrganization;
  }

  const createdOrganizations = await db
    .insert(organizationsTable)
    .values({
      userId,
      name: "Personal",
      slug: personalOrganizationSlug(userId)
    })
    .returning();

  const organization = createdOrganizations[0];

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

export async function getOrganizationMembershipProof(params: {
  organizationId: string;
  userId: string;
}): Promise<OrganizationMembershipProof | null> {
  const memberships = await db
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

  return memberships[0] ?? null;
}

export async function listOrganizationMembersForScope(
  scope: AuthenticatedOrganizationScope
): Promise<AuthOrganizationMember[]> {
  const membership =
    scope.membership ??
    (await getOrganizationMembershipProof({
      organizationId: scope.organizationId,
      userId: scope.userId
    }));

  if (!membership) {
    throw new Error("organization not accessible");
  }

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
