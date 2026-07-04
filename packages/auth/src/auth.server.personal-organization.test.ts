import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, selectResults, insertCalls, insertReturnings } = vi.hoisted(() => {
  const selectResults: unknown[][] = [];
  const insertCalls: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const insertReturnings: unknown[][] = [];

  const mockDb = {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => selectResults.shift() ?? []
          })
        })
      })
    })),
    insert: vi.fn((table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        insertCalls.push({ table, values });
        return {
          onConflictDoNothing: () => ({
            returning: async () => insertReturnings.shift() ?? [],
            // The members insert awaits the builder without .returning().
            then: (resolve: (value: unknown) => unknown) => Promise.resolve().then(resolve)
          })
        };
      }
    }))
  };

  return { mockDb, selectResults, insertCalls, insertReturnings };
});

vi.mock("@repo/db", () => ({
  db: mockDb,
  membersTable: { table: "members" },
  organizationsTable: { table: "organizations" },
  usersTable: { table: "users" }
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  asc: vi.fn(),
  eq: vi.fn()
}));

const { ensurePersonalOrganizationForUser } = await import("./auth.server.organization");

describe("ensurePersonalOrganizationForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectResults.length = 0;
    insertCalls.length = 0;
    insertReturnings.length = 0;
  });

  it("creates the personal organization and owner membership when none exists", async () => {
    selectResults.push([]);
    insertReturnings.push([{ id: "org-1", userId: "user-1234-uuid" }]);

    const organization = await ensurePersonalOrganizationForUser("user-1234-uuid");

    expect(organization.id).toBe("org-1");
    expect(insertCalls[0]).toEqual({
      table: { table: "organizations" },
      values: {
        userId: "user-1234-uuid",
        name: "Personal",
        slug: "personal-user-123"
      }
    });
    expect(insertCalls[1]).toEqual({
      table: { table: "members" },
      values: {
        userId: "user-1234-uuid",
        organizationId: "org-1",
        role: "owner"
      }
    });
  });

  it("recovers from a concurrent-signup slug conflict by re-selecting the winner's row", async () => {
    // Initial existence check: no organization yet.
    selectResults.push([]);
    // Insert lost the race: onConflictDoNothing yields an empty returning.
    insertReturnings.push([]);
    // Re-select finds the row the concurrent winner created.
    selectResults.push([{ id: "org-existing", userId: "user-1234-uuid" }]);

    const organization = await ensurePersonalOrganizationForUser("user-1234-uuid");

    expect(organization.id).toBe("org-existing");
    expect(mockDb.select).toHaveBeenCalledTimes(2);
    // Membership is still ensured against the surviving organization.
    expect(insertCalls[1]).toEqual({
      table: { table: "members" },
      values: {
        userId: "user-1234-uuid",
        organizationId: "org-existing",
        role: "owner"
      }
    });
  });
});
