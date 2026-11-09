// Proves that an API Key request reaches only its own Organization's shared
// data, end to end over real HTTP against PGlite: the x-api-key path in
// server.ts, the rate limit buckets, the context's key scope, the resolvers,
// and the webhook fan-out. Key verification itself (hash lookup, revoke,
// expiry, creator Permissions) runs on the real plugin in packages/auth
// auth.server.api-key.db.test.ts; here `resolveApiKey` maps fixed test keys to
// scopes built by the real resolveApiKeyScope from real membership rows. A
// Session request (x-test-organization) is the positive control and manages
// Webhook Endpoints.
import type { Permission } from "@repo/auth/permissions";
import { createLogger } from "@repo/logger";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { operationFor, rootFields } from "../../schema/schema.operations.fixture";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/api-keys-tenancy-test";
process.env.API_CORS_ORIGINS = "http://localhost:3000";

const SESSION_HEADER = "x-test-organization";

const { testDatabase, testDb, enqueue, keyLookups } = await vi.hoisted(async () => {
  const { createTestDatabase } = await import("@repo/db/testing");
  const testDatabase = await createTestDatabase();
  const { vi: hoistedVi } = await import("vitest");
  return {
    testDatabase,
    testDb: testDatabase.db,
    enqueue: hoistedVi.fn<(name: string, payload: { endpointId: string }) => Promise<string>>(() =>
      Promise.resolve("job-1")
    ),
    keyLookups: hoistedVi.fn<(key: string) => void>()
  };
});

vi.mock("@repo/db", async () => {
  const schema = await import("@repo/db/schema");
  return { ...schema, db: testDb };
});

// Shaped like real keys (`kf_` and 64 letters), so they pass the format check.
const KEY_A = `kf_${"a".repeat(64)}`;
const KEY_A_SECOND = `kf_${"c".repeat(64)}`;
const KEY_B = `kf_${"b".repeat(64)}`;
const UNKNOWN_KEY = `kf_${"z".repeat(64)}`;

const TEST_KEYS = new Map<string, { organization: "orgA" | "orgB"; apiKeyId: string }>([
  [KEY_A, { organization: "orgA", apiKeyId: "00000000-0000-4000-8000-00000000000a" }],
  [KEY_A_SECOND, { organization: "orgA", apiKeyId: "00000000-0000-4000-8000-0000000000a2" }],
  [KEY_B, { organization: "orgB", apiKeyId: "00000000-0000-4000-8000-00000000000b" }]
]);

async function membershipProof(input: { organizationId: string; userId: string }) {
  const { and, eq } = await import("drizzle-orm");
  const { membersTable } = await import("@repo/db/schema");
  const { resolveRolePermissions } = await import("@repo/auth/permissions");
  const [member] = await testDb
    .select()
    .from(membersTable)
    .where(
      and(
        eq(membersTable.organizationId, input.organizationId),
        eq(membersTable.userId, input.userId)
      )
    );
  return member ? { ...member, permissions: resolveRolePermissions(member.role, []) } : null;
}

const KEY_USER = {
  email: "keys@example.test",
  emailVerified: true,
  name: "Key Owner",
  twoFactorEnabled: false
};

vi.mock("@repo/auth/server", () => ({
  createServerAuth: () => ({
    getSessionFromHeaders: (headers: Headers | Record<string, string | undefined>) => {
      const organizationId =
        headers instanceof Headers ? headers.get(SESSION_HEADER) : headers[SESSION_HEADER];
      return Promise.resolve(
        organizationId
          ? {
              activeOrganizationId: organizationId,
              expiresAt: "2099-01-01T00:00:00.000Z",
              user: { ...KEY_USER, id: fixture.userId }
            }
          : null
      );
    },
    resolveApiKey: async (key: string) => {
      keyLookups(key);
      const entry = TEST_KEYS.get(key);
      if (!entry) return null;
      const { resolveApiKeyScope } = await import("@repo/auth/scope");
      const { apiKeyGrantablePermissions, resolveRolePermissions } =
        await import("@repo/auth/permissions");
      const scope = await resolveApiKeyScope({
        apiKey: {
          id: entry.apiKeyId,
          creatorUserId: fixture.userId,
          organizationId: fixture[entry.organization],
          permissions: apiKeyGrantablePermissions(resolveRolePermissions("owner", []))
        },
        getMembership: membershipProof,
        getUser: () => Promise.resolve({ ...KEY_USER, id: fixture.userId })
      });
      return scope ? { apiKeyId: entry.apiKeyId, scope } : null;
    },
    createApiKey: () => Promise.reject(new Error("not used")),
    getOrganizationMembershipProof: membershipProof,
    getCurrentOrganizationByScope: () => Promise.resolve(null),
    listInvitationsByScope: () => Promise.resolve([]),
    listOrganizationMembersByScope: () => Promise.resolve([]),
    // Every Organization the creator belongs to, as the real listOrganizationsForUser returns.
    listOrganizationsByScope: async () => {
      const { eq } = await import("drizzle-orm");
      const { membersTable, organizationsTable } = await import("@repo/db/schema");
      return testDb
        .select({
          id: organizationsTable.id,
          name: organizationsTable.name,
          slug: organizationsTable.slug,
          role: membersTable.role
        })
        .from(membersTable)
        .innerJoin(organizationsTable, eq(organizationsTable.id, membersTable.organizationId))
        .where(eq(membersTable.userId, fixture.userId));
    }
  })
}));

