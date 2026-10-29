// Proves the Organization Theme stays inside its Organization and needs the
// organization:update Permission, by driving the real GraphQL API over HTTP against an
// in-process Postgres. The same two seams as feature-flags.tenancy.test.ts: @repo/db is
// PGlite, and the session comes from an x-test-organization header. Membership,
// resolvers, SQL, and the audit write are real.
import { createLogger } from "@repo/logger";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@localhost:5432/organization-theme-tenancy-test";
process.env.API_CORS_ORIGINS = "http://localhost:3000";

const TEST_ORGANIZATION_HEADER = "x-test-organization";
// Header value for a signed-in session with no Active Organization.
const NO_ORGANIZATION = "none";
const USER_ID = "00000000-0000-4000-8000-000000000001";

const { testDatabase, testDb } = await vi.hoisted(async () => {
  const { createTestDatabase } = await import("@repo/db/testing");
  const testDatabase = await createTestDatabase();
  return { testDatabase, testDb: testDatabase.db };
});

vi.mock("@repo/db", async () => {
  const schema = await import("@repo/db/schema");
  return { ...schema, db: testDb };
});

vi.mock("@repo/auth/server", () => ({
  createServerAuth: () => ({
    getSessionFromHeaders: (headers: Headers | Record<string, string | undefined>) => {
      const organizationId =
        headers instanceof Headers
          ? headers.get(TEST_ORGANIZATION_HEADER)
          : headers[TEST_ORGANIZATION_HEADER];

      if (!organizationId) {
        return Promise.resolve(null);
      }

      return Promise.resolve({
        activeOrganizationId: organizationId === NO_ORGANIZATION ? null : organizationId,
        expiresAt: "2099-01-01T00:00:00.000Z",
        user: {
          email: "themes@example.test",
          emailVerified: true,
          twoFactorEnabled: false,
          id: USER_ID,
          name: "Themes"
        }
      });
    },
    getOrganizationMembershipProof: async (input: { organizationId: string; userId: string }) => {
      const { and, eq } = await import("drizzle-orm");
      const { membersTable } = await import("@repo/db/schema");
      const [member] = await testDb
        .select()
        .from(membersTable)
        .where(
          and(
            eq(membersTable.organizationId, input.organizationId),
            eq(membersTable.userId, input.userId)
          )
        )
        .limit(1);
      const { resolveRolePermissions } = await import("@repo/auth/permissions");
      return member ? { ...member, permissions: resolveRolePermissions(member.role, []) } : null;
    },
    getCurrentOrganizationByScope: () => Promise.resolve(null),
    listInvitationsByScope: () => Promise.resolve([]),
    listOrganizationMembersByScope: () => Promise.resolve([]),
    listOrganizationsByScope: () => Promise.resolve([])
  })
}));

const { createApiServer } = await import("../../server");
const { auditEventsTable, membersTable, organizationsTable, usersTable } =
  await import("@repo/db/schema");
const { eq } = await import("drizzle-orm");

const ORG_A = "00000000-0000-4000-8000-00000000000a";
const ORG_B = "00000000-0000-4000-8000-00000000000b";

let baseUrl: string;
let server: Server;
let wsServer: { close: () => void };

interface GraphqlResponse {
  data?: Record<string, string> | null;
  errors?: Array<{ message: string }>;
}

async function runAs(
  organizationId: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<GraphqlResponse> {
  const response = await fetch(`${baseUrl}/graphql`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      [TEST_ORGANIZATION_HEADER]: organizationId
    },
    body: JSON.stringify({ query, variables })
  });
  return response.json() as Promise<GraphqlResponse>;
}

const ORGANIZATION_THEME = /* GraphQL */ `
  {
    organizationTheme
  }
`;
const SET_THEME = /* GraphQL */ `
  mutation ($theme: String) {
    setOrganizationTheme(theme: $theme)
  }
`;

