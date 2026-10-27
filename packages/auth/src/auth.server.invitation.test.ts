import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedOrganizationScope } from "./auth.scope";

const invitationsTable = {
  createdAt: "invitations.created_at",
  email: "invitations.email",
  expiresAt: "invitations.expires_at",
  id: "invitations.id",
  inviterId: "invitations.inviter_id",
  organizationId: "invitations.organization_id",
  role: "invitations.role",
  status: "invitations.status"
};

const selectWhereArgs: unknown[] = [];
let selectRows: Array<Record<string, unknown>> = [];

const dbMock = {
  select: vi.fn(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockImplementation((condition: unknown) => {
        selectWhereArgs.push(condition);
        return {
          orderBy: vi.fn().mockImplementation(async () => selectRows)
        };
      })
    })
  }))
};

vi.mock("@repo/db", () => ({
  db: dbMock,
  invitationsTable
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => args,
  asc: (value: unknown) => value,
  eq: (left: unknown, right: unknown) => ({ left, right }),
  gt: (left: unknown, right: unknown) => ({ left, right })
}));

const { listInvitationsForScope } = await import("./auth.server.invitation");

const adminScope: AuthenticatedOrganizationScope = {
  organizationId: "org-1",
  user: {
    id: "user-1",
    email: "admin@example.com",
    emailVerified: false,
    name: "Admin",
    twoFactorEnabled: false
  },
  userId: "user-1",
  membership: { id: "m-1", permissions: ["invitation:read"], role: "admin", userId: "user-1" }
};

describe("auth.server.invitation", () => {
  beforeEach(() => {
    selectWhereArgs.length = 0;
    selectRows = [];
  });

  it("lists only pending unexpired invitations for the scope organization", async () => {
    selectRows = [
      {
        id: "inv-1",
        email: "new@example.com",
        role: "member",
        status: "pending",
        expiresAt: new Date("2026-07-09T00:00:00.000Z")
      }
    ];

    const invitations = await listInvitationsForScope(adminScope);

    expect(selectWhereArgs[0]).toEqual([
      { left: invitationsTable.organizationId, right: "org-1" },
      { left: invitationsTable.status, right: "pending" },
      { left: invitationsTable.expiresAt, right: expect.any(Date) }
    ]);
    expect(invitations).toEqual([
      {
        id: "inv-1",
        email: "new@example.com",
        role: "member",
        status: "pending",
        expiresAt: "2026-07-09T00:00:00.000Z"
      }
    ]);
  });

  it("rejects a member without the invitation:read permission", async () => {
    const memberScope: AuthenticatedOrganizationScope = {
      ...adminScope,
      membership: { id: "m-2", permissions: [], role: "member", userId: "user-1" }
    };

    await expect(listInvitationsForScope(memberScope)).rejects.toThrow(
      "permission required: invitation:read"
    );
  });
});