const { createApiServer } = await import("../../server");
const { apiTypeDefs } = await import("../../schema/features");
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
    rateLimitConfig: {
      enabled: true,
      max: rateLimitMax,
      windowMs: 60_000,
      trustProxy: false,
      trustedProxyHops: 1
    }
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

async function post(url: string, headers: Record<string, string>, query: string) {
  return fetch(`${url}/graphql`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", ...headers },
    body: JSON.stringify({ query })
  });
}

async function runAs(key: string, query: string): Promise<GraphqlResponse> {
  return (await post(baseUrl, { "x-api-key": key }, query)).json() as Promise<GraphqlResponse>;
}

async function runInSession(organizationId: string, query: string): Promise<GraphqlResponse> {
  const response = await post(baseUrl, { [SESSION_HEADER]: organizationId }, query);
  return response.json() as Promise<GraphqlResponse>;
}

function idsOf(value: unknown): string[] {
  const items =
    typeof value === "object" && value !== null && "items" in value ? value.items : value;
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
    .values({ email: "keys@example.test", name: "Key Owner", image: "https://cdn.test/me.png" })
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

    expect(idsOf((await runAs(KEY_A, TODOS)).data?.todos)).toEqual([todoA?.id]);
    expect(idsOf((await runAs(KEY_A, ENDPOINTS)).data?.webhookEndpoints)).toEqual([
      fixture.endpointA
    ]);
    expect(idsOf((await runAs(KEY_B, ENDPOINTS)).data?.webhookEndpoints)).toEqual([
      fixture.endpointB
    ]);
  });

  it("writes into the key's Organization and sends the event to its endpoints only", async () => {
    enqueue.mockClear();

    const created = await runAs(
      KEY_A,
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

  it("lists only the key's Organization, never its creator's others", async () => {
    const organizations = "query { organizations { id } }";

    expect(idsOf((await runInSession(fixture.orgA, organizations)).data?.organizations)).toEqual(
      expect.arrayContaining([fixture.orgA, fixture.orgB])
    );
    expect(idsOf((await runAs(KEY_A, organizations)).data?.organizations)).toEqual([fixture.orgA]);
  });

  it("never reaches its creator's own data", async () => {
    const avatar = "query { publicAssets { avatarUrl } }";
    expect((await runInSession(fixture.orgA, avatar)).data?.publicAssets).toEqual({
      avatarUrl: "https://cdn.test/me.png"
    });
    expect((await runAs(KEY_A, avatar)).data?.publicAssets).toEqual({ avatarUrl: null });

    for (const query of [
      "query { notifications { items { id } } }",
      "query { conversations { items { id } } }"
    ]) {
      expect((await runAs(KEY_A, query)).errors?.[0]?.message).toContain("authentication required");
    }
  });

  it.each([
    [
      "createApiKey",
      'mutation { createApiKey(input: { name: "Nested" }) { key } }',
      "apiKey:create"
    ],
    [
      "createWebhookEndpoint",
      'mutation { createWebhookEndpoint(input: { url: "https://93.184.215.14/hook", eventTypes: ["todo:created"] }) { secret } }',
      "webhook:create"
    ],
    [
      "updateWebhookEndpoint",
      'mutation { updateWebhookEndpoint(id: "ENDPOINT", input: { url: "https://93.184.215.14/hook", eventTypes: ["todo:created"] }) { id } }',
      "webhook:update"
    ],
    ["rotateWebhookSecret", 'mutation { rotateWebhookSecret(id: "ENDPOINT") }', "webhook:update"],
    [
      "deleteWebhookEndpoint",
      'mutation { deleteWebhookEndpoint(id: "ENDPOINT") }',
      "webhook:delete"
    ]
  ])("cannot change access with %s", async (_field, mutation, permission) => {
    const response = await runAs(KEY_A, mutation.replace("ENDPOINT", fixture.endpointA));

    expect(response.errors?.[0]?.message).toContain(`permission required: ${permission}`);
    const [endpoint] = await testDb
      .select({ secret: webhookEndpointsTable.secret, url: webhookEndpointsTable.url })
      .from(webhookEndpointsTable)
      .where(eq(webhookEndpointsTable.id, fixture.endpointA));
    expect(endpoint).toEqual({ secret: "whsec_a", url: "https://a.example.com/in" });
  });
});

describe("API Key requests at the server", () => {
  it("answers an unknown key with 401 and a malformed one without a lookup", async () => {
    keyLookups.mockClear();

    expect((await post(baseUrl, { "x-api-key": UNKNOWN_KEY }, TODOS)).status).toBe(401);
    expect((await post(baseUrl, { "x-api-key": "kf_short" }, TODOS)).status).toBe(401);
    expect((await post(baseUrl, { "x-api-key": "not-a-key" }, TODOS)).status).toBe(401);
    expect(keyLookups.mock.calls).toEqual([[UNKNOWN_KEY]]);
  });

  it("gives each key its own rate limit bucket", async () => {
    const limitedUrl = await startServer(2);

    expect((await post(limitedUrl, { "x-api-key": KEY_A }, TODOS)).status).toBe(200);
    expect((await post(limitedUrl, { "x-api-key": KEY_A }, TODOS)).status).toBe(200);
    const limited = await post(limitedUrl, { "x-api-key": KEY_A }, TODOS);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await post(limitedUrl, { "x-api-key": KEY_A_SECOND }, TODOS)).status).toBe(200);
  });

  it("stops looking up keys once the client address is over its limit", async () => {
    const limitedUrl = await startServer(2);
    keyLookups.mockClear();

    expect((await post(limitedUrl, { "x-api-key": UNKNOWN_KEY }, TODOS)).status).toBe(401);
    expect((await post(limitedUrl, { "x-api-key": UNKNOWN_KEY }, TODOS)).status).toBe(401);
    expect((await post(limitedUrl, { "x-api-key": KEY_A }, TODOS)).status).toBe(429);
    expect(keyLookups).toHaveBeenCalledTimes(2);
  });
});

