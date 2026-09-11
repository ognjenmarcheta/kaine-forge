// Proves organization scoping by driving real GraphQL operations over real HTTP
// against a real Postgres, with no Docker and no browser. Every other API
// feature test mocks the adapter and stubs requireOrganizationScope, so the
// tenancy predicate that keeps one organization's rows away from another is
// never actually executed outside the Playwright suite.
//
// Two seams, both at the test-runner level rather than in production code:
//   - vi.mock("@repo/db") swaps the pg-backed singleton for PGlite. A module
//     reaching the client through a different specifier (health.router.ts
//     imports `pool` from "@repo/db/client") would escape it, so every
//     assertion below carries a positive control — the owning organization's
//     rows must come back — and an escape shows up as an empty result rather
//     than a false pass.
//   - vi.mock("@repo/auth/server") swaps the session lookup for one driven by
//     an x-test-organization request header. Everything downstream of it is
//     real: the Yoga pipeline, the context factory, the membership gate, the
//     resolvers, the DataLoaders, and the SQL.
//
// PGlite is Postgres compiled to WASM, single-connection and in-process, so
// nothing here covers the pg pool, concurrency, or resolveSslConfig.
import { createLogger } from "@repo/logger";
import type { Server } from "node:http";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The db client and better-auth both assert DATABASE_URL at import time. No
// connection is made through either: @repo/db is mocked below, and better-auth
// only builds its adapter.
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/notes-tenancy-test";
process.env.API_CORS_ORIGINS = "http://localhost:3000";

const TEST_ORGANIZATION_HEADER = "x-test-organization";

const { client, testDb } = await vi.hoisted(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const pglite = new PGlite();
  return { client: pglite, testDb: drizzle(pglite) };
});

// Spreading @repo/db/schema rather than importOriginal() keeps
// packages/db/src/client.ts out of this module graph entirely.
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
          email: "tenant@example.test",
          emailVerified: true,
          id: fixture.userId,
          name: "Tenant User"
        }
      });
    },
    // A real query, so the real resolveAuthenticatedOrganizationScope
    // membership gate runs against real rows.
    getOrganizationMembershipProof: async (input: { organizationId: string; userId: string }) => {
      const { and, eq } = await import("drizzle-orm");
      const { membersTable } = await import("@repo/db/schema");
      const rows = await testDb
        .select()
        .from(membersTable)
        .where(
          and(
            eq(membersTable.organizationId, input.organizationId),
            eq(membersTable.userId, input.userId)
          )
        )
        .limit(1);
      const member = rows[0];
      return member ?? null;
    },
    getCurrentOrganizationByScope: () => Promise.resolve(null),
    listInvitationsByScope: () => Promise.resolve([]),
    listOrganizationMembersByScope: () => Promise.resolve([]),
    listOrganizationsByScope: () => Promise.resolve([])
  })
}));

const { createApiServer } = await import("../../server");
const { membersTable, notesTable, organizationsTable, todosTable, usersTable } =
  await import("@repo/db/schema");

interface Fixture {
  userId: string;
  orgA: string;
  orgB: string;
  noteA: string;
  noteB: string;
  todoA: string;
}

let fixture: Fixture;
let baseUrl: string;
let server: Server;
let wsServer: { close: () => void };

interface GraphqlResponse {
  data?: Record<string, unknown> | null;
  errors?: Array<{ message: string }>;
}

async function runAs(organizationId: string | null, query: string): Promise<GraphqlResponse> {
  const response = await fetch(`${baseUrl}/graphql`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(organizationId ? { [TEST_ORGANIZATION_HEADER]: organizationId } : {})
    },
    body: JSON.stringify({ query })
  });
  return response.json() as Promise<GraphqlResponse>;
}

function notesOf(response: GraphqlResponse): Array<{ id: string; todos?: Array<{ id: string }> }> {
  const notes = response.data?.["notes"];
  return Array.isArray(notes) ? notes : [];
}

