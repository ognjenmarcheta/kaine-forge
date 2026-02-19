import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";

import { usersTable } from "../schema/users.schema";

const TEST_USER = {
  email: "test@test.test",
  password: "ChangeMe123!",
  name: "Test User",
  role: "admin"
} as const;

export async function seedUsers(): Promise<void> {
  const { db } = await import("../client");
  const passwordHash = createHash("sha256").update(TEST_USER.password).digest("hex");

  await db
    .insert(usersTable)
    .values({
      email: TEST_USER.email,
      passwordHash,
      name: TEST_USER.name,
      role: TEST_USER.role
    })
    .onConflictDoUpdate({
      target: usersTable.email,
      set: {
        passwordHash,
        name: TEST_USER.name,
        role: TEST_USER.role,
        updatedAt: new Date()
      }
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
