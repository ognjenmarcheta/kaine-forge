import { createHash } from "node:crypto";

import { db } from "../client";
import { usersTable } from "../schema/users.schema";

const TEST_USER = {
  email: "test@test.test",
  password: "ChangeMe123!",
  name: "Test User",
  role: "user"
} as const;

export async function seedUsers(): Promise<void> {
  const passwordHash = createHash("sha256").update(TEST_USER.password).digest("hex");

  await db
    .insert(usersTable)
    .values({
      email: TEST_USER.email,
      passwordHash,
      name: TEST_USER.name,
      role: TEST_USER.role
    })
    .onConflictDoNothing({ target: usersTable.email });
}
