import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import { notesTable, organizationsTable, usersTable } from "@repo/db/schema";
import { createTestDatabase, type TestDatabase } from "@repo/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createNotes, type Notes } from "./notes.module";
import { createScopedData } from "../../context.data";
import type { PubSubEventMap } from "../../pubsub";

let database: TestDatabase;
let scope: AuthenticatedOrganizationScope;
let notes: Notes;
let events: [keyof PubSubEventMap, ...unknown[]][];

beforeAll(async () => {
  database = await createTestDatabase();
  const { db } = database;
  const [user] = await db
    .insert(usersTable)
    .values({ email: "u@example.test", name: "User" })
    .returning();
  if (!user) throw new Error("failed to seed user");
  const [organization] = await db
    .insert(organizationsTable)
    .values({ name: "Own", slug: "own", userId: user.id })
    .returning();
  if (!organization) throw new Error("failed to seed organization");
  scope = {
    membership: { id: "membership-1", role: "owner", userId: user.id },
    organizationId: organization.id,
    user: { email: user.email, emailVerified: true, id: user.id, name: user.name },
    userId: user.id
  };
  notes = createNotes({
    data: createScopedData({ db, requireOrganizationScope: () => scope }),
    publish: (eventName, ...payload) => {
      events.push([eventName, ...payload]);
    }
  });
}, 30_000);

afterAll(async () => {
  await database.close();
});

beforeEach(() => {
  events = [];
});

describe("createNotes", () => {
  it("creates a Note from normalized input and publishes note:created once", async () => {
    const note = await notes.create({ title: "  Plan  ", body: "   " });

    expect(note).toMatchObject({ title: "Plan", body: null, organizationId: scope.organizationId });
    expect(events).toEqual([["note:created", note]]);
  });

  it("rejects a blank title on create and update, and writes nothing", async () => {
    const note = await notes.create({ title: "Keep" });
    events = [];
    const before = await database.db.select().from(notesTable);

    await expect(notes.create({ title: "   " })).rejects.toThrow("note title is required");
    await expect(notes.update(note.id, { title: " " })).rejects.toThrow("note title is required");
    expect(await database.db.select().from(notesTable)).toEqual(before);
    expect(events).toEqual([]);
  });

  it("updates only the given fields and publishes note:updated", async () => {
    const note = await notes.create({ title: "Draft", body: "body" });
    events = [];

    const updated = await notes.update(note.id, { body: "  edited  " });

    expect(updated).toMatchObject({ title: "Draft", body: "edited" });
    expect(events).toEqual([["note:updated", updated]]);
    await expect(
      notes.update("00000000-0000-4000-8000-00000000ffff", { title: "Missing" })
    ).rejects.toThrow("note not found");
  });

  it("publishes note:deleted with the Active Organization only when a row was deleted", async () => {
    const note = await notes.create({ title: "Gone" });
    events = [];

    await expect(notes.delete(note.id)).resolves.toBe(true);
    await expect(notes.delete(note.id)).resolves.toBe(false);

    expect(events).toEqual([
      ["note:deleted", { id: note.id, organizationId: scope.organizationId }]
    ]);
    expect(await notes.get(note.id)).toBeNull();
  });

  it("lists Notes by search phrase within a clamped page", async () => {
    const needle = await notes.create({ title: "Needle in title" });

    expect((await notes.list({ search: "NEEDLE", limit: 500 })).map((n) => n.id)).toEqual([
      needle.id
    ]);
    expect(await notes.list({ limit: 0 })).toHaveLength(1);
  });
});