describe("Webhook Endpoint management", () => {
  it("refuses a private address and a port other than 443", async () => {
    const create = (url: string) =>
      runInSession(
        fixture.orgA,
        `mutation { createWebhookEndpoint(input: { url: "${url}", eventTypes: ["todo:created"] }) { secret } }`
      );

    expect((await create("https://169.254.169.254/latest")).errors?.[0]?.extensions?.reason).toBe(
      "blocked_address"
    );
    expect((await create("https://93.184.215.14:8443/hook")).errors?.[0]?.extensions?.reason).toBe(
      "port_not_allowed"
    );
  });

  it("records the URL without its query string and rotates the secret", async () => {
    const url = "https://93.184.215.14/hook?token=receiver-secret";
    const created = await runInSession(
      fixture.orgB,
      `mutation { createWebhookEndpoint(input: { url: "${url}", eventTypes: ["note:created"] }) { secret } }`
    );
    expect(created.errors).toBeUndefined();
    const storedSecret = async () => {
      const [row] = await testDb
        .select({ id: webhookEndpointsTable.id, secret: webhookEndpointsTable.secret })
        .from(webhookEndpointsTable)
        .where(eq(webhookEndpointsTable.url, url));
      if (!row) throw new Error("expected the created endpoint");
      return row;
    };
    const first = await storedSecret();

    const rotated = await runInSession(
      fixture.orgB,
      `mutation { rotateWebhookSecret(id: "${first.id}") }`
    );
    const second = await storedSecret();
    expect(rotated.data?.rotateWebhookSecret).toBe(second.secret);
    expect(second.secret).not.toBe(first.secret);

    const audit = await testDb
      .select({ action: auditEventsTable.action, metadata: auditEventsTable.metadata })
      .from(auditEventsTable)
      .where(eq(auditEventsTable.organizationId, fixture.orgB));
    expect(audit).toEqual([
      {
        action: "webhook_endpoint_created",
        metadata: { eventTypes: "note:created", url: "https://93.184.215.14/hook" }
      },
      { action: "webhook_secret_rotated", metadata: { url: "https://93.184.215.14/hook" } }
    ]);
  });
});

// What an API Key request gets from each Mutation field, called with a
// placeholder for every required argument (the first value of an enum):
// "allowed" means the same answer as its creator's Session, any other value is
// the refusal. A new Mutation field fails the sweep below until it is listed.
// SECURITY.md "Key scope" names what a key must never do.
type ApiKeyAnswer = "allowed" | "authentication required" | `permission required: ${Permission}`;

