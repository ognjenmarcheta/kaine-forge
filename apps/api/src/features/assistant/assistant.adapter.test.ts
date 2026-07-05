import { beforeEach, describe, expect, it, vi } from "vitest";

const { chain, mockDb } = vi.hoisted(() => {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn(),
    returning: vi.fn(),
    set: vi.fn(),
    values: vi.fn(),
    onConflictDoNothing: vi.fn()
  };
  Object.values(chain).forEach((fn) => fn.mockReturnValue(chain));
  chain.returning.mockResolvedValue([]);

  const mockDb = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain)
  };

  return { chain, mockDb };
});

vi.mock("@repo/db", () => ({
  db: mockDb,
  assistantConversationsTable: {
    id: "id",
    userId: "userId",
    organizationId: "orgId",
    updatedAt: "updatedAt"
  },
  assistantMessagesTable: {
    id: "id",
    conversationId: "conversationId",
    organizationId: "orgId",
    createdAt: "createdAt"
  }
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => args),
  asc: vi.fn((col: unknown) => col),
  desc: vi.fn((col: unknown) => col),
  eq: vi.fn((a: unknown, b: unknown) => [a, b])
}));

import { deleteConversation, listConversations } from "./assistant.adapter";

describe("assistant.adapter", () => {
  const scope = {
    organizationId: "org-1",
    user: {
      email: "u1@example.com",
      emailVerified: false,
      id: "user-1",
      name: "User One"
    },
    userId: "user-1"
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(chain).forEach((fn) => fn.mockReturnValue(chain));
    chain.returning.mockResolvedValue([]);
  });

  it("listConversations calls db.select with correct chain", async () => {
    await listConversations(scope, { limit: 20, offset: 0 });
    expect(mockDb.select).toHaveBeenCalled();
    expect(chain.from).toHaveBeenCalled();
    expect(chain.where).toHaveBeenCalled();
    expect(chain.orderBy).toHaveBeenCalled();
    expect(chain.limit).toHaveBeenCalledWith(20);
    expect(chain.offset).toHaveBeenCalledWith(0);
  });

  it("deleteConversation returns true when a row is returned", async () => {
    chain.returning.mockResolvedValueOnce([{ id: "conversation-1" }]);
    const result = await deleteConversation(scope, "conversation-1");
    expect(mockDb.delete).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it("deleteConversation returns false when no row is returned", async () => {
    chain.returning.mockResolvedValueOnce([]);
    const result = await deleteConversation(scope, "conversation-1");
    expect(mockDb.delete).toHaveBeenCalled();
    expect(result).toBe(false);
  });
});
