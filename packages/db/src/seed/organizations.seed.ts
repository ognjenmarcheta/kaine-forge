import { and, eq } from "drizzle-orm";

import { db } from "../client";
import { membersTable } from "../schema/members.schema";
import { organizationsTable } from "../schema/organizations.schema";

function getPersonalSlug(userId: string): string {
  return `personal-${userId.slice(0, 8)}`;
}

export async function ensurePersonalOrganization(userId: string) {
  const slug = getPersonalSlug(userId);

  const existingOrganizations = await db
    .select()
    .from(organizationsTable)
    .where(and(eq(organizationsTable.userId, userId), eq(organizationsTable.slug, slug)))
    .limit(1);

  const existing = existingOrganizations[0];

  if (existing) {
    return existing;
  }

  const organizations = await db
    .insert(organizationsTable)
    .values({
      userId,
      name: "Personal",
      slug
    })
    .returning();

  const organization = organizations[0];

  if (!organization) {
    throw new Error("failed to create personal organization");
  }

  return organization;
}

export async function ensureOwnerMembership(params: { organizationId: string; userId: string }) {
  const members = await db
    .select()
    .from(membersTable)
    .where(
      and(
        eq(membersTable.organizationId, params.organizationId),
        eq(membersTable.userId, params.userId)
      )
    )
    .limit(1);

  if (members[0]) {
    return members[0];
  }

  const inserted = await db
    .insert(membersTable)
    .values({
      organizationId: params.organizationId,
      userId: params.userId,
      role: "owner"
    })
    .returning();

  const member = inserted[0];

  if (!member) {
    throw new Error("failed to create owner membership");
  }

  return member;
}
