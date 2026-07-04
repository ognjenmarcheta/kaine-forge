import { and, eq } from "drizzle-orm";
import { randomBytes, scryptSync } from "node:crypto";

import { accountsTable } from "../schema/accounts.schema";
import { usersTable } from "../schema/users.schema";

const TEST_USER = {
  email: "test@test.test",
  password: "ChangeMe123!",
  name: "Test User",
  role: "admin"
} as const;

// Format must stay compatible with hashPassword in packages/auth/src/auth.password.ts.
// The seed cannot import @repo/auth: @repo/auth depends on @repo/db (cycle).
function hashSeedPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  return `scrypt$16384$8$1$${salt}$${hash}`;
}

export async function seedUsers(): Promise<void> {
  const { db } = await import("../client");
  const passwordHash = hashSeedPassword(TEST_USER.password);

  const users = await db
    .insert(usersTable)
    .values({
      email: TEST_USER.email,
      name: TEST_USER.name,
      role: TEST_USER.role
    })
    .onConflictDoUpdate({
      target: usersTable.email,
      set: {
        name: TEST_USER.name,
        role: TEST_USER.role,
        updatedAt: new Date()
      }
    })
    .returning();

  const user = users[0];

  if (!user) {
    throw new Error("failed to upsert seed user");
  }

  const existingAccounts = await db
    .select()
    .from(accountsTable)
    .where(and(eq(accountsTable.userId, user.id), eq(accountsTable.providerId, "credential")))
    .limit(1);

  const existingAccount = existingAccounts[0];

  if (existingAccount) {
    await db
      .update(accountsTable)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(eq(accountsTable.id, existingAccount.id));
    return;
  }

  await db.insert(accountsTable).values({
    userId: user.id,
    accountId: user.id,
    providerId: "credential",
    password: passwordHash
  });
}

export async function getSeedUser() {
  const { db } = await import("../client");
  const users = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, TEST_USER.email))
    .limit(1);

  const user = users[0];

  if (!user) {
    throw new Error("failed to resolve seed user");
  }

  return user;
}

export { TEST_USER };
