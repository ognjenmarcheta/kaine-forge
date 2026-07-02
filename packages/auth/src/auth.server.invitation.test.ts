import { beforeEach, describe, expect, it, vi } from "vitest";

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
const membersTable = {
  createdAt: "members.created_at",
  id: "members.id",
  organizationId: "members.organization_id",
  role: "members.role",
  userId: "members.user_id"
};

const insertedValues: Array<Record<string, unknown>> = [];
const updatedValues: Array<Record<string, unknown>> = [];
const selectWhereArgs: unknown[] = [];
const updateWhereArgs: unknown[] = [];
let insertReturning: Array<Record<string, unknown>> = [];
let updateReturning: Array<Record<string, unknown>> = [];
let selectRows: Array<Record<string, unknown>> = [];

const dbMock = {
  select: vi.fn(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockImplementation((condition: unknown) => {
        selectWhereArgs.push(condition);
        return {
          limit: vi.fn().mockImplementation(async () => selectRows),
          orderBy: vi.fn().mockImplementation(async () => selectRows)
        };
      })
    })
  })),
  insert: vi.fn((table: unknown) => ({
    values: (payload: Record<string, unknown>) => {
      insertedValues.push({ table, ...payload });
      return {
        returning: async () => insertReturning,
        onConflictDoNothing: async () => undefined
      };
    }
  })),
  update: vi.fn(() => ({
    set: (payload: Record<string, unknown>) => {
      updatedValues.push(payload);
      return {
        where: (condition: unknown) => {
          updateWhereArgs.push(condition);
          return {
            returning: async () => updateReturning
          };
        }
      };
    }
  })),
  transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(dbMock))
};

vi.mock("@repo/db", () => ({
  db: dbMock,
  invitationsTable,
  membersTable
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => args,
  asc: (value: unknown) => value,
  eq: (left: unknown, right: unknown) => ({ left, right }),
  gt: (left: unknown, right: unknown) => ({ left, right })
}));

vi.mock("./auth.server.organization", () => ({
  getOrganizationMembershipProof: vi.fn()
}));

const { getOrganizationMembershipProof } = await import("./auth.server.organization");
const {
  acceptInvitation,
  createInvitationForScope,
  listInvitationsForScope,
  revokeInvitationForScope
} = await import("./auth.server.invitation");

const adminScope = {
  organizationId: "org-1",
  user: { id: "user-1", email: "admin@example.com", name: "Admin" },
  userId: "user-1",
  membership: { id: "m-1", role: "admin", userId: "user-1" }
};

