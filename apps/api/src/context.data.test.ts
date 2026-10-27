// The tenancy proof for every organization-owned table, through the one module
// that writes the organization predicate. It runs on PGlite with the real
// migrations, so the SQL is real; feature tests no longer re-prove tenancy.
import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import {
  assistantConversationsTable,
  assistantMessagesTable,
  filesTable,
  membersTable,
  notesTable,
  organizationsTable,
  todosTable,
  usersTable
} from "@repo/db/schema";
import { createTestDatabase, type TestDatabase } from "@repo/db/testing";
import { asc, eq, like, sql } from "drizzle-orm";
import { GraphQLError } from "graphql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { containsPhrase, createScopedData, type ScopedData } from "./context.data";

let database: TestDatabase;
let data: ScopedData;
let ownerScope: AuthenticatedOrganizationScope;
const ids: Record<string, string> = {};

function scopeFor(organizationId: string, userId: string): AuthenticatedOrganizationScope {
  return {
    membership: { id: `membership-${userId}`, role: "owner", userId },
    organizationId,
    user: {
      email: `${userId}@example.test`,
      emailVerified: true,
      id: userId,
      name: "User",
      twoFactorEnabled: false
    },
    userId
  };
}

function id(name: string): string {
  const value = ids[name];
  if (!value) throw new Error(`missing fixture ${name}`);
  return value;
}

beforeAll(async () => {
  database = await createTestDatabase();
  const { db } = database;
  const [owner, colleague] = await db
    .insert(usersTable)
    .values([
      { email: "owner@example.test", name: "Owner" },
      { email: "colleague@example.test", name: "Colleague" }
    ])
    .returning();
  if (!owner || !colleague) throw new Error("failed to seed users");
  const [orgA, orgB] = await db
    .insert(organizationsTable)
    .values([
      { name: "A", slug: "a", userId: owner.id },
      { name: "B", slug: "b", userId: owner.id }
    ])
    .returning();
  if (!orgA || !orgB) throw new Error("failed to seed organizations");
  await db.insert(membersTable).values([
    { organizationId: orgA.id, role: "owner", userId: owner.id },
    { organizationId: orgA.id, role: "member", userId: colleague.id }
  ]);
  Object.assign(ids, { orgA: orgA.id, orgB: orgB.id, owner: owner.id, colleague: colleague.id });

  for (const [suffix, organizationId] of [
    ["A", orgA.id],
    ["B", orgB.id]
  ] as const) {
    const [todo] = await db
      .insert(todosTable)
      .values({ organizationId, title: `Todo ${suffix}`, userId: owner.id })
      .returning();
    const [note] = await db
      .insert(notesTable)
      .values({ organizationId, title: `Note ${suffix}`, userId: owner.id })
      .returning();
    const [file] = await db
      .insert(filesTable)
      .values({
        bucket: "b",
        key: `file-${suffix}`,
        mimeType: "text/plain",
        organizationId,
        originalName: "a.txt",
        sizeBytes: 1,
        uploadedBy: owner.id
      })
      .returning();
    const [conversation] = await db
      .insert(assistantConversationsTable)
      .values({ organizationId, title: `Conversation ${suffix}`, userId: owner.id })
      .returning();
    if (!todo || !note || !file || !conversation) throw new Error("failed to seed rows");
    const [message] = await db
      .insert(assistantMessagesTable)
      .values({
        content: `Message ${suffix}`,
        conversationId: conversation.id,
        organizationId,
        role: "user"
      })
      .returning();
    if (!message) throw new Error("failed to seed message");
    Object.assign(ids, {
      [`todo${suffix}`]: todo.id,
      [`note${suffix}`]: note.id,
      [`file${suffix}`]: file.id,
      [`conversation${suffix}`]: conversation.id,
      [`message${suffix}`]: message.id
    });
  }

  ownerScope = scopeFor(orgA.id, owner.id);
  data = createScopedData({ db, requireOrganizationScope: () => ownerScope });
}, 30_000);

afterAll(async () => {
  await database.close();
});

