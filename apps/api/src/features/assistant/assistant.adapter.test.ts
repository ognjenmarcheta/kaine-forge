import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import {
  assistantMessagesTable,
  membersTable,
  organizationsTable,
  usersTable
} from "@repo/db/schema";
import { createTestDatabase, type TestDatabase } from "@repo/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createConversation,
  deleteConversation,
  getConversationById,
  listConversations,
  listRecentMessages
} from "./assistant.adapter";
import { createScopedData, type ScopedData } from "../../context.data";

let database: TestDatabase;
let mine: ScopedData;
let colleague: ScopedData;

function scopeFor(organizationId: string, userId: string): AuthenticatedOrganizationScope {
  return {
    membership: { id: `membership-${userId}`, role: "member", userId },
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

beforeAll(async () => {
  database = await createTestDatabase();
  const { db } = database;
  const [owner, other] = await db
    .insert(usersTable)
    .values([
      { email: "owner@example.test", name: "Owner" },
      { email: "other@example.test", name: "Other" }
    ])
    .returning();
  if (!owner || !other) throw new Error("failed to seed users");
  const [organization] = await db
    .insert(organizationsTable)
    .values({ name: "Org", slug: "org", userId: owner.id })
    .returning();
  if (!organization) throw new Error("failed to seed organization");
  await db.insert(membersTable).values([
    { organizationId: organization.id, role: "owner", userId: owner.id },
    { organizationId: organization.id, role: "member", userId: other.id }
  ]);
  mine = createScopedData({
    db,
    requireOrganizationScope: () => scopeFor(organization.id, owner.id)
  });
  colleague = createScopedData({
    db,
    requireOrganizationScope: () => scopeFor(organization.id, other.id)
  });
}, 30_000);

afterAll(async () => {
  await database.close();
});

describe("assistant.adapter", () => {
  it("keeps a Conversation private to its user within the Organization", async () => {
    const conversation = await createConversation(mine, { title: "Private" });

    expect(await getConversationById(colleague, conversation.id)).toBeNull();
    expect(await listConversations(colleague, {})).toEqual([]);
    expect(await deleteConversation(colleague, conversation.id)).toBe(false);

    expect(await getConversationById(mine, conversation.id)).toEqual(conversation);
    expect((await listConversations(mine, {})).map((row) => row.id)).toEqual([conversation.id]);
    expect(await deleteConversation(mine, conversation.id)).toBe(true);
  });

  it("returns the newest messages in chronological order", async () => {
    const conversation = await createConversation(mine, { title: "History" });
    await database.db.insert(assistantMessagesTable).values(
      ["third", "first", "second"].map((content) => ({
        content,
        conversationId: conversation.id,
        createdAt: new Date(`2026-01-01T00:00:0${["first", "second", "third"].indexOf(content)}Z`),
        organizationId: conversation.organizationId,
        role: "user"
      }))
    );

    const recent = await listRecentMessages(mine, conversation.id, 2);

    expect(recent.map((message) => message.content)).toEqual(["second", "third"]);
  });
});
