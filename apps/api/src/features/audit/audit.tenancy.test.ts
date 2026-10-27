// Proves the Audit Event viewer is organization-scoped and admin-only by
// driving the real GraphQL API over HTTP against an in-process Postgres, and
// that an Attachment delete records its event with the proxy-ruled client IP.
// The same two seams as notes.tenancy.test.ts: @repo/db is PGlite, and the
// session comes from an x-test-organization header. Membership, resolvers,
// SQL, and recordAuditEvent are real.
import { createLogger } from "@repo/logger";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/audit-tenancy-test";
process.env.API_CORS_ORIGINS = "http://localhost:3000";
// No object storage: the Attachment's object delete fails fast and is logged.
vi.stubEnv("S3_ENDPOINT", "");

const TEST_ORGANIZATION_HEADER = "x-test-organization";
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
        activeOrganizationId: organizationId,
        expiresAt: "2099-01-01T00:00:00.000Z",
        user: {
          email: "auditor@example.test",
          emailVerified: true,
          twoFactorEnabled: false,
          id: USER_ID,
          name: "Auditor"
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
const { auditEventsTable, filesTable, membersTable, organizationsTable, usersTable } =
  await import("@repo/db/schema");

const ORG_A = "00000000-0000-4000-8000-00000000000a";
const ORG_B = "00000000-0000-4000-8000-00000000000b";
const ORG_C = "00000000-0000-4000-8000-00000000000c";
const EVENT_A_OLD = "00000000-0000-4000-8000-0000000000a1";
const EVENT_A_TIE_LOW = "00000000-0000-4000-8000-0000000000a2";
const EVENT_A_TIE_HIGH = "00000000-0000-4000-8000-0000000000a3";
const EVENT_B = "00000000-0000-4000-8000-0000000000b1";
const EVENT_USER = "00000000-0000-4000-8000-0000000000c1";
const EVENT_C = "00000000-0000-4000-8000-0000000000d1";
const FILE_A = "00000000-0000-4000-8000-0000000000f1";

let baseUrl: string;
let server: Server;
let wsServer: { close: () => void };

interface GraphqlResponse {
  data?: {
    auditEvents?: {
      items: Array<Record<string, unknown>>;
      pageInfo: { endCursor: string | null; hasNextPage: boolean };
    };
  } | null;
  errors?: Array<{ message: string }>;
}

async function runAs(
  organizationId: string,
  query: string,
  variables?: Record<string, unknown>,
  headers: Record<string, string> = {}
): Promise<GraphqlResponse> {
  const response = await fetch(`${baseUrl}/graphql`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      [TEST_ORGANIZATION_HEADER]: organizationId,
      ...headers
    },
    body: JSON.stringify({ query, variables })
  });
  return response.json() as Promise<GraphqlResponse>;
}

const AUDIT_EVENTS = /* GraphQL */ `
  query ($first: Int, $after: String) {
    auditEvents(first: $first, after: $after) {
      items {
        id
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`;

