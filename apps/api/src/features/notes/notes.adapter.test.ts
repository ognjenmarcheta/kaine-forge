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
  notesTable: {
    id: "id",
    userId: "userId",
    organizationId: "orgId",
    createdAt: "createdAt"
  }
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => args.filter((arg) => arg !== undefined)),
  desc: vi.fn((col: unknown) => col),
  eq: vi.fn((a: unknown, b: unknown) => [a, b])
}));

import { listNotesByScope } from "./notes.adapter";

describe("notes.adapter", () => {
  const scope = {
    membership: { id: "membership-1", role: "owner", userId: "user-1" },
    organizationId: "org-1",
    user: {
      email: "u1@example.com",
      emailVerified: false,
      twoFactorEnabled: false,
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

  it("listNotesByScope filters by Organization only", async () => {
    await listNotesByScope(scope, { limit: 20, offset: 0 });

    expect(chain.where).toHaveBeenCalledWith([["orgId", "org-1"]]);
  });
});
