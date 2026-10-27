// Proves that an API Key request reaches only its own Organization, end to end
// over real HTTP against PGlite: the x-api-key path in server.ts, the per-key
// rate limit bucket, the context's key scope, the resolvers, and the webhook
// fan-out. Key verification itself (hash lookup, revoke, expiry, creator
// Permissions) runs on the real plugin in packages/auth
// auth.server.api-key.db.test.ts; here `resolveApiKey` maps fixed test keys
// to scopes built from real membership rows.
import { createLogger } from "@repo/logger";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/api-keys-tenancy-test";
process.env.API_CORS_ORIGINS = "http://localhost:3000";

const { testDatabase, testDb, enqueue } = await vi.hoisted(async () => {
  const { createTestDatabase } = await import("@repo/db/testing");
  const testDatabase = await createTestDatabase();
  const { vi: hoistedVi } = await import("vitest");
  return {
    testDatabase,
    testDb: testDatabase.db,
    enqueue: hoistedVi.fn<(name: string, payload: { endpointId: string }) => Promise<string>>(() =>
      Promise.resolve("job-1")
    )
  };
});

vi.mock("@repo/db", async () => {
  const schema = await import("@repo/db/schema");
  return { ...schema, db: testDb };
});

// Test key → [Organization, key id]; the scope is read from real rows per request.
const TEST_KEYS = new Map<string, { organization: "orgA" | "orgB"; apiKeyId: string }>([
  ["kf_test-a", { organization: "orgA", apiKeyId: "00000000-0000-4000-8000-00000000000a" }],
  ["kf_test-a-second", { organization: "orgA", apiKeyId: "00000000-0000-4000-8000-0000000000a2" }],
  ["kf_test-b", { organization: "orgB", apiKeyId: "00000000-0000-4000-8000-00000000000b" }]
]);

vi.mock("@repo/auth/server", () => ({
  createServerAuth: () => ({
    getSessionFromHeaders: () => Promise.resolve(null),
    resolveApiKey: async (key: string) => {
      const entry = TEST_KEYS.get(key);
      if (!entry) return null;
      const { resolveApiKeyScope } = await import("@repo/auth/scope");
      const { resolveRolePermissions } = await import("@repo/auth/permissions");
      const { and, eq } = await import("drizzle-orm");
      const { membersTable } = await import("@repo/db/schema");
      const organizationId = fixture[entry.organization];
      const scope = await resolveApiKeyScope({
        apiKey: {
          id: entry.apiKeyId,
          creatorUserId: fixture.userId,
          organizationId,
          permissions: resolveRolePermissions("owner", []).filter(
            (permission) => !permission.startsWith("apiKey:")
          )
        },
        getMembership: async (input) => {
          const [member] = await testDb
            .select()
            .from(membersTable)
            .where(
              and(
                eq(membersTable.organizationId, input.organizationId),
                eq(membersTable.userId, input.userId)
              )
            );
          return member
            ? { ...member, permissions: resolveRolePermissions(member.role, []) }
            : null;
        },
        getUser: () =>
          Promise.resolve({
            email: "keys@example.test",
            emailVerified: true,
            id: fixture.userId,
            name: "Key Owner",
            twoFactorEnabled: false
          })
      });
      return scope ? { apiKeyId: entry.apiKeyId, scope } : null;
    },
    createApiKey: () => Promise.reject(new Error("not used")),
    getOrganizationMembershipProof: () => Promise.resolve(null),
    getCurrentOrganizationByScope: () => Promise.resolve(null),
    listInvitationsByScope: () => Promise.resolve([]),
    listOrganizationMembersByScope: () => Promise.resolve([]),
    listOrganizationsByScope: () => Promise.resolve([])
  })
}));

const { createApiServer } = await import("../../server");
const { setWebhookDeliveryQueue } = await import("../webhooks/webhooks.dispatch");
setWebhookDeliveryQueue((delivery) => enqueue("webhook.deliver", delivery));
const {
  auditEventsTable,
  membersTable,
  organizationsTable,
  todosTable,
  usersTable,
  webhookEndpointsTable
} = await import("@repo/db/schema");
const { eq } = await import("drizzle-orm");

const fixture = { userId: "", orgA: "", orgB: "", endpointA: "", endpointB: "" };
const servers: Array<{ server: Server; wsServer: { close: () => void } }> = [];

interface GraphqlResponse {
  data?: Record<string, unknown> | null;
  errors?: Array<{ message: string; extensions?: { reason?: string } }>;
}

async function startServer(rateLimitMax: number): Promise<string> {
  const created = createApiServer({
    logger: createLogger({ name: "api-keys-tenancy-test", level: "silent" }),
    rateLimitConfig: { enabled: true, max: rateLimitMax, windowMs: 60_000, trustProxy: false }
  });
  servers.push(created);
  await new Promise<void>((resolve) => {
    created.server.listen(0, resolve);
  });
  const address = created.server.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected server to listen on a port");
  }
  return `http://127.0.0.1:${String(address.port)}`;
}

let baseUrl: string;

async function post(
  url: string,
  key: string | null,
  query: string,
  variables?: Record<string, unknown>
) {
  return fetch(`${url}/graphql`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(key ? { "x-api-key": key } : {})
    },
    body: JSON.stringify({ query, variables })
  });
}

