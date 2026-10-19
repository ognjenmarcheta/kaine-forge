import { createHash, randomBytes, scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  needsPasswordRehash,
  verifyPassword
} from "./auth.password";

describe("password hashing", () => {
  it("produces salted hashes (same password twice yields different hashes)", async () => {
    const first = await hashPassword("Secret123!");
    const second = await hashPassword("Secret123!");

    expect(first).not.toBe(second);
    // OWASP Password Storage Cheat Sheet minimum, 16 MiB variant (N=2^14, r=8, p=5).
    expect(first.startsWith("scrypt$16384$8$5$")).toBe(true);
  });

  it("verifies a hash made at the previous cost and flags it for rehash", async () => {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync("Secret123!", salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
    const previousCost = `scrypt$16384$8$1$${salt}$${hash}`;

    expect(await verifyPassword("Secret123!", previousCost)).toBe(true);
    expect(await verifyPassword("WrongPass!", previousCost)).toBe(false);
    expect(needsPasswordRehash(previousCost)).toBe(true);
  });

  it("keeps the unknown-email dummy hash on the current recipe", async () => {
    expect(needsPasswordRehash(DUMMY_PASSWORD_HASH)).toBe(false);
    expect(await verifyPassword("not-the-dummy-password", DUMMY_PASSWORD_HASH)).toBe(false);
  });

  it("verifies a scrypt hash and rejects a wrong password", async () => {
    const stored = await hashPassword("Secret123!");

    expect(await verifyPassword("Secret123!", stored)).toBe(true);
    expect(await verifyPassword("WrongPass!", stored)).toBe(false);
  });

  it("verifies a legacy unsalted sha256 hash and flags it for rehash", async () => {
    const legacy = createHash("sha256").update("Secret123!").digest("hex");

    expect(await verifyPassword("Secret123!", legacy)).toBe(true);
    expect(await verifyPassword("WrongPass!", legacy)).toBe(false);
    expect(needsPasswordRehash(legacy)).toBe(true);
    expect(needsPasswordRehash("scrypt$abc$def")).toBe(true);
    expect(needsPasswordRehash(await hashPassword("Secret123!"))).toBe(false);
  });

  it("verifies a hash produced with the seed recipe from packages/db/src/seed/users.seed.ts", async () => {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync("Secret123!", salt, 64, { N: 16384, r: 8, p: 5 }).toString("hex");
    const seedHash = `scrypt$16384$8$5$${salt}$${hash}`;

    expect(await verifyPassword("Secret123!", seedHash)).toBe(true);
    expect(needsPasswordRehash(seedHash)).toBe(false);
  });

  it.each([
    "",
    "$",
    "scrypt$",
    "scrypt$$$$$",
    "a$b$c",
    "scrypt$x$8$1$aa$bb",
    "scrypt$16384$8$1$zz$zz",
    "deadbeef",
    "scrypt$abc$def",
    "scrypt$1073741824$8$1$aabb$ccdd"
  ])("returns false without throwing for malformed stored hash %j", async (stored) => {
    expect(await verifyPassword("WrongPass!", stored)).toBe(false);
  });
});
