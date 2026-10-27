import { membersTable, organizationsTable, usersTable } from "@repo/db";
import type { TestDatabase } from "@repo/db/testing";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

const { database } = vi.hoisted(() => ({ database: { current: null as TestDatabase | null } }));

vi.mock("@repo/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/db")>();
  const { createTestDatabase: create } = await import("@repo/db/testing");
  database.current = await create();
  return { ...actual, db: database.current.db };
});

const { ensurePersonalOrganizationForUser, resolveActiveOrganizationForUser } =
  await import("./auth.server.organization");

function testDb(): TestDatabase["db"] {
  if (!database.current) {
    throw new Error("test database not created");
  }
  return database.current.db;
}

async function createUser(email: string): Promise<string> {
  const [user] = await testDb()
    .insert(usersTable)
    .values({ email, name: email })
    .returning({ id: usersTable.id });
  if (!user) {
    throw new Error("failed to create user");
  }
  return user.id;
}

async function membershipRole(userId: string, organizationId: string) {
  const [membership] = await testDb()
    .select({ role: membersTable.role })
    .from(membersTable)
    .where(and(eq(membersTable.userId, userId), eq(membersTable.organizationId, organizationId)));
  return membership?.role ?? null;
}

// A creator who handed their organization to another owner and was then removed.
async function createRemovedCreator(label: string) {
  const creatorId = await createUser(`${label}-creator@example.com`);
  const ownerId = await createUser(`${label}-owner@example.com`);
  const sharedOrganizationId = (await ensurePersonalOrganizationForUser(creatorId)).id;

  await testDb()
    .insert(membersTable)
    .values({ userId: ownerId, organizationId: sharedOrganizationId, role: "owner" });
  await testDb()
    .delete(membersTable)
    .where(
      and(eq(membersTable.userId, creatorId), eq(membersTable.organizationId, sharedOrganizationId))
    );

  return { creatorId, ownerId, sharedOrganizationId };
}

describe("resolveActiveOrganizationForUser with no memberships left", () => {
  afterAll(async () => {
    await database.current?.close();
  });

  it("does not restore a membership in an organization the user was removed from", async () => {
    const { creatorId, ownerId, sharedOrganizationId } = await createRemovedCreator("restore");

    const activeOrganizationId = await resolveActiveOrganizationForUser({
      userId: creatorId,
      requestedActiveOrganizationId: sharedOrganizationId
    });

    expect(activeOrganizationId).not.toBe(sharedOrganizationId);
    expect(await membershipRole(creatorId, sharedOrganizationId)).toBeNull();
    expect(await membershipRole(ownerId, sharedOrganizationId)).toBe("owner");
  });

  it("gives the user a new personal organization they own", async () => {
    const { creatorId, sharedOrganizationId } = await createRemovedCreator("replace");

    const activeOrganizationId = await resolveActiveOrganizationForUser({
      userId: creatorId,
      requestedActiveOrganizationId: null
    });

    const [organization] = await testDb()
      .select({ userId: organizationsTable.userId, name: organizationsTable.name })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, activeOrganizationId));

    expect(activeOrganizationId).not.toBe(sharedOrganizationId);
    expect(organization).toEqual({ userId: creatorId, name: "Personal" });
    expect(await membershipRole(creatorId, activeOrganizationId)).toBe("owner");
  });
});
