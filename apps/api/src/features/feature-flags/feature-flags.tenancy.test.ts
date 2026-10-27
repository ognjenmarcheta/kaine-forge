// Proves Organization overrides of feature flags stay inside their
// Organization and are owner/admin-only writes, by driving the real GraphQL API
// over HTTP against an in-process Postgres. The same two seams as
// audit.tenancy.test.ts: @repo/db is PGlite, and the session comes from an
// x-test-organization header. Membership, resolvers, SQL, and the audit write
// are real. The shipped registry has no overridable flag, so this suite adds one.
import { createLogger } from "@repo/logger";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@localhost:5432/feature-flags-tenancy-test";
process.env.API_CORS_ORIGINS = "http://localhost:3000";
// The environment layer applies to every Organization; an override beats it.
vi.stubEnv("FEATURE_FLAG_BETA_REPORTS", "false");

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

vi.mock("@repo/feature-flags", async (importOriginal) => {
  const original = await importOriginal<typeof import("@repo/feature-flags")>();
  return {
    ...original,
    FEATURE_FLAG_REGISTRY: {
      ...original.FEATURE_FLAG_REGISTRY,
      beta_reports: { defaultValue: true, organizationOverridable: true }
    }
  };
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
          email: "flags@example.test",
          emailVerified: true,
          twoFactorEnabled: false,
          id: USER_ID,
          name: "Flags"
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
      return member ?? null;
    },
    getCurrentOrganizationByScope: () => Promise.resolve(null),
    listInvitationsByScope: () => Promise.resolve([]),
    listOrganizationMembersByScope: () => Promise.resolve([]),
    listOrganizationsByScope: () => Promise.resolve([])
  })
}));

const { createApiServer } = await import("../../server");
const {
  auditEventsTable,
  featureFlagOverridesTable,
  membersTable,
  organizationsTable,
  usersTable
} = await import("@repo/db/schema");
const { eq } = await import("drizzle-orm");

const ORG_A = "00000000-0000-4000-8000-00000000000a";
const ORG_B = "00000000-0000-4000-8000-00000000000b";

let baseUrl: string;
let server: Server;
let wsServer: { close: () => void };

interface FeatureFlagEntry {
  key: string;
  enabled: boolean;
}

