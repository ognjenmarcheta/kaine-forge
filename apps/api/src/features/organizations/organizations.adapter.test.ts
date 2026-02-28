import { beforeEach, describe, expect, it, vi } from "vitest";

const { chain, mockDb } = vi.hoisted(() => {
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn()
  };
  Object.values(chain).forEach((fn) => fn.mockReturnValue(chain));

  const mockDb = {
    select: vi.fn(() => chain)
  };

  return { chain, mockDb };
});

vi.mock("@repo/db", () => ({
  db: mockDb,
  membersTable: {
    id: "id",
    userId: "userId",
    organizationId: "orgId",
    role: "role",
    createdAt: "createdAt"
  },
  organizationsTable: { id: "id", name: "name", slug: "slug" },
  usersTable: { id: "id", email: "email", name: "name" }
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => args),
  asc: vi.fn((col: unknown) => col),
  eq: vi.fn((a: unknown, b: unknown) => [a, b])
}));

import {
  getCurrentOrganizationById,
  listOrganizationMembersByOrganizationId,
  listOrganizationsByUserId
} from "./organizations.adapter";

describe("organizations.adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(chain).forEach((fn) => fn.mockReturnValue(chain));
  });

  it("listOrganizationsByUserId calls db.select with innerJoin and where", async () => {
    await listOrganizationsByUserId("user-1");
    expect(mockDb.select).toHaveBeenCalled();
    expect(chain.from).toHaveBeenCalled();
    expect(chain.innerJoin).toHaveBeenCalled();
    expect(chain.where).toHaveBeenCalled();
    expect(chain.orderBy).toHaveBeenCalled();
  });

  it("getCurrentOrganizationById calls db.select with limit 1", async () => {
    chain.limit.mockResolvedValueOnce([]);
    await getCurrentOrganizationById("user-1", "org-1");
    expect(mockDb.select).toHaveBeenCalled();
    expect(chain.limit).toHaveBeenCalledWith(1);
  });

  it("listOrganizationMembersByOrganizationId throws when user is not a member", async () => {
    chain.limit.mockResolvedValueOnce([]);
    await expect(listOrganizationMembersByOrganizationId("user-1", "org-1")).rejects.toThrowError(
      "organization not accessible"
    );
  });

  it("listOrganizationMembersByOrganizationId returns members when user is a member", async () => {
    chain.limit.mockResolvedValueOnce([{ id: "member-1" }]);
    await listOrganizationMembersByOrganizationId("user-1", "org-1");
    expect(chain.innerJoin).toHaveBeenCalled();
    expect(chain.where).toHaveBeenCalled();
  });
});
