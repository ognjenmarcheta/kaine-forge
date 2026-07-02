import { db, usersTable, verificationsTable } from "@repo/db";
import type { EmailSender } from "@repo/email";
import { and, eq, gt } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { AUTH_DEFINITIONS } from "./auth.definition";
import { deleteSessionsForUser, hashPassword, resolveUserByEmail } from "./auth.server.session";

const PASSWORD_RESET_IDENTIFIER_PREFIX = "password-reset:";

export async function requestPasswordReset(params: {
  email: string;
  emailSender: EmailSender;
}): Promise<void> {
  const email = params.email.trim().toLowerCase();

  if (!email) {
    throw new Error("email is required");
  }

  const user = await resolveUserByEmail(email);

  if (!user) {
    return;
  }

  const token = randomBytes(24).toString("hex");

  await db.insert(verificationsTable).values({
    identifier: `${PASSWORD_RESET_IDENTIFIER_PREFIX}${user.id}`,
    token,
    expiresAt: new Date(Date.now() + AUTH_DEFINITIONS.PASSWORD_RESET_MAX_AGE_SECONDS * 1000)
  });

  try {
    await params.emailSender.send({
      to: email,
      subject: "Reset your password",
      text: `Use this token to reset your password: ${token}. It expires in one hour.`
    });
  } catch {
    throw new Error("failed to send password reset email");
  }
}

export async function resetPassword(params: { password: string; token: string }): Promise<void> {
  if (!params.token || !params.password) {
    throw new Error("token and password are required");
  }

  const verifications = await db
    .select()
    .from(verificationsTable)
    .where(
      and(eq(verificationsTable.token, params.token), gt(verificationsTable.expiresAt, new Date()))
    )
    .limit(1);

  const verification = verifications[0];

  if (!verification || !verification.identifier.startsWith(PASSWORD_RESET_IDENTIFIER_PREFIX)) {
    throw new Error("invalid or expired token");
  }

  const userId = verification.identifier.slice(PASSWORD_RESET_IDENTIFIER_PREFIX.length);

  await db
    .update(usersTable)
    .set({ passwordHash: await hashPassword(params.password), updatedAt: new Date() })
    .where(eq(usersTable.id, userId));

  await db.delete(verificationsTable).where(eq(verificationsTable.id, verification.id));
  await deleteSessionsForUser(userId);
}
