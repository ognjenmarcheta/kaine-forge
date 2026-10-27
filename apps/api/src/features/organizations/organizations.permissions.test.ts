// Proves every server check reads a named Permission by driving the real
// GraphQL API over HTTP as a member who holds a Custom Role. The same seams as
// notes.tenancy.test.ts: @repo/db is PGlite, and the session comes from an
// x-test-organization header. The membership proof resolves the role against
// the Organization's stored Custom Roles on every request, as the real one
// does; packages/auth proves that read and its tenancy.
import { createLogger } from "@repo/logger";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/permissions-test";
process.env.API_CORS_ORIGINS = "http://localhost:3000";
vi.stubEnv("S3_ENDPOINT", "");

const TEST_ORGANIZATION_HEADER = "x-test-organization";
const USER_ID = "00000000-0000-4000-8000-000000000001";
const ORG_ID = "00000000-0000-4000-8000-00000000000a";
const TODO_ID = "00000000-0000-4000-8000-0000000000e1";
const NOTE_ID = "00000000-0000-4000-8000-0000000000e2";

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

      return Promise.resolve(
        organizationId
          ? {
              activeOrganizationId: organizationId,
              expiresAt: "2099-01-01T00:00:00.000Z",
              user: {
                email: "editor@example.test",
                emailVerified: true,
                twoFactorEnabled: false,
                id: USER_ID,
                name: "Editor"
              }
            }
          : null
      );
    },
    getOrganizationMembershipProof: async (input: { organizationId: string; userId: string }) => {
      const { and, eq } = await import("drizzle-orm");
      const { membersTable, organizationRolesTable } = await import("@repo/db/schema");
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
      const customRoles = await testDb
        .select()
        .from(organizationRolesTable)
        .where(eq(organizationRolesTable.organizationId, input.organizationId));
      return member
        ? { ...member, permissions: resolveRolePermissions(member.role, customRoles) }
        : null;
    },
    getCurrentOrganizationByScope: () => Promise.resolve(null),
    listInvitationsByScope: () => Promise.resolve([]),
    listOrganizationMembersByScope: () => Promise.resolve([]),
    listOrganizationsByScope: () => Promise.resolve([])
  })
}));

const { createApiServer } = await import("../../server");
const {
  membersTable,
  notesTable,
  organizationRolesTable,
  organizationsTable,
  todosTable,
  usersTable
} = await import("@repo/db/schema");
const { eq } = await import("drizzle-orm");

let baseUrl: string;
let server: Server;
let wsServer: { close: () => void };

interface GraphqlResponse {
  data?: Record<string, unknown> | null;
  errors?: Array<{ message: string }>;
}

async function run(query: string): Promise<GraphqlResponse> {
  const response = await fetch(`${baseUrl}/graphql`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      [TEST_ORGANIZATION_HEADER]: ORG_ID
    },
    body: JSON.stringify({ query })
  });
  return response.json() as Promise<GraphqlResponse>;
}

async function setEditorPermission(permission: Record<string, string[]>): Promise<void> {
  await testDb
    .update(organizationRolesTable)
    .set({ permission: JSON.stringify(permission) })
    .where(eq(organizationRolesTable.role, "editor"));
}

