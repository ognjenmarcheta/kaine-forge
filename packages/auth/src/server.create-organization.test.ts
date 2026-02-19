import { beforeEach, describe, expect, it, vi } from "vitest";

const membersTable = {
  createdAt: "members.created_at",
  id: "members.id",
  organizationId: "members.organization_id",
  role: "members.role",
  userId: "members.user_id"
};
const organizationsTable = {
  createdAt: "organizations.created_at",
  id: "organizations.id",
  name: "organizations.name",
  slug: "organizations.slug",
  userId: "organizations.user_id"
};
const sessionsTable = {
  activeOrganizationId: "sessions.active_organization_id",
  expiresAt: "sessions.expires_at",
  token: "sessions.token",
  updatedAt: "sessions.updated_at",
  userId: "sessions.user_id"
};
const usersTable = {
  email: "users.email",
  id: "users.id"
};

const organizationInsertValues: Array<Record<string, unknown>> = [];
const memberInsertValues: Array<Record<string, unknown>> = [];
const sessionUpdateValues: Array<Record<string, unknown>> = [];
let organizationInsertResponses: Array<Array<Record<string, unknown>>> = [];

const dbMock = {
  select: vi.fn(),
  transaction: vi.fn()
};

vi.mock("@repo/db", () => ({
  db: dbMock,
  membersTable,
  organizationsTable,
  sessionsTable,
  usersTable
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => args,
  asc: (value: unknown) => value,
  eq: (left: unknown, right: unknown) => ({ left, right }),
  gt: (left: unknown, right: unknown) => ({ left, right })
}));

vi.mock("./auth.config", () => ({
  getServerAuthConfig: () => ({
    baseUrl: "http://localhost:4000",
    secret: "test-secret"
  })
}));

function createSelectChain(rows: Array<Record<string, unknown>>) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows)
      })
    })
  };
}

function createTransactionMock() {
  const transactionInsert = vi.fn((table: unknown) => {
    if (table === organizationsTable) {
      return {
        values: (payload: Record<string, unknown>) => {
          organizationInsertValues.push(payload);
          return {
            onConflictDoNothing: () => ({
              returning: async () => organizationInsertResponses.shift() ?? []
            })
          };
        }
      };
    }

    if (table === membersTable) {
      return {
        values: (payload: Record<string, unknown>) => {
          memberInsertValues.push(payload);
          return {
            onConflictDoNothing: async () => undefined
          };
        }
      };
    }

    throw new Error("unexpected insert table");
  });

  const transactionUpdate = vi.fn((table: unknown) => {
    if (table !== sessionsTable) {
      throw new Error("unexpected update table");
    }

    return {
      set: (payload: Record<string, unknown>) => {
        sessionUpdateValues.push(payload);
        return {
          where: async () => undefined
        };
      }
    };
  });

  return {
    insert: transactionInsert,
    update: transactionUpdate
  };
}

describe("auth.server createOrganization", () => {
  beforeEach(() => {
    organizationInsertValues.length = 0;
    memberInsertValues.length = 0;
    sessionUpdateValues.length = 0;
    organizationInsertResponses = [];
    dbMock.select.mockReset();
    dbMock.transaction.mockReset();
  });

  it("creates owner membership, resolves slug conflicts, and switches active organization in one transaction", async () => {
    const sessionExpiresAt = new Date("2026-02-26T00:00:00.000Z");
    dbMock.select
      .mockReturnValueOnce(
        createSelectChain([
          {
            activeOrganizationId: "org-1",
            expiresAt: sessionExpiresAt,
            userId: "user-1"
          }
        ])
      )
      .mockReturnValueOnce(
        createSelectChain([
          {
            email: "ogi@ogi.ogi",
            id: "user-1",
            name: "Ogi User"
          }
        ])
      );

    const transactionMock = createTransactionMock();
    dbMock.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(transactionMock)
    );
    organizationInsertResponses = [[], [{ id: "org-2" }]];

    const { createServerAuth } = await import("./server");
    const auth = createServerAuth();

    const result = await auth.createOrganization({
      userId: "user-1",
      name: " Acme Workspace ",
      sessionToken: "session-token"
    });

    expect(dbMock.transaction).toHaveBeenCalledTimes(1);
    expect(organizationInsertValues[0]).toMatchObject({
      name: "Acme Workspace",
      slug: "acme-workspace",
      userId: "user-1"
    });
    expect(organizationInsertValues[1]).toMatchObject({
      slug: "acme-workspace-2"
    });
    expect(memberInsertValues[0]).toMatchObject({
      organizationId: "org-2",
      role: "owner",
      userId: "user-1"
    });
    expect(sessionUpdateValues[0]).toMatchObject({
      activeOrganizationId: "org-2"
    });
    expect(result.activeOrganizationId).toBe("org-2");
    expect(result.user.id).toBe("user-1");
  });
});
