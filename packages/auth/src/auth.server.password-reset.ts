import { db, usersTable, verificationsTable } from "@repo/db";
import type { EmailSender } from "@repo/email";
import { and, eq, gt } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";

import { AUTH_DEFINITIONS } from "./auth.definition";
import { hashPassword } from "./auth.password";
import { deleteSessionsForUser, resolveUserByEmail } from "./auth.server.session";

const PASSWORD_RESET_IDENTIFIER_PREFIX = "password-reset:";

// Reset tokens are stored as sha256 digests so a leaked verifications row
// never exposes a usable token; only the emailed raw token can claim a reset.
function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

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
  const identifier = `${PASSWORD_RESET_IDENTIFIER_PREFIX}${user.id}`;

  // Latest email wins: drop earlier reset tokens for this user so repeated
  // requests do not stack valid tokens.
  await db.delete(verificationsTable).where(eq(verificationsTable.identifier, identifier));

  // Expired rows are bounded by latest-email-wins above plus the expiry check
  // at claim time; a background sweep is deliberately omitted.
  await db.insert(verificationsTable).values({
    identifier,
    value: hashResetToken(token),
    expiresAt: new Date(Date.now() + AUTH_DEFINITIONS.PASSWORD_RESET_MAX_AGE_SECONDS * 1000)
  });

  try {
    await params.emailSender.send({
      to: email,
      subject: "Reset your password",
      text: `Use this token to reset your password: ${token}. It expires in one hour.`
    });
  } catch {
    // Logging delivery failures is the EmailSender adapter's responsibility;
    // this endpoint must respond identically regardless of account existence
    // or delivery outcome, so send failures must not surface to the caller.
  }
}

export async function resetPassword(params: { password: string; token: string }): Promise<void> {
  if (!params.token || !params.password) {
    throw new Error("token and password are required");
  }

  await db.transaction(async (transaction) => {
    // Claim the token atomically: the delete either consumes the unexpired row
    // or another reset already did, closing the double-use race. On a foreign
    // identifier prefix the throw below rolls the claim back, so that row survives.
    const claimed = await transaction
      .delete(verificationsTable)
      .where(
        and(
          eq(verificationsTable.value, hashResetToken(params.token)),
          gt(verificationsTable.expiresAt, new Date())
        )
      )
      .returning();

    const verification = claimed[0];

    if (!verification || !verification.identifier.startsWith(PASSWORD_RESET_IDENTIFIER_PREFIX)) {
      throw new Error("invalid or expired token");
    }

    const userId = verification.identifier.slice(PASSWORD_RESET_IDENTIFIER_PREFIX.length);

    await transaction
      .update(usersTable)
      .set({ passwordHash: await hashPassword(params.password), updatedAt: new Date() })
      .where(eq(usersTable.id, userId));

    await deleteSessionsForUser(userId, transaction);
  });
}
