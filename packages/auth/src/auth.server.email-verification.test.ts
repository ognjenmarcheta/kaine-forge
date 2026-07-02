import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const usersTable = { email: "users.email", id: "users.id" };
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

const dbMock = {
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
  usersTable,
  verificationsTable
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => args,
  eq: (left: unknown, right: unknown) => ({ left, right }),
  gt: (left: unknown, right: unknown) => ({ left, right })
}));

const { issueEmailVerification, verifyEmail } = await import("./auth.server.email-verification");

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const user = { id: "user-1", email: "user@example.com", name: "User" };

describe("email verification", () => {
  beforeEach(() => {
    insertedValues.length = 0;
    updatedValues.length = 0;
    updateWhereArgs.length = 0;
    deletedWhereArgs.length = 0;
    deleteReturning = [];
    dbMock.transaction.mockClear();
  });

  it("stores a hashed token with a 24h expiry and emails the raw token", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const before = Date.now();

    await issueEmailVerification({ emailSender: { send }, user });

    expect(insertedValues[0]).toMatchObject({
      identifier: "email-verification:user-1"
    });
    expect(typeof insertedValues[0]?.token).toBe("string");
    const expiresAt = insertedValues[0]?.expiresAt as Date;
    expect(expiresAt).toBeInstanceOf(Date);
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "user@example.com" }));

    const sendPayload = send.mock.calls[0]?.[0] as { text: string };
    const rawToken = /verify your email address: ([0-9a-f]+)\./.exec(sendPayload.text)?.[1] ?? "";
    expect(rawToken).not.toBe("");
    expect(insertedValues[0]?.token).not.toBe(rawToken);
    expect(insertedValues[0]?.token).toBe(sha256(rawToken));
  });

  it("replaces earlier verification tokens so only the latest email wins", async () => {
    const send = vi.fn().mockResolvedValue(undefined);

    await issueEmailVerification({ emailSender: { send }, user });

    expect(deletedWhereArgs[0]).toEqual({
      table: verificationsTable,
      condition: { left: verificationsTable.identifier, right: "email-verification:user-1" }
    });
    expect(insertedValues).toHaveLength(1);
  });

  it("resolves silently when email delivery fails (signup must not fail)", async () => {
    const send = vi.fn().mockRejectedValue(new Error("smtp down"));

    await expect(issueEmailVerification({ emailSender: { send }, user })).resolves.toBeUndefined();

    expect(insertedValues).toHaveLength(1);
  });

  it("claims the token atomically and marks the user email as verified", async () => {
    deleteReturning = [
      {
        id: "ver-1",
        identifier: "email-verification:user-1",
        token: sha256("tok"),
        expiresAt: new Date(Date.now() + 60_000)
      }
    ];

    await verifyEmail({ token: "tok" });

    expect(dbMock.transaction).toHaveBeenCalledTimes(1);
    expect(deletedWhereArgs[0]).toEqual({
      table: verificationsTable,
      condition: [
        { left: verificationsTable.token, right: sha256("tok") },
        { left: verificationsTable.expiresAt, right: expect.any(Date) }
      ]
    });
    expect(updatedValues[0]).toMatchObject({ emailVerified: true });
    expect(updatedValues[0]?.updatedAt).toBeInstanceOf(Date);
    expect(updateWhereArgs[0]).toEqual({ left: usersTable.id, right: "user-1" });
  });

  it("rejects when the claim finds no row (unknown, expired, or concurrently used token)", async () => {
    deleteReturning = [];

    await expect(verifyEmail({ token: "nope" })).rejects.toThrow("invalid or expired token");

    expect(updatedValues).toHaveLength(0);
    expect(deletedWhereArgs).toHaveLength(1);
    expect(deletedWhereArgs[0]?.table).toBe(verificationsTable);
  });

  it("rejects tokens that are not email-verification tokens", async () => {
    deleteReturning = [
      {
        id: "ver-1",
        identifier: "password-reset:user-1",
        token: sha256("tok"),
        expiresAt: new Date(Date.now() + 60_000)
      }
    ];

    await expect(verifyEmail({ token: "tok" })).rejects.toThrow("invalid or expired token");

    expect(updatedValues).toHaveLength(0);
    expect(deletedWhereArgs).toHaveLength(1);
  });

  it("rejects a missing token", async () => {
    await expect(verifyEmail({ token: "" })).rejects.toThrow("token is required");

    expect(dbMock.transaction).not.toHaveBeenCalled();
  });
});