// One row per organization-owned table. `read` lists the table, `update` and
// `remove` target a row by id, and `raw` reads that row without the module.
const tables = [
  {
    name: "todos",
    read: () => data.selectFrom(todosTable),
    update: (rowId: string) =>
      data.update(todosTable, { title: "changed" }, eq(todosTable.id, rowId)).returning(),
    remove: (rowId: string) => data.delete(todosTable, eq(todosTable.id, rowId)).returning(),
    raw: (rowId: string) => database.db.select().from(todosTable).where(eq(todosTable.id, rowId)),
    rows: ["todoA", "todoB"]
  },
  {
    name: "notes",
    read: () => data.selectFrom(notesTable),
    update: (rowId: string) =>
      data.update(notesTable, { title: "changed" }, eq(notesTable.id, rowId)).returning(),
    remove: (rowId: string) => data.delete(notesTable, eq(notesTable.id, rowId)).returning(),
    raw: (rowId: string) => database.db.select().from(notesTable).where(eq(notesTable.id, rowId)),
    rows: ["noteA", "noteB"]
  },
  {
    name: "files",
    read: () => data.selectFrom(filesTable),
    update: (rowId: string) =>
      data.update(filesTable, { status: "deleted" }, eq(filesTable.id, rowId)).returning(),
    remove: (rowId: string) => data.delete(filesTable, eq(filesTable.id, rowId)).returning(),
    raw: (rowId: string) => database.db.select().from(filesTable).where(eq(filesTable.id, rowId)),
    rows: ["fileA", "fileB"]
  },
  {
    name: "assistant conversations",
    read: () => data.selectFrom(assistantConversationsTable),
    update: (rowId: string) =>
      data
        .update(
          assistantConversationsTable,
          { title: "changed" },
          eq(assistantConversationsTable.id, rowId)
        )
        .returning(),
    remove: (rowId: string) =>
      data
        .delete(assistantConversationsTable, eq(assistantConversationsTable.id, rowId))
        .returning(),
    raw: (rowId: string) =>
      database.db
        .select()
        .from(assistantConversationsTable)
        .where(eq(assistantConversationsTable.id, rowId)),
    rows: ["conversationA", "conversationB"]
  },
  {
    name: "assistant messages",
    read: () => data.selectFrom(assistantMessagesTable),
    update: (rowId: string) =>
      data
        .update(
          assistantMessagesTable,
          { content: "changed" },
          eq(assistantMessagesTable.id, rowId)
        )
        .returning(),
    remove: (rowId: string) =>
      data.delete(assistantMessagesTable, eq(assistantMessagesTable.id, rowId)).returning(),
    raw: (rowId: string) =>
      database.db.select().from(assistantMessagesTable).where(eq(assistantMessagesTable.id, rowId)),
    rows: ["messageA", "messageB"]
  }
] as const;

describe("createScopedData", () => {
  it.each(tables)(
    "$name: reads, updates, and deletes only the Active Organization's rows",
    async (table) => {
      const [own, foreign] = table.rows.map(id);
      if (!own || !foreign) throw new Error("missing rows");
      const foreignBefore = await table.raw(foreign);

      expect((await table.read()).map((row) => row.id)).toEqual([own]);
      expect(await table.update(foreign)).toEqual([]);
      expect(await table.remove(foreign)).toEqual([]);
      expect(await table.raw(foreign)).toEqual(foreignBefore);
      // Positive control: the same calls do reach the scope's own row.
      expect((await table.update(own)).map((row) => row.id)).toEqual([own]);
    }
  );

  it("stamps an insert with the scope's organization and user, and deletes it again", async () => {
    const [created] = await data
      .insert(todosTable)
      .values({ ...data.stamp("userId"), title: "Stamped" })
      .returning();

    expect(created).toMatchObject({ organizationId: id("orgA"), userId: id("owner") });
    if (!created) throw new Error("insert returned nothing");
    expect(await data.delete(todosTable, eq(todosTable.id, created.id)).returning()).toHaveLength(
      1
    );
  });

  it("limits user-private rows to the scope's user with mine()", async () => {
    await database.db.insert(assistantConversationsTable).values({
      organizationId: id("orgA"),
      title: "Colleague's",
      userId: id("colleague")
    });
    const colleagueData = createScopedData({
      db: database.db,
      requireOrganizationScope: () => scopeFor(id("orgA"), id("colleague"))
    });

    const titles = async (scoped: ScopedData) =>
      (
        await scoped
          .selectFrom(assistantConversationsTable, scoped.mine(assistantConversationsTable))
          .orderBy(asc(assistantConversationsTable.title))
      ).map((row) => row.title);

    expect(await titles(data)).toEqual(["changed"]);
    expect(await titles(colleagueData)).toEqual(["Colleague's"]);
  });

  it("builds without a scope and fails on first use with the scope's own error", () => {
    const unscoped = createScopedData({
      db: database.db,
      requireOrganizationScope: () => {
        throw new Error("active organization required");
      }
    });

    expect(() => unscoped.selectFrom(todosTable)).toThrowError("active organization required");
    expect(() => unscoped.insert(todosTable)).toThrowError("active organization required");
    expect(() => unscoped.stamp()).toThrowError("active organization required");
  });
});

