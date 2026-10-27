// Proves a user reads, marks, configures, and receives only their own
// Notifications, by driving the real GraphQL API over HTTP against an
// in-process Postgres. The same two seams as audit.tenancy.test.ts: @repo/db
// is PGlite, and the session comes from an x-test-user header. Resolvers, SQL,
// and the subscription filter are real.
import { createLogger } from "@repo/logger";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/notifications-test";
process.env.API_CORS_ORIGINS = "http://localhost:3000";

const TEST_USER_HEADER = "x-test-user";
const USER_A = "00000000-0000-4000-8000-0000000000a0";
const USER_B = "00000000-0000-4000-8000-0000000000b0";
const ORG_A = "00000000-0000-4000-8000-00000000000a";
const ORG_B = "00000000-0000-4000-8000-00000000000b";
const ACTIVE_ORGANIZATION: Record<string, string> = { [USER_A]: ORG_A, [USER_B]: ORG_B };

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
      const userId =
        headers instanceof Headers ? headers.get(TEST_USER_HEADER) : headers[TEST_USER_HEADER];

      if (!userId) {
        return Promise.resolve(null);
      }

      return Promise.resolve({
        activeOrganizationId: ACTIVE_ORGANIZATION[userId],
        expiresAt: "2099-01-01T00:00:00.000Z",
        user: {
          email: `${userId}@example.test`,
          emailVerified: true,
          twoFactorEnabled: false,
          id: userId,
          name: "User"
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
const { pubsub } = await import("../../pubsub");
const { notificationsResolvers } = await import("./notifications.router");
const { membersTable, notificationsTable, organizationsTable, usersTable } =
  await import("@repo/db/schema");
const { eq } = await import("drizzle-orm");

const A_OLD = "00000000-0000-4000-8000-0000000000a1";
const A_NEW = "00000000-0000-4000-8000-0000000000a2";
const A_READ = "00000000-0000-4000-8000-0000000000a3";
const B_ONE = "00000000-0000-4000-8000-0000000000b1";
const B_TWO = "00000000-0000-4000-8000-0000000000b2";
const B_RETIRED = "00000000-0000-4000-8000-0000000000b3";

let baseUrl: string;
let server: Server;
let wsServer: { close: () => void };

interface GraphqlResponse {
  data?: Record<string, unknown> | null;
  errors?: Array<{ message: string }>;
}

async function runAs(
  userId: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<GraphqlResponse> {
  const response = await fetch(`${baseUrl}/graphql`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      [TEST_USER_HEADER]: userId
    },
    body: JSON.stringify({ query, variables })
  });
  return response.json() as Promise<GraphqlResponse>;
}

const NOTIFICATIONS = /* GraphQL */ `
  query ($first: Int, $after: String) {
    notifications(first: $first, after: $after) {
      items {
        id
        type
        organizationId
        readAt
        payload {
          ... on RoleChangedNotification {
            organizationName
            role
          }
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
      unreadCount
    }
  }
`;

async function readAtOf(id: string): Promise<Date | null | undefined> {
  const [row] = await testDb
    .select({ readAt: notificationsTable.readAt })
    .from(notificationsTable)
    .where(eq(notificationsTable.id, id));
  return row?.readAt;
}

beforeAll(async () => {
  await testDb.insert(usersTable).values([
    { email: "a@example.test", id: USER_A, name: "A" },
    { email: "b@example.test", id: USER_B, name: "B" }
  ]);
  await testDb.insert(organizationsTable).values([
    { id: ORG_A, name: "Organization A", slug: "notify-a", userId: USER_A },
    { id: ORG_B, name: "Organization B", slug: "notify-b", userId: USER_B }
  ]);
  await testDb.insert(membersTable).values([
    { organizationId: ORG_A, role: "owner", userId: USER_A },
    { organizationId: ORG_B, role: "owner", userId: USER_B }
  ]);
  const roleChanged = (organizationName: string) => ({
    payload: { organizationName, role: "admin" },
    type: "role_changed"
  });
  await testDb.insert(notificationsTable).values([
    {
      ...roleChanged("Organization A"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      id: A_OLD,
      organizationId: ORG_A,
      userId: USER_A
    },
    // About Organization B, which A is not a member of: the inbox still shows it.
    {
      ...roleChanged("Organization B"),
      createdAt: new Date("2026-01-03T00:00:00.000Z"),
      id: A_NEW,
      organizationId: ORG_B,
      userId: USER_A
    },
    {
      ...roleChanged("Organization A"),
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
      id: A_READ,
      organizationId: ORG_A,
      readAt: new Date("2026-01-02T01:00:00.000Z"),
      userId: USER_A
    },
    {
      ...roleChanged("Organization B"),
      createdAt: new Date("2026-01-04T00:00:00.000Z"),
      id: B_ONE,
      organizationId: ORG_B,
      userId: USER_B
    },
    {
      ...roleChanged("Organization B"),
      createdAt: new Date("2026-01-05T00:00:00.000Z"),
      id: B_TWO,
      organizationId: ORG_B,
      userId: USER_B
    },
    // A type this release no longer knows: the inbox cannot show it.
    {
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      id: B_RETIRED,
      organizationId: ORG_B,
      payload: {},
      type: "retired_type",
      userId: USER_B
    }
  ]);

  const created = createApiServer({
    logger: createLogger({ name: "notifications-test", level: "silent" }),
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

describe("notifications inbox", () => {
  it("pages the caller's own Notifications newest first with their unread count", async () => {
    const first = await runAs(USER_A, NOTIFICATIONS, { first: 2 });
    const second = await runAs(USER_A, NOTIFICATIONS, {
      after: (first.data?.notifications as { pageInfo: { endCursor: string } }).pageInfo.endCursor,
      first: 2
    });

    expect(first.data?.notifications).toEqual({
      items: [
        {
          id: A_NEW,
          organizationId: ORG_B,
          payload: { organizationName: "Organization B", role: "admin" },
          readAt: null,
          type: "role_changed"
        },
        expect.objectContaining({ id: A_READ, readAt: "2026-01-02T01:00:00.000Z" })
      ],
      pageInfo: { endCursor: expect.any(String), hasNextPage: true },
      unreadCount: 2
    });
    expect(second.data?.notifications).toMatchObject({
      items: [{ id: A_OLD }],
      pageInfo: { hasNextPage: false },
      unreadCount: 2
    });
  });

  it("refuses another user's cursor", async () => {
    const own = await runAs(USER_B, NOTIFICATIONS, { first: 1 });
    const foreign = await runAs(USER_A, NOTIFICATIONS, {
      after: (own.data?.notifications as { pageInfo: { endCursor: string } }).pageInfo.endCursor
    });

    expect(foreign.errors?.map((error) => error.message)).toEqual(["invalid cursor"]);
    expect(foreign.data).toBeNull();
  });

  it("refuses a caller without a session", async () => {
    const response = await fetch(`${baseUrl}/graphql`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ query: NOTIFICATIONS })
    });
    const result = (await response.json()) as GraphqlResponse;

    expect(result.errors?.map((error) => error.message)).toEqual(["authentication required"]);
  });
});

describe("marking Notifications read", () => {
  const MARK_READ = /* GraphQL */ `
    mutation ($id: ID!) {
      markNotificationRead(id: $id) {
        id
        readAt
      }
    }
  `;

  it("marks the caller's own Notification read", async () => {
    const result = await runAs(USER_B, MARK_READ, { id: B_ONE });

    expect(result.data?.markNotificationRead).toEqual({ id: B_ONE, readAt: expect.any(String) });
    expect(await readAtOf(B_ONE)).toBeInstanceOf(Date);
  });

  it("refuses a Notification the inbox cannot show and leaves it unread", async () => {
    const result = await runAs(USER_B, MARK_READ, { id: B_RETIRED });

    expect(result.errors?.map((error) => error.message)).toEqual(["notification not readable"]);
    expect(await readAtOf(B_RETIRED)).toBeNull();
  });

  it("returns not found for another user's Notification and leaves it unread", async () => {
    const result = await runAs(USER_A, MARK_READ, { id: B_TWO });

    expect(result.errors?.map((error) => error.message)).toEqual(["notification not found"]);
    expect(await readAtOf(B_TWO)).toBeNull();
  });

  it("marks all of the caller's unread Notifications and none of another user's", async () => {
    const result = await runAs(USER_A, "mutation { markAllNotificationsRead }");

    expect(result.data?.markAllNotificationsRead).toBe(2);
    expect(await readAtOf(A_OLD)).toBeInstanceOf(Date);
    expect(await readAtOf(A_NEW)).toBeInstanceOf(Date);
    expect(await readAtOf(B_TWO)).toBeNull();
  });
});

describe("notification preferences", () => {
  const PREFERENCES = /* GraphQL */ `
    query {
      notificationPreferences {
        type
        inApp
        email
        emailAvailable
      }
    }
  `;

  it("changes only the caller's channels for one type", async () => {
    const updated = await runAs(
      USER_A,
      /* GraphQL */ `
        mutation {
          updateNotificationPreference(input: { type: role_changed, inApp: true, email: false }) {
            type
            inApp
            email
          }
        }
      `
    );

    expect(updated.data?.updateNotificationPreference).toEqual({
      email: false,
      inApp: true,
      type: "role_changed"
    });
    expect((await runAs(USER_A, PREFERENCES)).data?.notificationPreferences).toEqual([
      { email: false, emailAvailable: false, inApp: true, type: "invitation_received" },
      { email: false, emailAvailable: true, inApp: true, type: "role_changed" }
    ]);
    expect((await runAs(USER_B, PREFERENCES)).data?.notificationPreferences).toEqual([
      { email: false, emailAvailable: false, inApp: true, type: "invitation_received" },
      { email: true, emailAvailable: true, inApp: true, type: "role_changed" }
    ]);
  });

  it("keeps the email channel off for a type without one", async () => {
    const updated = await runAs(
      USER_B,
      /* GraphQL */ `
        mutation {
          updateNotificationPreference(
            input: { type: invitation_received, inApp: false, email: true }
          ) {
            type
            inApp
            email
          }
        }
      `
    );

    expect(updated.data?.updateNotificationPreference).toEqual({
      email: false,
      inApp: false,
      type: "invitation_received"
    });
  });
});

describe("notificationReceived subscription", () => {
  it("streams a new Notification to its recipient only", async () => {
    const stream = notificationsResolvers.Subscription.notificationReceived.subscribe(
      undefined,
      undefined,
      { pubsub, requireUserId: () => USER_A }
    );
    const iterator = stream[Symbol.asyncIterator]();
    const next = iterator.next();
    const notification = {
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
      id: A_OLD,
      organizationId: ORG_A,
      payload: { graphqlType: "RoleChangedNotification", organizationName: "A", role: "admin" },
      readAt: null,
      type: "role_changed" as const
    };

    pubsub.publish("notification:created", {
      notification: { ...notification, id: B_ONE },
      userId: USER_B
    });
    pubsub.publish("notification:created", { notification, userId: USER_A });

    await expect(next).resolves.toEqual({
      done: false,
      value: { notification, userId: USER_A }
    });
    await iterator.return?.();
  });
});
