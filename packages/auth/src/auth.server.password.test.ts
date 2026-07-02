import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("@repo/db", () => ({
  db: {},
  sessionsTable: {},
  usersTable: {}
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  gt: vi.fn()
}));

const { hashPassword, needsPasswordRehash, verifyPassword } = await import("./auth.server.session");

describe("password hashing", () => {
  it("produces salted hashes (same password twice yields different hashes)", () => {
    const first = hashPassword("Secret123!");
    const second = hashPassword("Secret123!");

    expect(first).not.toBe(second);
    expect(first.startsWith("scrypt$")).toBe(true);
  });

  it("verifies a scrypt hash and rejects a wrong password", () => {
    const stored = hashPassword("Secret123!");

    expect(verifyPassword("Secret123!", stored)).toBe(true);
    expect(verifyPassword("WrongPass!", stored)).toBe(false);
  });

  it("verifies a legacy unsalted sha256 hash and flags it for rehash", () => {
    const legacy = createHash("sha256").update("Secret123!").digest("hex");

    expect(verifyPassword("Secret123!", legacy)).toBe(true);
    expect(verifyPassword("WrongPass!", legacy)).toBe(false);
    expect(needsPasswordRehash(legacy)).toBe(true);
    expect(needsPasswordRehash(hashPassword("Secret123!"))).toBe(false);
  });
});
