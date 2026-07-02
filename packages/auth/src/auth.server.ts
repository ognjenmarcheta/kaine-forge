import { db, sessionsTable, usersTable } from "@repo/db";
import { createEmailSender } from "@repo/email";
import { eq } from "drizzle-orm";

import { getServerAuthConfig } from "./auth.config";
import { issueEmailVerification, verifyEmail } from "./auth.server.email-verification";
import {
  acceptInvitation,
  createInvitationForScope,
  listInvitationsForScope,
  revokeInvitationForScope
} from "./auth.server.invitation";
import {
  createOwnedOrganizationForUser,
  ensurePersonalOrganizationForUser,
  getCurrentOrganizationForScope,
  getOrganizationMembershipProof,
  listOrganizationMembersForScope,
  listOrganizationsForUser,
  resolveActiveOrganizationForUser
} from "./auth.server.organization";
import { requestPasswordReset, resetPassword } from "./auth.server.password-reset";
import {
  assertLoginInput,
  assertSignupInput,
  createSession,
  deleteSession,
  hashPassword,
  needsPasswordRehash,
  resolveUserByEmail,
  resolveUserById,
  sessionFromToken,
  toAuthSession,
  updateSessionActiveOrganization,
  updateUserPasswordHash,
  verifyPassword
} from "./auth.server.session";
import type { LoginInput, ServerAuth, SignupInput } from "./auth.type";
import { getSessionTokenFromHeaders } from "./auth.util";

// Real scrypt hash of a throwaway password, generated offline with the current
// recipe (scrypt$N$r$p$salt$hash, matching hashPassword). Login verifies the
// submitted password against this hash when the email is unknown so the
// unknown-email path costs the same scrypt work as the known-email path and
// response timing does not reveal whether an account exists. A static constant
// (not computed at import time) keeps startup cheap and deterministic.
export const DUMMY_PASSWORD_HASH =
  "scrypt$16384$8$1$0215aa0f0ed4305abf7ccc34d7945f64$586bdfb09cd3afc6aaf63b6696fef76b97466baa67323164eeb3b3ed33f0ad9e5aa0c816d8f5c880d2f6517cd1cb1bdc9e6546aaa336e2ed813e8acd96298b89";