beforeAll(async () => {
  await testDb
    .insert(usersTable)
    .values({ email: "themes@example.test", id: USER_ID, name: "Themes" });
  await testDb.insert(organizationsTable).values([
    { id: ORG_A, name: "Organization A", slug: "themes-a", userId: USER_ID },
    { id: ORG_B, name: "Organization B", slug: "themes-b", userId: USER_ID }
  ]);
  // Admin of A, plain member of B.
  await testDb.insert(membersTable).values([
    { organizationId: ORG_A, role: "admin", userId: USER_ID },
    { organizationId: ORG_B, role: "member", userId: USER_ID }
  ]);

  const created = createApiServer({
    logger: createLogger({ name: "organization-theme-tenancy-test", level: "silent" }),
    rateLimitConfig: {
      enabled: false,
      max: 1000,
      windowMs: 60_000,
      trustProxy: true,
      trustedProxyHops: 1
    }
  });
  server = created.server;
  wsServer = created.wsServer;

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected server to listen on a port");
  }
  baseUrl = `http://127.0.0.1:${String(address.port)}`;
});

afterAll(async () => {
  wsServer.close();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await testDatabase.close();
});

beforeEach(async () => {
  await testDb.update(organizationsTable).set({ theme: null });
  await testDb.delete(auditEventsTable);
});

async function storedTheme(organizationId: string) {
  const [row] = await testDb
    .select({ theme: organizationsTable.theme })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, organizationId));
  return row?.theme;
}

describe("Organization Theme", () => {
  it("applies the default theme until the Organization picks one", async () => {
    expect((await runAs(ORG_A, ORGANIZATION_THEME)).data?.organizationTheme).toBe("byte-forge");
  });

  it("changes only the Active Organization's theme", async () => {
    const set = await runAs(ORG_A, SET_THEME, { theme: "moss" });

    expect(set.errors).toBeUndefined();
    expect(set.data?.setOrganizationTheme).toBe("moss");
    expect((await runAs(ORG_A, ORGANIZATION_THEME)).data?.organizationTheme).toBe("moss");
    expect((await runAs(ORG_B, ORGANIZATION_THEME)).data?.organizationTheme).toBe("byte-forge");
  });

  it("refuses a member without the organization:update Permission and stores nothing", async () => {
    const result = await runAs(ORG_B, SET_THEME, { theme: "moss" });

    expect(result.errors?.[0]?.message).toBe("permission required: organization:update");
    expect(await storedTheme(ORG_B)).toBeNull();
  });

  it("refuses a theme that is not registered", async () => {
    const result = await runAs(ORG_A, SET_THEME, { theme: "neon" });

    expect(result.errors?.[0]?.message).toBe("theme is not registered");
    expect(await storedTheme(ORG_A)).toBeNull();
  });

  it("falls back to the default theme when the stored theme is no longer registered", async () => {
    await testDb
      .update(organizationsTable)
      .set({ theme: "retired" })
      .where(eq(organizationsTable.id, ORG_A));

    expect((await runAs(ORG_A, ORGANIZATION_THEME)).data?.organizationTheme).toBe("byte-forge");
  });

  it("records one Audit Event per change and none for a repeat", async () => {
    await runAs(ORG_A, SET_THEME, { theme: "moss" });
    await runAs(ORG_A, SET_THEME, { theme: "moss" });
    await runAs(ORG_A, SET_THEME, { theme: null });
    await runAs(ORG_A, SET_THEME, { theme: null });

    expect(
      await testDb
        .select({
          action: auditEventsTable.action,
          actorUserId: auditEventsTable.actorUserId,
          metadata: auditEventsTable.metadata,
          targetId: auditEventsTable.targetId
        })
        .from(auditEventsTable)
        .where(eq(auditEventsTable.organizationId, ORG_A))
        .orderBy(auditEventsTable.createdAt)
    ).toEqual([
      {
        action: "organization_theme_changed",
        actorUserId: USER_ID,
        metadata: { theme: "moss" },
        targetId: ORG_A
      },
      {
        action: "organization_theme_changed",
        actorUserId: USER_ID,
        metadata: { theme: null },
        targetId: ORG_A
      }
    ]);
  });
});
