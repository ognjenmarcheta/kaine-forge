import { apiKeysTable, membersTable } from "@repo/db";
import type { TestDatabase } from "@repo/db/testing";
import type { EmailMessage } from "@repo/email";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

// The real auth instance and api-key plugin on an in-process Postgres with
// every migration applied.
vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-1234");
vi.stubEnv("BETTER_AUTH_URL", "http://localhost:4000");
vi.stubEnv("AUTH_PASSWORD_BREACH_CHECK", "false");

const { database } = vi.hoisted(() => ({
  database: { current: null as TestDatabase | null }
}));

vi.mock("@repo/db", async () => {
  const schema = await import("@repo/db/schema");
  const { createTestDatabase: create } = await import("@repo/db/testing");
  database.current = await create();
  return { ...schema, db: database.current.db };
});

vi.mock("@repo/jobs/client", () => ({
  jobQueue: { enqueue: vi.fn<(name: string, message: EmailMessage) => Promise<string>>() }
}));

const { auth } = await import("./auth.instance");
const { createApiKeyForScope, resolveApiKeyRequest } = await import("./auth.server.api-key");
const { getOrganizationMembershipProof } = await import("./auth.server.organization");

function testDb() {
  if (!database.current) {
    throw new Error("test database not created");
  }
  return database.current.db;
}

afterAll(async () => {
  await database.current?.close();
});

async function ownerScope(label: string) {
  const email = `${label}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const { user } = await auth.api.signUpEmail({
    body: { email, password: "Secret123!Secret", name: label }
  });
  const [member] = await testDb()
    .select({ organizationId: membersTable.organizationId })
    .from(membersTable)
    .where(eq(membersTable.userId, user.id));
  if (!member) {
    throw new Error("expected a Personal Organization");
  }
  const membership = await getOrganizationMembershipProof({
    organizationId: member.organizationId,
    userId: user.id
  });
  if (!membership) {
    throw new Error("expected a membership");
  }
  return {
    membership,
    organizationId: member.organizationId,
    user: { email, emailVerified: false, id: user.id, name: label, twoFactorEnabled: false },
    userId: user.id
  };
}

async function setRole(organizationId: string, userId: string, role: string) {
  await testDb()
    .update(membersTable)
    .set({ role })
    .where(and(eq(membersTable.organizationId, organizationId), eq(membersTable.userId, userId)));
}

describe("organization API Keys", () => {
  it("stores only a hash and resolves the key to its Organization, without access changes", async () => {
    const scope = await ownerScope("key-owner");

    const created = await createApiKeyForScope(scope, { name: "CI", expiresInDays: null });

    expect(created.key).toMatch(/^kf_[A-Za-z]{64}$/);
    const [row] = await testDb().select().from(apiKeysTable).where(eq(apiKeysTable.id, created.id));
    expect(row?.organizationId).toBe(scope.organizationId);
    expect(row?.start).toBe(created.key.slice(0, 7));
    expect(Object.values(row ?? {}).map(String)).not.toContain(created.key);

    const resolved = await resolveApiKeyRequest(created.key);
    expect(resolved?.apiKeyId).toBe(created.id);
    expect(resolved?.scope.organizationId).toBe(scope.organizationId);
    expect(resolved?.scope.userId).toBe(scope.userId);
    expect(resolved?.scope.apiKeyId).toBe(created.id);
    // An owner's Permissions minus every access change that could outlive the key.
    expect(resolved?.scope.membership.permissions).toEqual([
      "invitation:read",
      "team:create",
      "team:update",
      "team:delete",
      "ac:read",
      "todo:create",
      "todo:update",
      "todo:delete",
      "note:create",
      "note:update",
      "note:delete",
      "attachment:create",
      "attachment:delete",
      "logo:update",
      "audit:read",
      "featureFlag:update",
      "webhook:read"
    ]);
  });

  it("rejects a revoked key and an expired key", async () => {
    const scope = await ownerScope("key-revoke");
    const revoked = await createApiKeyForScope(scope, { name: "Revoked", expiresInDays: null });
    const expired = await createApiKeyForScope(scope, { name: "Expired", expiresInDays: 1 });

    await testDb().delete(apiKeysTable).where(eq(apiKeysTable.id, revoked.id));
    await testDb()
      .update(apiKeysTable)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(apiKeysTable.id, expired.id));

    expect(await resolveApiKeyRequest(revoked.key)).toBeNull();
    expect(await resolveApiKeyRequest(expired.key)).toBeNull();
    expect(await resolveApiKeyRequest("kf_not-a-key")).toBeNull();
  });

  it("never grants more than its creator holds now", async () => {
    const scope = await ownerScope("key-demoted");
    const created = await createApiKeyForScope(scope, { name: "Owner key", expiresInDays: null });

    await setRole(scope.organizationId, scope.userId, "member");
    const demoted = await resolveApiKeyRequest(created.key);
    expect(demoted?.scope.membership.permissions).toContain("todo:create");
    expect(demoted?.scope.membership.permissions).not.toContain("audit:read");

    await testDb()
      .delete(membersTable)
      .where(
        and(
          eq(membersTable.organizationId, scope.organizationId),
          eq(membersTable.userId, scope.userId)
        )
      );
    expect(await resolveApiKeyRequest(created.key)).toBeNull();
  });

  it("refuses to create a key for a member without apiKey:create", async () => {
    const scope = await ownerScope("key-member");
    await setRole(scope.organizationId, scope.userId, "member");

    await expect(
      createApiKeyForScope(scope, { name: "Nope", expiresInDays: null })
    ).rejects.toThrow();
  });
});
