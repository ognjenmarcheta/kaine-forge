import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const usersTable = { email: "users.email", id: "users.id" };
const sessionsTable = { token: "sessions.token", userId: "sessions.user_id" };
const verificationsTable = {
  expiresAt: "verifications.expires_at",
  id: "verifications.id",
  identifier: "verifications.identifier",
  token: "verifications.token"
};

const insertedValues: Array<Record<string, unknown>> = [];
const updatedValues: Array<Record<string, unknown>> = [];
const updateWhereArgs: unknown[] = [];
const deletedWhereArgs: Array<{ condition: unknown; table: unknown }> = [];
let deleteReturning: Array<Record<string, unknown>> = [];
let selectRows: Array<Record<string, unknown>> = [];

const dbMock = {
  select: vi.fn(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockImplementation(async () => selectRows)
      })
    })
  })),
  insert: vi.fn(() => ({
    values: async (payload: Record<string, unknown>) => {
      insertedValues.push(payload);
    }
  })),
  update: vi.fn(() => ({
    set: (payload: Record<string, unknown>) => {
      updatedValues.push(payload);
      return {
        where: async (condition: unknown) => {
          updateWhereArgs.push(condition);
        }
      };
    }
  })),
  delete: vi.fn((table: unknown) => ({
    where: (condition: unknown) => {
      deletedWhereArgs.push({ table, condition });
      return {
        returning: async () => deleteReturning
      };
    }
  })),
  transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(dbMock))
};

vi.mock("@repo/db", () => ({
  db: dbMock,
  sessionsTable,
  usersTable,
  verificationsTable
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => args,
  eq: (left: unknown, right: unknown) => ({ left, right }),
  gt: (left: unknown, right: unknown) => ({ left, right })
}));

const { requestPasswordReset, resetPassword } = await import("./auth.server.password-reset");

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("password reset", () => {
  beforeEach(() => {
    insertedValues.length = 0;
    updatedValues.length = 0;
    updateWhereArgs.length = 0;
    deletedWhereArgs.length = 0;
    deleteReturning = [];
    selectRows = [];
    dbMock.transaction.mockClear();
  });

  it("stores a hashed token and emails the raw token when the user exists", async () => {
    selectRows = [{ id: "user-1", email: "user@example.com", name: "User" }];
    const send = vi.fn().mockResolvedValue(undefined);

    await requestPasswordReset({ email: "User@Example.com", emailSender: { send } });

    expect(insertedValues[0]).toMatchObject({
      identifier: "password-reset:user-1"
    });
    expect(typeof insertedValues[0]?.token).toBe("string");
    expect(insertedValues[0]?.expiresAt).toBeInstanceOf(Date);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "user@example.com" }));

    const sendPayload = send.mock.calls[0]?.[0] as { text: string };
    const rawToken = /reset your password: ([0-9a-f]+)\./.exec(sendPayload.text)?.[1] ?? "";
    expect(rawToken).not.toBe("");
    expect(insertedValues[0]?.token).not.toBe(rawToken);
    expect(insertedValues[0]?.token).toBe(sha256(rawToken));
  });

  it("replaces earlier reset tokens so only the latest email wins", async () => {
    selectRows = [{ id: "user-1", email: "user@example.com", name: "User" }];
    const send = vi.fn().mockResolvedValue(undefined);

    await requestPasswordReset({ email: "user@example.com", emailSender: { send } });

    expect(deletedWhereArgs[0]).toEqual({
      table: verificationsTable,
      condition: { left: verificationsTable.identifier, right: "password-reset:user-1" }
    });
    expect(insertedValues).toHaveLength(1);
  });

  it("resolves silently when the user does not exist (no enumeration)", async () => {
    selectRows = [];
    const send = vi.fn();

    await expect(
      requestPasswordReset({ email: "ghost@example.com", emailSender: { send } })
    ).resolves.toBeUndefined();

    expect(insertedValues).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects an empty email", async () => {
    const send = vi.fn();

    await expect(requestPasswordReset({ email: "   ", emailSender: { send } })).rejects.toThrow(
      "email is required"
    );
  });

  it("resolves silently when email delivery fails (no enumeration oracle)", async () => {
    selectRows = [{ id: "user-1", email: "user@example.com", name: "User" }];
    const send = vi.fn().mockRejectedValue(new Error("smtp host secret leaked"));

    await expect(
      requestPasswordReset({ email: "user@example.com", emailSender: { send } })
    ).resolves.toBeUndefined();

    expect(insertedValues).toHaveLength(1);
  });

  it("claims the token atomically, resets the password, and invalidates sessions", async () => {
    deleteReturning = [
      {
        id: "ver-1",
        identifier: "password-reset:user-1",
        token: sha256("tok"),
        expiresAt: new Date(Date.now() + 60_000)
      }
    ];

    await resetPassword({ token: "tok", password: "NewSecret123!" });

    expect(dbMock.transaction).toHaveBeenCalledTimes(1);
    expect(deletedWhereArgs[0]).toEqual({
      table: verificationsTable,
      condition: [
        { left: verificationsTable.token, right: sha256("tok") },
        { left: verificationsTable.expiresAt, right: expect.any(Date) }
      ]
    });
    expect(String(updatedValues[0]?.passwordHash)).toMatch(/^scrypt\$/);
    expect(updateWhereArgs[0]).toEqual({ left: usersTable.id, right: "user-1" });
    expect(deletedWhereArgs[1]).toEqual({
      table: sessionsTable,
      condition: { left: sessionsTable.userId, right: "user-1" }
    });
  });

  it("rejects when the claim finds no row (unknown, expired, or concurrently used token)", async () => {
    deleteReturning = [];

    await expect(resetPassword({ token: "nope", password: "NewSecret123!" })).rejects.toThrow(
      "invalid or expired token"
    );

    expect(updatedValues).toHaveLength(0);
    expect(deletedWhereArgs).toHaveLength(1);
    expect(deletedWhereArgs[0]?.table).toBe(verificationsTable);
  });

  it("rejects tokens that are not password-reset tokens", async () => {
    deleteReturning = [
      {
        id: "ver-1",
        identifier: "email-verification:user-1",
        token: sha256("tok"),
        expiresAt: new Date(Date.now() + 60_000)
      }
    ];

    await expect(resetPassword({ token: "tok", password: "NewSecret123!" })).rejects.toThrow(
      "invalid or expired token"
    );

    expect(updatedValues).toHaveLength(0);
    expect(deletedWhereArgs).toHaveLength(1);
  });

  it("rejects a missing token or password", async () => {
    await expect(resetPassword({ token: "", password: "NewSecret123!" })).rejects.toThrow(
      "token and password are required"
    );
    await expect(resetPassword({ token: "tok", password: "" })).rejects.toThrow(
      "token and password are required"
    );
  });
});
