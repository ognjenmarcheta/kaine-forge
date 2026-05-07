import { db, sessionsTable, usersTable } from "@repo/db";
import { eq } from "drizzle-orm";

import { getServerAuthConfig } from "./auth.config";
import {
  createOwnedOrganizationForUser,
  ensurePersonalOrganizationForUser,
  getCurrentOrganizationForScope,
  listOrganizationMembersForScope,
  listOrganizationsForUser,
  resolveActiveOrganizationForUser
} from "./auth.server.organization";
import {
  assertLoginInput,
  assertSignupInput,
  createSession,
  deleteSession,
  hashPassword,
  resolveUserByEmail,
  resolveUserById,
  sessionFromToken,
  toAuthSession,
  updateSessionActiveOrganization
} from "./auth.server.session";
import type { LoginInput, ServerAuth, SignupInput } from "./auth.type";
import { getSessionTokenFromHeaders } from "./auth.util";

export function createServerAuth(): ServerAuth {
  const config = getServerAuthConfig();
  if (!config.secret) {
    throw new Error("BETTER_AUTH_SECRET is required");
  }

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
        throw new Error("invalid credentials");
      }

      if (user.passwordHash !== hashPassword(input.password)) {
        throw new Error("invalid credentials");
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

      const users = await db
        .insert(usersTable)
        .values({
          email: input.email.toLowerCase(),
          passwordHash: hashPassword(input.password),
          name: input.name.trim(),
          role: "user"
        })
        .returning();

      const user = users[0];

      if (!user) {
        throw new Error("failed to create user");
      }

      const personalOrganization = await ensurePersonalOrganizationForUser(user.id);

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
    }
  };
}