describe("containsPhrase", () => {
  it("matches case-insensitively and treats \\, % and _ literally", async () => {
    const rows = await database.db
      .insert(notesTable)
      .values(
        ["Budget 100%_done \\ archive", "Budget 100 done archive", "budget plain"].map((title) => ({
          organizationId: id("orgA"),
          title,
          userId: id("owner")
        }))
      )
      .returning();
    const search = async (phrase: string) =>
      (
        await data.selectFrom(
          notesTable,
          containsPhrase(phrase, [notesTable.title, notesTable.body])
        )
      )
        .map((row) => row.title)
        .sort();

    expect(await search("  BUDGET  ")).toEqual(rows.map((row) => row.title).sort());
    for (const phrase of ["%", "_", "\\", "%_done \\"]) {
      expect(await search(phrase)).toEqual(["Budget 100%_done \\ archive"]);
    }
    expect(containsPhrase("   ", [notesTable.title])).toBeUndefined();
    expect(containsPhrase(null, [notesTable.title])).toBeUndefined();
  });
});

describe("ScopedData.page", () => {
  const limits = { defaultLimit: 2, maxLimit: 3 };
  const order = { orderBy: todosTable.createdAt, direction: "desc", limits } as const;
  const paged = like(todosTable.title, "Paged %");
  const titles = (connection: { items: { title: string }[] }) =>
    connection.items.map((row) => row.title);

  beforeAll(async () => {
    // Microsecond timestamps in one millisecond: a cursor that kept only a JS
    // Date (milliseconds) would skip "Paged C" and "Paged D". C and D tie on
    // created_at, so their fixed ids decide their order.
    await database.db.insert(todosTable).values(
      (
        [
          ["Paged A", "2025-01-01T00:00:03.000000Z", "00000000-0000-4000-8000-00000000000a"],
          ["Paged B", "2025-01-01T00:00:02.000900Z", "00000000-0000-4000-8000-00000000000b"],
          ["Paged C", "2025-01-01T00:00:02.000400Z", "00000000-0000-4000-8000-00000000000c"],
          ["Paged D", "2025-01-01T00:00:02.000400Z", "00000000-0000-4000-8000-00000000000d"],
          ["Paged E", "2025-01-01T00:00:01.000000Z", "00000000-0000-4000-8000-00000000000e"]
        ] as const
      ).map(([title, createdAt, rowId]) => ({
        createdAt: sql`${createdAt}::timestamptz`,
        id: rowId,
        organizationId: id("orgA"),
        title,
        userId: id("owner")
      }))
    );
  });

  it.each([
    { first: undefined, expected: ["Paged A", "Paged B"] },
    { first: null, expected: ["Paged A", "Paged B"] },
    { first: 0, expected: ["Paged A"] },
    { first: 2.7, expected: ["Paged A", "Paged B"] },
    { first: 999, expected: ["Paged A", "Paged B", "Paged D"] }
  ])("clamps first: $first to the list's limits", async ({ first, expected }) => {
    expect(titles(await data.page(todosTable, { first }, order, paged))).toEqual(expected);
  });

  it("pages by (sort key, id) without a skip or a duplicate when a row lands before the cursor", async () => {
    const first = await data.page(todosTable, { first: 2 }, order, paged);
    expect(titles(first)).toEqual(["Paged A", "Paged B"]);
    expect(first.pageInfo.hasNextPage).toBe(true);
    // Opaque: the cursor does not expose the raw row id.
    expect(first.pageInfo.endCursor).not.toContain("00000000-0000-4000-8000-00000000000b");

    await database.db.insert(todosTable).values({
      createdAt: sql`'2025-01-01T00:00:04Z'::timestamptz`,
      organizationId: id("orgA"),
      title: "Paged New",
      userId: id("owner")
    });

    const second = await data.page(
      todosTable,
      { first: 2, after: first.pageInfo.endCursor },
      order,
      paged
    );
    expect(titles(second)).toEqual(["Paged D", "Paged C"]);
    expect(second.pageInfo.hasNextPage).toBe(true);

    const third = await data.page(
      todosTable,
      { first: 2, after: second.pageInfo.endCursor },
      order,
      paged
    );
    expect(titles(third)).toEqual(["Paged E"]);
    expect(third.pageInfo).toEqual({ hasNextPage: false, endCursor: expect.any(String) });

    const past = await data.page(
      todosTable,
      { first: 2, after: third.pageInfo.endCursor },
      order,
      paged
    );
    expect(past).toEqual({ items: [], pageInfo: { hasNextPage: false, endCursor: null } });
  });

  it("pages ascending when the list sorts ascending", async () => {
    const ascending = { ...order, direction: "asc" } as const;
    const first = await data.page(
      todosTable,
      { first: 2 },
      ascending,
      like(todosTable.title, "Paged _")
    );
    const second = await data.page(
      todosTable,
      { first: 2, after: first.pageInfo.endCursor },
      ascending,
      like(todosTable.title, "Paged _")
    );

    expect([...titles(first), ...titles(second)]).toEqual([
      "Paged E",
      "Paged C",
      "Paged D",
      "Paged B"
    ]);
  });

  it("refuses a cursor from another Organization and returns none of its rows", async () => {
    const own = await data.page(todosTable, { first: 1 }, order);
    const foreignData = createScopedData({
      db: database.db,
      requireOrganizationScope: () => scopeFor(id("orgB"), id("owner"))
    });

    // Positive control: without the cursor the same scope reads its own row.
    expect(titles(await foreignData.page(todosTable, {}, order))).toEqual(["Todo B"]);
    await expect(
      foreignData.page(todosTable, { after: own.pageInfo.endCursor }, order)
    ).rejects.toThrowError("invalid cursor");
  });

  it("refuses a cursor from another list", async () => {
    const notes = await data.page(
      notesTable,
      { first: 1 },
      { ...order, orderBy: notesTable.createdAt }
    );

    await expect(
      data.page(todosTable, { after: notes.pageInfo.endCursor }, order)
    ).rejects.toThrowError("invalid cursor");
  });

  const forged =
    (...parts: string[]) =>
    () =>
      Buffer.from(JSON.stringify(["todos", id("orgA"), ...parts])).toString("base64url");

  it.each([
    { name: "empty string", after: () => "" },
    { name: "not base64 JSON", after: () => "not a cursor" },
    { name: "not JSON", after: () => Buffer.from("not json").toString("base64url") },
    { name: "too short", after: forged("2025-01-01T00:00:00.000000Z") },
    { name: "bad sort key", after: forged("yesterday", "00000000-0000-4000-8000-00000000000a") },
    {
      name: "out-of-range sort key",
      after: forged("2025-13-45T99:99:99.000000Z", "00000000-0000-4000-8000-00000000000a")
    },
    {
      name: "year zero sort key",
      after: forged("0000-01-01T00:00:00.000000Z", "00000000-0000-4000-8000-00000000000a")
    },
    { name: "bad id", after: forged("2025-01-01T00:00:00.000000Z", "not-a-uuid") }
  ])("refuses a malformed cursor ($name) with a GraphQL error", async ({ after }) => {
    const rejection = data.page(todosTable, { after: after() }, order);

    await expect(rejection).rejects.toBeInstanceOf(GraphQLError);
    await expect(rejection).rejects.toThrowError("invalid cursor");
  });
});
