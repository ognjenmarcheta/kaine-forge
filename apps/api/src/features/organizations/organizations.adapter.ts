import { db, membersTable, organizationsTable, usersTable } from "@repo/db";
import { and, asc, eq } from "drizzle-orm";

export async function listOrganizationsByUserId(userId: string) {
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

export async function getCurrentOrganizationById(userId: string, organizationId: string) {
  const organizations = await db
    .select({
      id: organizationsTable.id,
      name: organizationsTable.name,
      slug: organizationsTable.slug,
      role: membersTable.role
    })
    .from(membersTable)
    .innerJoin(organizationsTable, eq(membersTable.organizationId, organizationsTable.id))
    .where(and(eq(membersTable.userId, userId), eq(membersTable.organizationId, organizationId)))
    .limit(1);

  return organizations[0] ?? null;
}

export async function listOrganizationMembersByOrganizationId(
  userId: string,
  organizationId: string
) {
  const membership = await db
    .select({ id: membersTable.id })
    .from(membersTable)
    .where(and(eq(membersTable.userId, userId), eq(membersTable.organizationId, organizationId)))
    .limit(1);

  if (!membership[0]) {
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
    .where(eq(membersTable.organizationId, organizationId))
    .orderBy(asc(membersTable.createdAt));
}