interface GraphqlResponse {
  data?: Record<string, FeatureFlagEntry[]> | null;
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

const FEATURE_FLAGS = /* GraphQL */ `
  {
    featureFlags {
      key
      enabled
    }
  }
`;
const SET_OVERRIDE = /* GraphQL */ `
  mutation ($key: FeatureFlagKey!, $enabled: Boolean!) {
    setFeatureFlagOverride(key: $key, enabled: $enabled) {
      key
      enabled
    }
  }
`;
const CLEAR_OVERRIDE = /* GraphQL */ `
  mutation ($key: FeatureFlagKey!) {
    clearFeatureFlagOverride(key: $key) {
      key
      enabled
    }
  }
`;

const RESOLVED_DEFAULTS = [
  { key: "organizations_visible", enabled: true },
  { key: "beta_reports", enabled: false }
];

beforeAll(async () => {
  await testDb
    .insert(usersTable)
    .values({ email: "flags@example.test", id: USER_ID, name: "Flags" });
  await testDb.insert(organizationsTable).values([
    { id: ORG_A, name: "Organization A", slug: "flags-a", userId: USER_ID },
    { id: ORG_B, name: "Organization B", slug: "flags-b", userId: USER_ID }
  ]);
  // Admin of A, plain member of B.
  await testDb.insert(membersTable).values([
    { organizationId: ORG_A, role: "admin", userId: USER_ID },
    { organizationId: ORG_B, role: "member", userId: USER_ID }
  ]);

  const created = createApiServer({
    logger: createLogger({ name: "feature-flags-tenancy-test", level: "silent" }),
    rateLimitConfig: { enabled: false, max: 1000, windowMs: 60_000, trustProxy: true }
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
  await testDb.delete(featureFlagOverridesTable);
  await testDb.delete(auditEventsTable);
});

async function overrideEvents() {
  return testDb
    .select({
      action: auditEventsTable.action,
      actorUserId: auditEventsTable.actorUserId,
      metadata: auditEventsTable.metadata,
      targetId: auditEventsTable.targetId
    })
    .from(auditEventsTable)
    .where(eq(auditEventsTable.organizationId, ORG_A))
    .orderBy(auditEventsTable.createdAt);
}

describe("feature flag overrides", () => {
  it("changes only the Active Organization's resolved flags", async () => {
    const set = await runAs(ORG_A, SET_OVERRIDE, { enabled: true, key: "beta_reports" });

    expect(set.errors).toBeUndefined();
    expect(set.data?.setFeatureFlagOverride).toEqual([
      { key: "organizations_visible", enabled: true },
      { key: "beta_reports", enabled: true }
    ]);
    expect((await runAs(ORG_A, FEATURE_FLAGS)).data?.featureFlags).toEqual([
      { key: "organizations_visible", enabled: true },
      { key: "beta_reports", enabled: true }
    ]);
    expect((await runAs(ORG_B, FEATURE_FLAGS)).data?.featureFlags).toEqual(RESOLVED_DEFAULTS);
  });

  it("refuses a member who is not an owner or admin and writes no override", async () => {
    const result = await runAs(ORG_B, SET_OVERRIDE, { enabled: true, key: "beta_reports" });

    expect(result.errors?.[0]?.message).toBe("admin role required");
    expect(
      await testDb
        .select()
        .from(featureFlagOverridesTable)
        .where(eq(featureFlagOverridesTable.organizationId, ORG_B))
    ).toEqual([]);
  });

  it("refuses an override for a flag the registry keeps global", async () => {
    const result = await runAs(ORG_A, SET_OVERRIDE, {
      enabled: false,
      key: "organizations_visible"
    });

    expect(result.errors?.[0]?.message).toBe(
      "feature flag does not allow an organization override"
    );
  });

  it("clears an override back to the environment value", async () => {
    await runAs(ORG_A, SET_OVERRIDE, { enabled: true, key: "beta_reports" });
    const cleared = await runAs(ORG_A, CLEAR_OVERRIDE, { key: "beta_reports" });

    expect(cleared.data?.clearFeatureFlagOverride).toEqual(RESOLVED_DEFAULTS);
    expect((await runAs(ORG_A, FEATURE_FLAGS)).data?.featureFlags).toEqual(RESOLVED_DEFAULTS);
  });

  it("records one Audit Event per change and none for a repeat", async () => {
    await runAs(ORG_A, SET_OVERRIDE, { enabled: true, key: "beta_reports" });
    await runAs(ORG_A, SET_OVERRIDE, { enabled: true, key: "beta_reports" });
    await runAs(ORG_A, CLEAR_OVERRIDE, { key: "beta_reports" });
    await runAs(ORG_A, CLEAR_OVERRIDE, { key: "beta_reports" });

    expect(await overrideEvents()).toEqual([
      {
        action: "feature_flag_override_changed",
        actorUserId: USER_ID,
        metadata: { enabled: true, flag: "beta_reports" },
        targetId: ORG_A
      },
      {
        action: "feature_flag_override_changed",
        actorUserId: USER_ID,
        metadata: { enabled: null, flag: "beta_reports" },
        targetId: ORG_A
      }
    ]);
  });

  it("answers a session without an Active Organization with defaults and environment values", async () => {
    await runAs(ORG_A, SET_OVERRIDE, { enabled: true, key: "beta_reports" });

    expect((await runAs(NO_ORGANIZATION, FEATURE_FLAGS)).data?.featureFlags).toEqual(
      RESOLVED_DEFAULTS
    );
  });
});
