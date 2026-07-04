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
    createdAt: "members.created_at",
    id: "members.id",
    organizationId: "members.organization_id",
    role: "members.role",
    userId: "members.user_id"
  },
  organizationsTable: {
    createdAt: "organizations.created_at",
    id: "organizations.id",
    name: "organizations.name",
    slug: "organizations.slug"
  },
  sessionsTable: {
    activeOrganizationId: "sessions.active_organization_id",
    expiresAt: "sessions.expires_at",
    token: "sessions.token",
    updatedAt: "sessions.updated_at",
    userId: "sessions.user_id"
  },
  usersTable: {
    email: "users.email",
    id: "users.id",
    name: "users.name"
  }
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => args),
  asc: vi.fn((value: unknown) => value),
  eq: vi.fn((left: unknown, right: unknown) => [left, right]),
  gt: vi.fn((left: unknown, right: unknown) => [left, right])
}));

vi.mock("./auth.config", () => ({
  getServerAuthConfig: () => ({
    baseUrl: "http://localhost:4000",
    secret: "test-secret"
  })
}));

import type { AuthenticatedOrganizationScope } from "./auth.scope";
import { createServerAuth } from "./auth.server";

describe("auth.server organization membership reads", () => {
  const scope: AuthenticatedOrganizationScope = {
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
  });

  it("lists Organizations through Authenticated Organization Scope", async () => {
    const auth = createServerAuth();

    await auth.listOrganizationsByScope(scope);

    expect(mockDb.select).toHaveBeenCalled();
    expect(chain.from).toHaveBeenCalled();
    expect(chain.innerJoin).toHaveBeenCalled();
    expect(chain.where).toHaveBeenCalled();
    expect(chain.orderBy).toHaveBeenCalled();
  });

  it("gets the current Active Organization through Authenticated Organization Scope", async () => {
    chain.limit.mockResolvedValueOnce([{ id: "org-1" }]);
    const auth = createServerAuth();

    await expect(auth.getCurrentOrganizationByScope(scope)).resolves.toEqual({ id: "org-1" });

    expect(chain.limit).toHaveBeenCalledWith(1);
  });

  it("rejects member listing when the User is not in the Active Organization", async () => {
    chain.limit.mockResolvedValueOnce([]);
    const auth = createServerAuth();

    await expect(auth.listOrganizationMembersByScope(scope)).rejects.toThrowError(
      "organization not accessible"
    );
  });

  it("lists members when the User is in the Active Organization", async () => {
    chain.limit.mockResolvedValueOnce([{ id: "member-1" }]);
    const auth = createServerAuth();

    await auth.listOrganizationMembersByScope(scope);

    expect(mockDb.select).toHaveBeenCalledTimes(2);
    expect(chain.innerJoin).toHaveBeenCalled();
    expect(chain.where).toHaveBeenCalled();
  });
});
