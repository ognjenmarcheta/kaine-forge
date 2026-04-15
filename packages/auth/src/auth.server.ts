import { db, membersTable, organizationsTable, sessionsTable, usersTable } from "@repo/db";
import { and, asc, eq, gt } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";

import { getServerAuthConfig } from "./auth.config";
import { AUTH_DEFINITIONS } from "./auth.definition";
import { ORGANIZATION_ROLES } from "./auth.permissions";
import type {
  AuthSession,
  AuthSessionResult,
  LoginInput,
  ServerAuth,
  SignupInput
} from "./auth.type";
import {
  getSessionTokenFromHeaders,
  resolveActiveOrganizationId,
  slugifyOrganizationName
} from "./auth.util";

interface OrganizationWriteExecutor {
  insert: typeof db.insert;
  update: typeof db.update;
}

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

async function resolveUserByEmail(email: string) {
  const users = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  return users[0] ?? null;
}

async function resolveUserById(id: string) {
  const users = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  return users[0] ?? null;
}

function personalOrganizationSlug(userId: string): string {
  return `personal-${userId.slice(0, 8)}`;
}

async function ensurePersonalOrganizationForUser(userId: string) {
  const existing = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, userId))
    .orderBy(asc(organizationsTable.createdAt))
    .limit(1);

  const currentOrganization = existing[0];

  if (currentOrganization) {
    const existingMembership = await db
      .select({ id: membersTable.id })
      .from(membersTable)
      .where(
        and(
          eq(membersTable.userId, userId),
          eq(membersTable.organizationId, currentOrganization.id)
        )
      )
      .limit(1);

    if (!existingMembership[0]) {
      await db.insert(membersTable).values({
        userId,
        organizationId: currentOrganization.id,
        role: ORGANIZATION_ROLES.OWNER
      });
    }

    return currentOrganization;
  }

  const createdOrganizations = await db
    .insert(organizationsTable)
    .values({
      userId,
      name: "Personal",
      slug: personalOrganizationSlug(userId)
    })
    .returning();

  const organization = createdOrganizations[0];

  if (!organization) {
    throw new Error("failed to create personal organization");
  }

  await db
    .insert(membersTable)
    .values({
      userId,
      organizationId: organization.id,
      role: "owner"
    })
    .onConflictDoNothing();

  return organization;
}

async function createOwnedOrganizationForUser(params: {
  database: OrganizationWriteExecutor;
  name: string;
  userId: string;
}) {
  const baseSlug = slugifyOrganizationName(params.name);

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const suffix = attempt === 0 ? "" : `-${String(attempt + 1)}`;
    const slug = `${baseSlug}${suffix}`;
    const createdOrganizations = await params.database
      .insert(organizationsTable)
      .values({
        userId: params.userId,
        name: params.name,
        slug
      })
      .onConflictDoNothing()
      .returning();
    const organization = createdOrganizations[0];

    if (!organization) {
      continue;
    }

    await params.database
      .insert(membersTable)
      .values({
        userId: params.userId,
        organizationId: organization.id,
        role: ORGANIZATION_ROLES.OWNER
      })
      .onConflictDoNothing();

    return organization;
  }

  throw new Error("failed to create organization");
}

async function getOrganizationIdsForUser(userId: string): Promise<string[]> {
  const organizations = await db
    .select({
      organizationId: membersTable.organizationId
    })
    .from(membersTable)
    .where(eq(membersTable.userId, userId))
    .orderBy(asc(membersTable.createdAt));

  return organizations.map((organization) => organization.organizationId);
}

async function resolveActiveOrganizationForUser(params: {
  requestedActiveOrganizationId: string | null;
  userId: string;
}): Promise<string> {
  const organizationIds = await getOrganizationIdsForUser(params.userId);

  const resolvedActiveOrganizationId = resolveActiveOrganizationId({
    availableOrganizationIds: organizationIds,
    requestedActiveOrganizationId: params.requestedActiveOrganizationId
  });

  if (resolvedActiveOrganizationId) {
    return resolvedActiveOrganizationId;
  }

  const personalOrganization = await ensurePersonalOrganizationForUser(params.userId);
  return personalOrganization.id;
}

function toAuthSession(params: {
  activeOrganizationId: string;
  expiresAt: Date;
  user: { email: string; id: string; name: string };
}): AuthSession {
  return {
    user: {
      id: params.user.id,
      email: params.user.email,
      name: params.user.name
    },
    expiresAt: params.expiresAt.toISOString(),
    activeOrganizationId: params.activeOrganizationId
  };
}

async function createSession(params: {
  activeOrganizationId: string;
  user: { email: string; id: string; name: string };
}): Promise<AuthSessionResult> {
  const sessionToken = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + AUTH_DEFINITIONS.SESSION_MAX_AGE_SECONDS * 1000);

  await db.insert(sessionsTable).values({
    userId: params.user.id,
    token: sessionToken,
    expiresAt,
    activeOrganizationId: params.activeOrganizationId
  });

  return {
    sessionToken,
    session: toAuthSession({
      user: params.user,
      activeOrganizationId: params.activeOrganizationId,
      expiresAt
    })
  };
}

async function sessionFromToken(token: string): Promise<{
  activeOrganizationId: string | null;
  expiresAt: Date;
  userId: string;
} | null> {
  const sessions = await db
    .select()
    .from(sessionsTable)
    .where(and(eq(sessionsTable.token, token), gt(sessionsTable.expiresAt, new Date())))
    .limit(1);

  return sessions[0] ?? null;
}

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
        await db
          .update(sessionsTable)
          .set({ activeOrganizationId, updatedAt: new Date() })
          .where(eq(sessionsTable.token, sessionToken));
      }

      return toAuthSession({
        user,
        activeOrganizationId,
        expiresAt: sessionData.expiresAt
      });
    },
    async loginWithPassword(input: LoginInput) {
      if (!input.email || !input.password) {
        throw new Error("email and password are required");
      }

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
      if (!input.email || !input.password || !input.name) {
        throw new Error("name, email and password are required");
      }

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
    async logout(sessionToken) {
      if (!sessionToken) {
        return;
      }

      await db.delete(sessionsTable).where(eq(sessionsTable.token, sessionToken));
    },
    async listOrganizations(userId: string) {
      const organizations = await db
        .select({
          id: organizationsTable.id,
          name: organizationsTable.name,
          slug: organizationsTable.slug,
          role: membersTable.role
        })
        .from(membersTable)
        .innerJoin(organizationsTable, eq(membersTable.organizationId, organizationsTable.id))
        .where(eq(membersTable.userId, userId))
        .orderBy(asc(membersTable.createdAt));

      return organizations;
    },
    async setActiveOrganization(params) {
      const organizations = await this.listOrganizations(params.userId);
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

      await db
        .update(sessionsTable)
        .set({
          activeOrganizationId: params.organizationId,
          updatedAt: new Date()
        })
        .where(eq(sessionsTable.token, params.sessionToken));

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
    async getMembers(params) {
      const organizations = await this.listOrganizations(params.userId);
      const isMember = organizations.some(
        (organization) => organization.id === params.organizationId
      );

      if (!isMember) {
        throw new Error("organization not accessible");
      }

      const members = await db
        .select({
          id: membersTable.id,
          userId: usersTable.id,
          email: usersTable.email,
          name: usersTable.name,
          role: membersTable.role
        })
        .from(membersTable)
        .innerJoin(usersTable, eq(membersTable.userId, usersTable.id))
        .where(eq(membersTable.organizationId, params.organizationId))
        .orderBy(asc(membersTable.createdAt));

      return members;
    }
  };
}