beforeAll(async () => {
  await testDb
    .insert(usersTable)
    .values({ email: "auditor@example.test", id: USER_ID, name: "Auditor" });
  await testDb.insert(organizationsTable).values([
    { id: ORG_A, name: "Organization A", slug: "audit-a", userId: USER_ID },
    { id: ORG_B, name: "Organization B", slug: "audit-b", userId: USER_ID },
    { id: ORG_C, name: "Organization C", slug: "audit-c", userId: USER_ID }
  ]);
  // Admin of A and C, plain member of B. C lets a foreign cursor pass the
  // admin check, so only the cursor's own Organization binding can refuse it.
  await testDb.insert(membersTable).values([
    { organizationId: ORG_A, role: "admin", userId: USER_ID },
    { organizationId: ORG_B, role: "member", userId: USER_ID },
    { organizationId: ORG_C, role: "admin", userId: USER_ID }
  ]);
  const common = {
    action: "member_left",
    actorUserId: USER_ID,
    metadata: { role: "member" },
    targetType: "member",
    targetId: USER_ID
  };
  const tie = new Date("2026-01-02T00:00:00.000Z");
  await testDb.insert(auditEventsTable).values([
    {
      ...common,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      id: EVENT_A_OLD,
      organizationId: ORG_A
    },
    { ...common, createdAt: tie, id: EVENT_A_TIE_LOW, organizationId: ORG_A },
    { ...common, createdAt: tie, id: EVENT_A_TIE_HIGH, organizationId: ORG_A },
    {
      ...common,
      createdAt: new Date("2026-01-03T00:00:00.000Z"),
      id: EVENT_B,
      organizationId: ORG_B
    },
    {
      ...common,
      createdAt: new Date("2026-01-03T00:00:00.000Z"),
      id: EVENT_C,
      organizationId: ORG_C
    },
    {
      ...common,
      action: "password_changed",
      createdAt: new Date("2026-01-04T00:00:00.000Z"),
      id: EVENT_USER,
      metadata: {},
      organizationId: null,
      targetType: "user"
    }
  ]);

  const created = createApiServer({
    logger: createLogger({ name: "audit-tenancy-test", level: "silent" }),
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

describe("audit events viewer", () => {
  it("pages the Active Organization's events newest first, never another organization's", async () => {
    const first = await runAs(ORG_A, AUDIT_EVENTS, { first: 2 });
    const second = await runAs(ORG_A, AUDIT_EVENTS, {
      after: first.data?.auditEvents?.pageInfo.endCursor,
      first: 2
    });

    expect(first.data?.auditEvents).toMatchObject({
      items: [{ id: EVENT_A_TIE_HIGH }, { id: EVENT_A_TIE_LOW }],
      pageInfo: { hasNextPage: true }
    });
    expect(second.data?.auditEvents).toMatchObject({
      items: [{ id: EVENT_A_OLD }],
      pageInfo: { hasNextPage: false }
    });
  });

  it("refuses a cursor from another Organization and returns none of its events", async () => {
    const own = await runAs(ORG_A, AUDIT_EVENTS, { first: 1 });
    const foreign = await runAs(ORG_C, AUDIT_EVENTS, {
      after: own.data?.auditEvents?.pageInfo.endCursor
    });

    // Positive control: without the cursor, C reads its own event.
    expect((await runAs(ORG_C, AUDIT_EVENTS)).data?.auditEvents?.items).toEqual([{ id: EVENT_C }]);
    expect(foreign.errors?.map((error) => error.message)).toEqual(["invalid cursor"]);
    expect(foreign.data).toBeNull();
  });

  it("refuses a malformed cursor with a GraphQL error and no events", async () => {
    const result = await runAs(ORG_A, AUDIT_EVENTS, { after: "not a cursor" });

    expect(result.errors?.map((error) => error.message)).toEqual(["invalid cursor"]);
    expect(result.data).toBeNull();
  });

  it("refuses a member who is not an owner or admin", async () => {
    const result = await runAs(ORG_B, AUDIT_EVENTS);

    expect(result.errors?.[0]?.message).toBe("admin role required");
    expect(result.data).toBeNull();
  });
});

describe("attachment delete", () => {
  it("records the delete with the proxy-appended client IP, not a forged one", async () => {
    await testDb.insert(filesTable).values({
      bucket: "test-attachments",
      id: FILE_A,
      key: `${ORG_A}/report.pdf`,
      mimeType: "application/pdf",
      organizationId: ORG_A,
      originalName: "report.pdf",
      sizeBytes: 1,
      status: "uploaded",
      uploadedBy: USER_ID
    });

    const deleted = await runAs(ORG_A, `mutation { deleteFile(fileId: "${FILE_A}") }`, undefined, {
      "user-agent": "audit-test/1.0",
      "x-forwarded-for": "198.51.100.66, 203.0.113.9"
    });
    const listed = await runAs(
      ORG_A,
      `{ auditEvents(first: 1) { items { action actor { id } targetId targetLabel ipAddress userAgent } } }`
    );

    expect(deleted.errors).toBeUndefined();
    expect(listed.data?.auditEvents?.items).toEqual([
      {
        action: "attachment_deleted",
        actor: { id: USER_ID },
        ipAddress: "203.0.113.9",
        targetId: FILE_A,
        targetLabel: "report.pdf",
        userAgent: "audit-test/1.0"
      }
    ]);
  });
});