export function createServerAuth(): ServerAuth {
  const config = getServerAuthConfig();
  if (!config.secret) {
    throw new Error("BETTER_AUTH_SECRET is required");
  }

  const emailSender = createEmailSender();

  return {
    async getSessionFromHeaders(headers) {
      const sessionToken = getSessionTokenFromHeaders(headers);

      if (!sessionToken) {
        return null;
      }

      const sessionData = await sessionFromToken(sessionToken);

      if (!sessionData) {
        return null;
      }

      const user = await resolveUserById(sessionData.userId);

      if (!user) {
        return null;
      }

      const activeOrganizationId = await resolveActiveOrganizationForUser({
        requestedActiveOrganizationId: sessionData.activeOrganizationId,
        userId: user.id
      });

      if (activeOrganizationId !== sessionData.activeOrganizationId) {
        await updateSessionActiveOrganization({
          activeOrganizationId,
          sessionToken
        });
      }

      return toAuthSession({
        user,
        activeOrganizationId,
        expiresAt: sessionData.expiresAt
      });
    },
    async loginWithPassword(input: LoginInput) {
      assertLoginInput(input);

      const user = await resolveUserByEmail(input.email.toLowerCase());

      if (!user) {
        // Constant-shaped work: burn the same scrypt cost as a real
        // verification so timing does not reveal whether the email exists.
        await verifyPassword(input.password, DUMMY_PASSWORD_HASH);
        throw new Error("invalid credentials");
      }

      if (!(await verifyPassword(input.password, user.passwordHash))) {
        throw new Error("invalid credentials");
      }

      if (needsPasswordRehash(user.passwordHash)) {
        // Rehash is best-effort: a failed opportunistic rehash must not fail
        // an otherwise valid login.
        try {
          await updateUserPasswordHash(user.id, await hashPassword(input.password));
        } catch {
          // ignore; the next successful login retries the rehash
        }
      }

      const activeOrganizationId = await resolveActiveOrganizationForUser({
        requestedActiveOrganizationId: null,
        userId: user.id
      });

      return createSession({
        user,
        activeOrganizationId
      });
    },
    async signUpWithPassword(input: SignupInput) {
      assertSignupInput(input);

      const existingUser = await resolveUserByEmail(input.email.toLowerCase());

      if (existingUser) {
        throw new Error("user already exists");
      }

      const passwordHash = await hashPassword(input.password);

      const users = await db
        .insert(usersTable)
        .values({
          email: input.email.toLowerCase(),
          passwordHash,
          name: input.name.trim(),
          role: "user"
        })
        .returning();

      const user = users[0];

      if (!user) {
        throw new Error("failed to create user");
      }

      const personalOrganization = await ensurePersonalOrganizationForUser(user.id);

      if (config.requireEmailVerification) {
        await issueEmailVerification({ user, emailSender });
      }

      return createSession({
        user,
        activeOrganizationId: personalOrganization.id
      });
    },
    logout(sessionToken) {
      return deleteSession(sessionToken);
    },
    listOrganizationsByScope(scope) {
      return listOrganizationsForUser(scope.userId);
    },
    getCurrentOrganizationByScope(scope) {
      return getCurrentOrganizationForScope(scope);
    },
    getOrganizationMembershipProof(params) {
      return getOrganizationMembershipProof(params);
    },
    async setActiveOrganization(params) {
      const organizations = await listOrganizationsForUser(params.userId);
      const targetOrganization = organizations.find(
        (organization) => organization.id === params.organizationId
      );

      if (!targetOrganization) {
        throw new Error("organization not accessible");
      }

      if (!params.sessionToken) {
        throw new Error("session token missing");
      }
      const sessionToken = params.sessionToken;

      const sessionData = await sessionFromToken(sessionToken);

      if (!sessionData || sessionData.userId !== params.userId) {
        throw new Error("session not found");
      }

      await updateSessionActiveOrganization({
        activeOrganizationId: params.organizationId,
        sessionToken
      });

      const user = await resolveUserById(params.userId);

      if (!user) {
        throw new Error("user not found");
      }

      return toAuthSession({
        user,
        activeOrganizationId: params.organizationId,
        expiresAt: sessionData.expiresAt
      });
    },
    async createOrganization(params) {
      const name = params.name.trim();

      if (!name) {
        throw new Error("name is required");
      }

      if (!params.sessionToken) {
        throw new Error("session token missing");
      }
      const sessionToken = params.sessionToken;

      const sessionData = await sessionFromToken(sessionToken);

      if (!sessionData || sessionData.userId !== params.userId) {
        throw new Error("session not found");
      }

      const user = await resolveUserById(params.userId);

      if (!user) {
        throw new Error("user not found");
      }

      const organization = await db.transaction(async (transaction) => {
        const createdOrganization = await createOwnedOrganizationForUser({
          database: transaction,
          userId: params.userId,
          name
        });

        await transaction
          .update(sessionsTable)
          .set({
            activeOrganizationId: createdOrganization.id,
            updatedAt: new Date()
          })
          .where(eq(sessionsTable.token, sessionToken));

        return createdOrganization;
      });

      return toAuthSession({
        user,
        activeOrganizationId: organization.id,
        expiresAt: sessionData.expiresAt
      });
    },
    listOrganizationMembersByScope(scope) {
      return listOrganizationMembersForScope(scope);
    },
    createInvitation(params) {
      return createInvitationForScope({ ...params, emailSender });
    },
    listInvitationsByScope(scope) {
      return listInvitationsForScope(scope);
    },
    acceptInvitation(params) {
      return acceptInvitation(params);
    },
    revokeInvitation(params) {
      return revokeInvitationForScope(params);
    },
    requestPasswordReset(input) {
      return requestPasswordReset({ email: input.email, emailSender });
    },
    resetPassword(input) {
      return resetPassword(input);
    },
    verifyEmail(input) {
      return verifyEmail(input);
    },
    async resendEmailVerification(input) {
      const user = await resolveUserById(input.user.id);

      // Silent on missing or already-verified users: the endpoint is session
      // authenticated, but responding differently would still leak state and
      // an already-verified user never needs another email.
      if (!user || user.emailVerified) {
        return;
      }

      await issueEmailVerification({ user, emailSender });
    }
  };
}
