import { db, usersTable } from "@repo/db";
import { eq } from "drizzle-orm";

import { storedApiKeyPermissions } from "./auth.api-key";
import { auth } from "./auth.instance";
import { apiKeyGrantablePermissions, statementsOfPermissions } from "./auth.permissions";
import {
  resolveApiKeyScope,
  type AuthenticatedOrganizationScope,
  type VerifiedApiKey
} from "./auth.scope";
import { getOrganizationMembershipProof } from "./auth.server.organization";
import type { AuthSessionUser, CreateApiKeyInput, CreatedApiKey } from "./auth.type";

const SECONDS_PER_DAY = 60 * 60 * 24;

/**
 * Creates an API Key for the scope's Organization, made by the scope's user.
 * The key grants the creator's Permissions except access changes. The
 * returned `key` is the only copy of the plain key: better-auth stores its hash.
 */
export async function createApiKeyForScope(
  scope: AuthenticatedOrganizationScope,
  input: CreateApiKeyInput
): Promise<CreatedApiKey> {
  // No request headers: a server call may set permissions and metadata, and
  // the plugin still checks the user's `apiKey:create` in the Organization.
  const created = await auth.api.createApiKey({
    body: {
      name: input.name,
      expiresIn: input.expiresInDays === null ? null : input.expiresInDays * SECONDS_PER_DAY,
      organizationId: scope.organizationId,
      userId: scope.userId,
      permissions: statementsOfPermissions(
        apiKeyGrantablePermissions(scope.membership.permissions)
      ),
      metadata: { createdBy: scope.userId }
    }
  });

  return {
    id: created.id,
    key: created.key,
    name: created.name ?? input.name
  };
}

function creatorIdOf(metadata: Record<string, unknown> | null): string | null {
  const createdBy = metadata?.createdBy;
  return typeof createdBy === "string" ? createdBy : null;
}

/** The key's id, Organization, creator, and Permissions; null when it is unknown, revoked, or expired. */
export async function verifyApiKey(key: string): Promise<VerifiedApiKey | null> {
  const result = await auth.api.verifyApiKey({ body: { key } });

  if (!result.valid || !result.key) {
    return null;
  }

  return {
    id: result.key.id,
    creatorUserId: creatorIdOf(result.key.metadata),
    organizationId: result.key.referenceId,
    permissions: storedApiKeyPermissions(result.key.permissions ?? null)
  };
}

async function getSessionUser(userId: string): Promise<AuthSessionUser | null> {
  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      emailVerified: usersTable.emailVerified,
      name: usersTable.name,
      twoFactorEnabled: usersTable.twoFactorEnabled
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  return user ? { ...user, twoFactorEnabled: user.twoFactorEnabled === true } : null;
}

/** The scope an API Key request acts in, or null when the request gets 401. */
export async function resolveApiKeyRequest(
  key: string
): Promise<{ apiKeyId: string; scope: AuthenticatedOrganizationScope } | null> {
  const apiKey = await verifyApiKey(key);

  if (!apiKey) {
    return null;
  }

  const scope = await resolveApiKeyScope({
    apiKey,
    getMembership: getOrganizationMembershipProof,
    getUser: getSessionUser
  });

  return scope ? { apiKeyId: apiKey.id, scope } : null;
}
