import { db, usersTable, verificationsTable } from "@repo/db";
import type { EmailSender } from "@repo/email";
import { and, eq, gt } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";

import { AUTH_DEFINITIONS } from "./auth.definition";
import type { AuthSessionUser } from "./auth.type";

const EMAIL_VERIFICATION_IDENTIFIER_PREFIX = "email-verification:";

// Verification tokens are stored as sha256 digests so a leaked verifications
// row never exposes a usable token; only the emailed raw token can verify.
function hashVerificationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueEmailVerification(params: {
  emailSender: EmailSender;
  user: AuthSessionUser;
}): Promise<void> {
  const identifier = `${EMAIL_VERIFICATION_IDENTIFIER_PREFIX}${params.user.id}`;
  const token = randomBytes(24).toString("hex");

  // Latest email wins: drop earlier verification tokens for this user so
  // repeated signup flows do not stack valid tokens.
  await db.delete(verificationsTable).where(eq(verificationsTable.identifier, identifier));

  await db.insert(verificationsTable).values({
    identifier,
    value: hashVerificationToken(token),
    expiresAt: new Date(Date.now() + AUTH_DEFINITIONS.EMAIL_VERIFICATION_MAX_AGE_SECONDS * 1000)
  });

  try {
    await params.emailSender.send({
      to: params.user.email,
      subject: "Verify your email address",
      text: `Use this token to verify your email address: ${token}. It expires in 24 hours.`
    });
  } catch {
    // Delivery logging is the EmailSender adapter's responsibility; signup must
    // not fail (or leak delivery state) because the verification email failed.
  }
}

export async function verifyEmail(params: { token: string }): Promise<void> {
  if (!params.token) {
    throw new Error("token is required");
  }

  await db.transaction(async (transaction) => {
    // Claim the token atomically: the delete either consumes the unexpired row
    // or another verification already did, closing the double-use race. On a
    // foreign identifier prefix the throw below rolls the claim back, so that
    // row survives.
    const claimed = await transaction
      .delete(verificationsTable)
      .where(
        and(
          eq(verificationsTable.value, hashVerificationToken(params.token)),
          gt(verificationsTable.expiresAt, new Date())
        )
      )
      .returning();

    const verification = claimed[0];

    if (
      !verification ||
      !verification.identifier.startsWith(EMAIL_VERIFICATION_IDENTIFIER_PREFIX)
    ) {
      throw new Error("invalid or expired token");
    }

    const userId = verification.identifier.slice(EMAIL_VERIFICATION_IDENTIFIER_PREFIX.length);

    await transaction
      .update(usersTable)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));
  });
}