beforeAll(async () => {
  await client.waitReady;

  const { migrate } = await import("drizzle-orm/pglite/migrator");
  await migrate(testDb, {
    migrationsFolder: path.join(import.meta.dirname, "../../../../../packages/db/drizzle")
  });

  const [user] = await testDb
    .insert(usersTable)
    .values({ email: "tenant@example.test", name: "Tenant User" })
    .returning();
  if (!user) throw new Error("failed to seed user");

  const [orgA, orgB] = await testDb
    .insert(organizationsTable)
    .values([
      { name: "Organization A", slug: "org-a", userId: user.id },
      { name: "Organization B", slug: "org-b", userId: user.id }
    ])
    .returning();
  if (!orgA || !orgB) throw new Error("failed to seed organizations");

  // Membership in A only: organization B exists and holds rows this user must
  // never reach.
  await testDb
    .insert(membersTable)
    .values({ organizationId: orgA.id, role: "owner", userId: user.id });

  const [noteA, noteB] = await testDb
    .insert(notesTable)
    .values([
      { body: "belongs to A", organizationId: orgA.id, title: "Note A", userId: user.id },
      { body: "belongs to B", organizationId: orgB.id, title: "Note B", userId: user.id }
    ])
    .returning();
  if (!noteA || !noteB) throw new Error("failed to seed notes");

  // The third row is deliberately inconsistent: organization B's todo hung off
  // organization A's note. Nothing in the schema forbids it, and it is the only
  // fixture that can reach the DataLoader's own organization filter — with
  // note ids already scoped upstream, a batch otherwise never sees foreign rows,
  // so without this row the loader's guard is untested (verified by mutation:
  // dropping it from listTodosByNoteIds left the suite green).
  const [todoA] = await testDb
    .insert(todosTable)
    .values([
      { noteId: noteA.id, organizationId: orgA.id, title: "Todo A", userId: user.id },
      { noteId: noteB.id, organizationId: orgB.id, title: "Todo B", userId: user.id },
      { noteId: noteA.id, organizationId: orgB.id, title: "Todo cross-org", userId: user.id }
    ])
    .returning();
  if (!todoA) throw new Error("failed to seed todos");

  fixture = {
    noteA: noteA.id,
    noteB: noteB.id,
    orgA: orgA.id,
    orgB: orgB.id,
    todoA: todoA.id,
    userId: user.id
  };

  const created = createApiServer({
    logger: createLogger({ name: "notes-tenancy-test", level: "silent" }),
    rateLimitConfig: { enabled: false, max: 1000, windowMs: 60_000, trustProxy: false }
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
  await client.close();
});

describe("notes tenancy", () => {
  it("lists only the active organization's notes", async () => {
    const result = await runAs(fixture.orgA, "{ notes { id title } }");
    const ids = notesOf(result).map((note) => note.id);

    expect(result.errors).toBeUndefined();
    expect(ids).toEqual([fixture.noteA]);
    expect(ids).not.toContain(fixture.noteB);
  });

  it("hides a note owned by another organization from the point read", async () => {
    const result = await runAs(fixture.orgA, `{ note(id: "${fixture.noteB}") { id } }`);

    // null rather than an error: the adapter filters in SQL instead of reading
    // the row and rejecting it afterwards.
    expect(result.errors).toBeUndefined();
    expect(result.data?.["note"]).toBeNull();
  });

  it("refuses a cross-organization update and leaves the row untouched", async () => {
    const { eq } = await import("drizzle-orm");
    const before = await testDb.select().from(notesTable).where(eq(notesTable.id, fixture.noteB));

    const result = await runAs(
      fixture.orgA,
      `mutation { updateNote(id: "${fixture.noteB}", input: { title: "hijacked" }) { id title } }`
    );

    expect(result.errors?.[0]?.message).toBe("note not found");

    const after = await testDb.select().from(notesTable).where(eq(notesTable.id, fixture.noteB));
    expect(after[0]?.title).toBe("Note B");
    expect(after[0]?.updatedAt).toEqual(before[0]?.updatedAt);
  });

  it("keeps the batched todos loader scoped to the active organization", async () => {
    const result = await runAs(fixture.orgA, "{ notes { id todos { id } } }");

    expect(result.errors).toBeUndefined();
    // Exactly organization A's todo: the cross-organization row hangs off this
    // same note, so a loader filtering only on note id would return both.
    expect(notesOf(result).flatMap((note) => note.todos?.map((todo) => todo.id) ?? [])).toEqual([
      fixture.todoA
    ]);
  });

  it("refuses an organization the user is not a member of", async () => {
    const result = await runAs(fixture.orgB, "{ notes { id } }");

    expect(result.errors?.[0]?.message).toBe("organization not accessible");
    expect(notesOf(result)).toEqual([]);
  });

  it("refuses an unauthenticated request", async () => {
    const result = await runAs(null, "{ notes { id } }");

    expect(result.errors?.[0]?.message).toBe("authentication required");
    expect(notesOf(result)).toEqual([]);
  });
});