beforeAll(async () => {
  await testDb
    .insert(usersTable)
    .values({ email: "editor@example.test", id: USER_ID, name: "Editor" });
  await testDb
    .insert(organizationsTable)
    .values({ id: ORG_ID, name: "Organization A", slug: "permissions-a", userId: USER_ID });
  await testDb
    .insert(organizationRolesTable)
    .values({ organizationId: ORG_ID, permission: "{}", role: "editor" });
  await testDb
    .insert(membersTable)
    .values({ organizationId: ORG_ID, role: "editor", userId: USER_ID });
  await testDb
    .insert(todosTable)
    .values({ id: TODO_ID, organizationId: ORG_ID, title: "Seeded", userId: USER_ID });
  await testDb
    .insert(notesTable)
    .values({ id: NOTE_ID, organizationId: ORG_ID, title: "Seeded", userId: USER_ID });

  const created = createApiServer({
    logger: createLogger({ name: "permissions-test", level: "silent" }),
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

describe("named permission checks", () => {
  // Each operation, the one Permission it needs, and a grant of exactly that.
  it.each([
    [
      "createTodo",
      `mutation { createTodo(input: { title: "New" }) { id } }`,
      "todo:create",
      { todo: ["create"] }
    ],
    [
      "generateTodos",
      `mutation { generateTodos(input: { prompt: "Plan a trip" }) { status } }`,
      "todo:create",
      { todo: ["create"] }
    ],
    [
      "toggleTodo",
      `mutation { toggleTodo(id: "${TODO_ID}") { id } }`,
      "todo:update",
      { todo: ["update"] }
    ],
    [
      "updateTodo",
      `mutation { updateTodo(id: "${TODO_ID}", input: { title: "Renamed" }) { id } }`,
      "todo:update",
      { todo: ["update"] }
    ],
    [
      "createNote",
      `mutation { createNote(input: { title: "New" }) { id } }`,
      "note:create",
      { note: ["create"] }
    ],
    [
      "updateNote",
      `mutation { updateNote(id: "${NOTE_ID}", input: { title: "Renamed" }) { id } }`,
      "note:update",
      { note: ["update"] }
    ],
    [
      "requestUploadUrl",
      `mutation { requestUploadUrl(input: { originalName: "a.txt", mimeType: "text/plain", sizeBytes: 1 }) { fileId } }`,
      "attachment:create",
      { attachment: ["create"] }
    ],
    [
      "requestPublicAssetUpload",
      `mutation { requestPublicAssetUpload(input: { kind: organization_logo, mimeType: "image/png", sizeBytes: 1 }) { stagingKey } }`,
      "logo:update",
      { logo: ["update"] }
    ],
    ["auditEvents", `query { auditEvents { items { id } } }`, "audit:read", { audit: ["read"] }]
  ])(
    "%s refuses a Custom Role without its permission and passes it with it",
    async (_name, query, permission, grant) => {
      await setEditorPermission({ note: ["delete"] });
      const refused = await run(query);

      await setEditorPermission(grant);
      const allowed = await run(query);

      expect(refused.errors?.map((error) => error.message)).toEqual([
        `permission required: ${permission}`
      ]);
      // Past the permission check: success, or a failure after it (no object storage here).
      expect(allowed.errors?.map((error) => error.message) ?? []).not.toContain(
        `permission required: ${permission}`
      );
    }
  );

  it("returns the caller's Permissions in the Active Organization, current on every request", async () => {
    await setEditorPermission({ note: ["create", "update"], logo: ["update"] });
    const before = await run(`query { organizationPermissions }`);

    await setEditorPermission({ note: ["create"] });
    const after = await run(`query { organizationPermissions }`);

    expect(before.data).toEqual({
      organizationPermissions: ["note:create", "note:update", "logo:update"]
    });
    expect(after.data).toEqual({ organizationPermissions: ["note:create"] });
  });

  it("deletes a Todo and a Note only with their delete permissions", async () => {
    await setEditorPermission({ todo: ["update"], note: ["update"] });
    const refused = [
      await run(`mutation { deleteTodo(id: "${TODO_ID}") }`),
      await run(`mutation { deleteNote(id: "${NOTE_ID}") }`)
    ];

    await setEditorPermission({ todo: ["delete"], note: ["delete"] });
    const allowed = [
      await run(`mutation { deleteTodo(id: "${TODO_ID}") }`),
      await run(`mutation { deleteNote(id: "${NOTE_ID}") }`)
    ];

    expect(refused.map((result) => result.errors?.[0]?.message)).toEqual([
      "permission required: todo:delete",
      "permission required: note:delete"
    ]);
    expect(allowed.map((result) => result.data)).toEqual([
      { deleteTodo: true },
      { deleteNote: true }
    ]);
  });
});