async function runAs(
  key: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<GraphqlResponse> {
  return (await post(baseUrl, key, query, variables)).json() as Promise<GraphqlResponse>;
}

function itemIds(response: GraphqlResponse, field: string): string[] {
  const connection = response.data?.[field];
  if (typeof connection !== "object" || connection === null || !("items" in connection)) {
    return [];
  }
  const { items } = connection;
  return Array.isArray(items)
    ? items.flatMap((item: unknown) =>
        typeof item === "object" && item !== null && "id" in item && typeof item.id === "string"
          ? [item.id]
          : []
      )
    : [];
}

beforeAll(async () => {
  const [user] = await testDb
    .insert(usersTable)
    .values({ email: "keys@example.test", name: "Key Owner" })
    .returning();
  if (!user) throw new Error("failed to seed user");
  const [orgA, orgB] = await testDb
    .insert(organizationsTable)
    .values([
      { name: "Organization A", slug: "keys-a", userId: user.id },
      { name: "Organization B", slug: "keys-b", userId: user.id }
    ])
    .returning();
  if (!orgA || !orgB) throw new Error("failed to seed organizations");
  // The key creator belongs to both, so only the key decides which one a request reaches.
  await testDb.insert(membersTable).values([
    { organizationId: orgA.id, role: "owner", userId: user.id },
    { organizationId: orgB.id, role: "owner", userId: user.id }
  ]);
  await testDb.insert(todosTable).values([
    { organizationId: orgA.id, title: "Todo A", userId: user.id },
    { organizationId: orgB.id, title: "Todo B", userId: user.id }
  ]);
  const [endpointA, endpointB] = await testDb
    .insert(webhookEndpointsTable)
    .values([
      {
        organizationId: orgA.id,
        url: "https://a.example.com/in",
        secret: "whsec_a",
        eventTypes: ["todo:created"]
      },
      {
        organizationId: orgB.id,
        url: "https://b.example.com/in",
        secret: "whsec_b",
        eventTypes: ["todo:created"]
      }
    ])
    .returning();
  if (!endpointA || !endpointB) throw new Error("failed to seed endpoints");
  Object.assign(fixture, {
    userId: user.id,
    orgA: orgA.id,
    orgB: orgB.id,
    endpointA: endpointA.id,
    endpointB: endpointB.id
  });
  baseUrl = await startServer(1000);
});

afterAll(async () => {
  for (const { server, wsServer } of servers) {
    wsServer.close();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  await testDatabase.close();
});

const TODOS = "query { todos { items { id title } } }";
const ENDPOINTS = "query { webhookEndpoints { items { id url } } }";

describe("API Key tenancy", () => {
  it("reads only the key's Organization", async () => {
    const [todoA] = await testDb
      .select({ id: todosTable.id })
      .from(todosTable)
      .where(eq(todosTable.organizationId, fixture.orgA));

    expect(itemIds(await runAs("kf_test-a", TODOS), "todos")).toEqual([todoA?.id]);
    expect(itemIds(await runAs("kf_test-a", ENDPOINTS), "webhookEndpoints")).toEqual([
      fixture.endpointA
    ]);
    expect(itemIds(await runAs("kf_test-b", ENDPOINTS), "webhookEndpoints")).toEqual([
      fixture.endpointB
    ]);
  });

  it("writes into the key's Organization and sends the event to its endpoints only", async () => {
    enqueue.mockClear();

    const created = await runAs(
      "kf_test-a",
      'mutation { createTodo(input: { title: "From a key" }) { id } }'
    );
    expect(created.errors).toBeUndefined();

    const [row] = await testDb
      .select({ organizationId: todosTable.organizationId })
      .from(todosTable)
      .where(eq(todosTable.title, "From a key"));
    expect(row?.organizationId).toBe(fixture.orgA);
    await vi.waitFor(() => expect(enqueue).toHaveBeenCalled());
    expect(enqueue.mock.calls.map(([name, payload]) => [name, payload.endpointId])).toEqual([
      ["webhook.deliver", fixture.endpointA]
    ]);
  });

  it("cannot manage API Keys or read user-level data", async () => {
    const created = await runAs(
      "kf_test-a",
      'mutation { createApiKey(input: { name: "Nested" }) { key } }'
    );
    expect(created.errors?.[0]?.message).toContain("permission required: apiKey:create");

    const inbox = await runAs("kf_test-a", "query { notifications { items { id } } }");
    expect(inbox.errors?.[0]?.message).toContain("authentication required");
  });

  it("refuses a webhook URL on a private address and records a created endpoint", async () => {
    const refused = await runAs(
      "kf_test-a",
      `mutation { createWebhookEndpoint(input: { url: "https://169.254.169.254/latest", eventTypes: ["todo:created"] }) { secret } }`
    );
    expect(refused.errors?.[0]?.extensions?.reason).toBe("blocked_address");

    const created = await runAs(
      "kf_test-b",
      `mutation { createWebhookEndpoint(input: { url: "https://93.184.215.14/hook", eventTypes: ["note:created"] }) { endpoint { id } secret } }`
    );
    expect(created.errors).toBeUndefined();
    const audit = await testDb
      .select({ action: auditEventsTable.action, organizationId: auditEventsTable.organizationId })
      .from(auditEventsTable)
      .where(eq(auditEventsTable.action, "webhook_endpoint_created"));
    expect(audit).toEqual([{ action: "webhook_endpoint_created", organizationId: fixture.orgB }]);
  });

  it("answers an unknown key with 401", async () => {
    const response = await post(baseUrl, "kf_unknown", TODOS);
    expect(response.status).toBe(401);
  });

  it("gives each key its own rate limit bucket", async () => {
    const limitedUrl = await startServer(2);

    expect((await post(limitedUrl, "kf_test-a", TODOS)).status).toBe(200);
    expect((await post(limitedUrl, "kf_test-a", TODOS)).status).toBe(200);
    const limited = await post(limitedUrl, "kf_test-a", TODOS);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await post(limitedUrl, "kf_test-a-second", TODOS)).status).toBe(200);
  });
});