const API_KEY_MUTATIONS: Record<string, ApiKeyAnswer> = {
  "Mutation._empty": "allowed",
  "Mutation.setOrganizationTheme": "permission required: organization:update",
  "Mutation.createTodo": "allowed",
  "Mutation.generateTodos": "allowed",
  "Mutation.updateTodo": "allowed",
  "Mutation.deleteTodo": "allowed",
  "Mutation.toggleTodo": "allowed",
  "Mutation.createNote": "allowed",
  "Mutation.updateNote": "allowed",
  "Mutation.deleteNote": "allowed",
  "Mutation.addTodoToNote": "allowed",
  "Mutation.syncPush": "allowed",
  "Mutation.requestUploadUrl": "allowed",
  "Mutation.confirmUpload": "allowed",
  "Mutation.deleteFile": "allowed",
  // kind: avatar, the creator's own; the organization_logo row is below.
  "Mutation.requestPublicAssetUpload": "authentication required",
  "Mutation.confirmPublicAssetUpload": "authentication required",
  "Mutation.sendMessage": "allowed",
  "Mutation.deleteConversation": "authentication required",
  "Mutation.startCheckout": "permission required: billing:manage",
  "Mutation.openBillingPortal": "permission required: billing:manage",
  "Mutation.setFeatureFlagOverride": "allowed",
  "Mutation.clearFeatureFlagOverride": "allowed",
  "Mutation.markNotificationRead": "authentication required",
  "Mutation.markAllNotificationsRead": "authentication required",
  "Mutation.updateNotificationPreference": "authentication required",
  // kind: user; the organization row is below.
  "Mutation.requestDataExport": "authentication required",
  "Mutation.dataExportDownloadUrl": "authentication required",
  "Mutation.createApiKey": "permission required: apiKey:create",
  "Mutation.revokeApiKey": "permission required: apiKey:delete",
  "Mutation.createWebhookEndpoint": "permission required: webhook:create",
  "Mutation.updateWebhookEndpoint": "permission required: webhook:update",
  "Mutation.rotateWebhookSecret": "permission required: webhook:update",
  "Mutation.deleteWebhookEndpoint": "permission required: webhook:delete"
};

// Fields whose answer depends on an argument value the placeholder does not pick.
const API_KEY_MUTATION_VARIANTS: Array<[string, string, ApiKeyAnswer]> = [
  [
    "requestPublicAssetUpload(organization_logo)",
    'mutation { requestPublicAssetUpload(input: { kind: organization_logo, mimeType: "image/png", sizeBytes: 1 }) { __typename } }',
    "allowed"
  ],
  [
    "confirmPublicAssetUpload(organization_logo)",
    'mutation { confirmPublicAssetUpload(kind: organization_logo, stagingKey: "tenancy contract") { __typename } }',
    "allowed"
  ],
  [
    "requestDataExport(organization)",
    "mutation { requestDataExport(kind: organization) { __typename } }",
    "permission required: organization:export"
  ]
];

const mutationFields = rootFields(apiTypeDefs).filter((root) => root.operation === "mutation");

async function expectApiKeyAnswer(operation: string, answer: ApiKeyAnswer) {
  const keyError = (await runAs(KEY_A, operation)).errors?.[0]?.message;
  if (answer === "allowed") {
    const sessionError = (await runInSession(fixture.orgA, operation)).errors?.[0]?.message;
    expect(keyError).toBe(sessionError);
  } else {
    expect(keyError).toBe(answer);
  }
}

// Last in the file: allowed calls write placeholder rows into Organization A.
describe("API Key Mutation sweep", () => {
  it("lists no Mutation field the schema no longer has", () => {
    const coordinates = mutationFields.map((root) => root.coordinate);

    expect(Object.keys(API_KEY_MUTATIONS).filter((key) => !coordinates.includes(key))).toEqual([]);
  });

  describe.each(mutationFields)("$coordinate", (root) => {
    it("answers an API Key as classified", async () => {
      const answer = API_KEY_MUTATIONS[root.coordinate];
      if (answer === undefined) {
        throw new Error(`classify ${root.coordinate} in API_KEY_MUTATIONS`);
      }

      await expectApiKeyAnswer(operationFor(root), answer);
    });
  });

  it.each(API_KEY_MUTATION_VARIANTS)(
    "answers %s as classified",
    async (_name, operation, answer) => {
      await expectApiKeyAnswer(operation, answer);
    }
  );
});