describe("auth.server.invitation", () => {
  beforeEach(() => {
    insertedValues.length = 0;
    updatedValues.length = 0;
    selectWhereArgs.length = 0;
    updateWhereArgs.length = 0;
    insertReturning = [];
    updateReturning = [];
    selectRows = [];
    dbMock.transaction.mockClear();
    vi.mocked(getOrganizationMembershipProof).mockReset();
  });

  it("creates a pending invitation and sends an email", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    insertReturning = [
      {
        id: "inv-1",
        email: "new@example.com",
        role: "member",
        status: "pending",
        expiresAt: new Date("2026-07-09T00:00:00.000Z")
      }
    ];

    const invitation = await createInvitationForScope({
      scope: adminScope,
      email: " New@Example.com ",
      role: "member",
      emailSender: { send }
    });

    expect(selectWhereArgs[0]).toEqual([
      { left: invitationsTable.organizationId, right: "org-1" },
      { left: invitationsTable.email, right: "new@example.com" },
      { left: invitationsTable.status, right: "pending" },
      { left: invitationsTable.expiresAt, right: expect.any(Date) }
    ]);
    expect(insertedValues[0]).toMatchObject({
      email: "new@example.com",
      role: "member",
      status: "pending",
      organizationId: "org-1",
      inviterId: "user-1"
    });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "new@example.com" }));
    expect(invitation.id).toBe("inv-1");
  });

  it("rejects when a pending invitation already exists for the email", async () => {
    const send = vi.fn();
    selectRows = [
      {
        id: "inv-1",
        email: "new@example.com",
        role: "member",
        status: "pending",
        expiresAt: new Date(Date.now() + 60_000)
      }
    ];

    await expect(
      createInvitationForScope({
        scope: adminScope,
        email: "new@example.com",
        role: "member",
        emailSender: { send }
      })
    ).rejects.toThrow("invitation already pending for this email");

    expect(insertedValues).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("sanitizes email delivery failures", async () => {
    const send = vi.fn().mockRejectedValue(new Error("smtp host secret leaked"));
    insertReturning = [
      {
        id: "inv-1",
        email: "new@example.com",
        role: "member",
        status: "pending",
        expiresAt: new Date("2026-07-09T00:00:00.000Z")
      }
    ];

    await expect(
      createInvitationForScope({
        scope: adminScope,
        email: "new@example.com",
        role: "member",
        emailSender: { send }
      })
    ).rejects.toThrow("invitation created but email delivery failed");
  });

  it("rejects non-admin members", async () => {
    const memberScope = {
      ...adminScope,
      membership: { id: "m-2", role: "member", userId: "user-1" }
    };

    await expect(
      createInvitationForScope({
        scope: memberScope,
        email: "new@example.com",
        role: "member",
        emailSender: { send: vi.fn() }
      })
    ).rejects.toThrow("admin role required");
  });

  it("rejects inviting as owner", async () => {
    await expect(
      createInvitationForScope({
        scope: adminScope,
        email: "new@example.com",
        role: "owner",
        emailSender: { send: vi.fn() }
      })
    ).rejects.toThrow("role must be admin or member");
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

  it("accepts a pending invitation atomically for the matching user", async () => {
    selectRows = [
      {
        id: "inv-1",
        organizationId: "org-1",
        email: "new@example.com",
        role: "member",
        status: "pending",
        expiresAt: new Date(Date.now() + 60_000)
      }
    ];
    updateReturning = [{ id: "inv-1" }];

    await acceptInvitation({
      invitationId: "inv-1",
      user: { id: "user-2", email: "New@Example.com", name: "New" }
    });

    expect(dbMock.transaction).toHaveBeenCalledTimes(1);
    expect(updatedValues[0]).toMatchObject({ status: "accepted" });
    expect(updateWhereArgs[0]).toEqual([
      { left: invitationsTable.id, right: "inv-1" },
      { left: invitationsTable.status, right: "pending" }
    ]);
    expect(insertedValues[0]).toMatchObject({
      userId: "user-2",
      organizationId: "org-1",
      role: "member"
    });
  });

  it("rejects acceptance when a concurrent accept already flipped the status", async () => {
    selectRows = [
      {
        id: "inv-1",
        organizationId: "org-1",
        email: "new@example.com",
        role: "member",
        status: "pending",
        expiresAt: new Date(Date.now() + 60_000)
      }
    ];
    updateReturning = [];

    await expect(
      acceptInvitation({
        invitationId: "inv-1",
        user: { id: "user-2", email: "new@example.com", name: "New" }
      })
    ).rejects.toThrow("invitation not found");

    expect(insertedValues).toHaveLength(0);
  });

  it("rejects an expired invitation", async () => {
    selectRows = [
      {
        id: "inv-1",
        organizationId: "org-1",
        email: "new@example.com",
        role: "member",
        status: "pending",
        expiresAt: new Date(Date.now() - 60_000)
      }
    ];

    await expect(
      acceptInvitation({
        invitationId: "inv-1",
        user: { id: "user-2", email: "new@example.com", name: "New" }
      })
    ).rejects.toThrow("invitation expired");
  });

  it("rejects acceptance when the email does not match", async () => {
    selectRows = [
      {
        id: "inv-1",
        organizationId: "org-1",
        email: "someone-else@example.com",
        role: "member",
        status: "pending",
        expiresAt: new Date(Date.now() + 60_000)
      }
    ];

    await expect(
      acceptInvitation({
        invitationId: "inv-1",
        user: { id: "user-2", email: "new@example.com", name: "New" }
      })
    ).rejects.toThrow("invitation not found");
  });

  it("reports not-found before expiry when the email does not match an expired invitation", async () => {
    selectRows = [
      {
        id: "inv-1",
        organizationId: "org-1",
        email: "someone-else@example.com",
        role: "member",
        status: "pending",
        expiresAt: new Date(Date.now() - 60_000)
      }
    ];

    await expect(
      acceptInvitation({
        invitationId: "inv-1",
        user: { id: "user-2", email: "new@example.com", name: "New" }
      })
    ).rejects.toThrow("invitation not found");
  });

  it("revokes a pending invitation only within the scope organization", async () => {
    updateReturning = [{ id: "inv-1" }];

    await revokeInvitationForScope({ scope: adminScope, invitationId: "inv-1" });

    expect(updatedValues[0]).toMatchObject({ status: "revoked" });
    expect(updateWhereArgs[0]).toEqual([
      { left: invitationsTable.id, right: "inv-1" },
      { left: invitationsTable.organizationId, right: "org-1" },
      { left: invitationsTable.status, right: "pending" }
    ]);
  });
});
