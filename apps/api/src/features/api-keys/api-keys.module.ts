import type { recordAuditEvent } from "@repo/auth/audit";
import { AUTH_DEFINITIONS } from "@repo/auth/auth.definition";
import type { ServerAuth } from "@repo/auth/auth.type";
import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import { apiKeysTable, usersTable } from "@repo/db/schema";
import type { Database } from "@repo/db/types";
import { eq, inArray } from "drizzle-orm";
import { GraphQLError } from "graphql";

import { API_KEYS_CONFIG } from "./api-keys.definition";
import type { Connection, PageInput, ScopedData } from "../../context.data";

export interface ApiKeyView {
  id: string;
  name: string;
  /** The first characters of the key, prefix included. */
  prefix: string;
  createdBy: { email: string; id: string; name: string } | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
}

export interface CreateApiKeyArgs {
  name: string;
  expiresInDays?: number | null | undefined;
}

/** The Active Organization's API Keys. A key request cannot manage keys. */
export interface ApiKeys {
  /** Newest first. Requires apiKey:read. */
  list: (input: PageInput) => Promise<Connection<ApiKeyView>>;
  /** Requires apiKey:create; `key` is the plain key, returned here only. */
  create: (input: CreateApiKeyArgs) => Promise<{ apiKey: ApiKeyView; key: string }>;
  /** Requires apiKey:delete; the key gets 401 from its next request. */
  revoke: (id: string) => Promise<boolean>;
}

export interface ApiKeysDeps {
  auth: Pick<ServerAuth, "createApiKey">;
  data: ScopedData;
  db: Database;
  recordAuditEvent: typeof recordAuditEvent;
  requireOrganizationScope: () => AuthenticatedOrganizationScope;
}

const EXPIRY_DAYS = { min: 1, max: AUTH_DEFINITIONS.API_KEY_MAX_EXPIRES_IN_DAYS } as const;

function creatorIdOf(metadata: string | null): string | null {
  if (!metadata) return null;
  try {
    const parsed: unknown = JSON.parse(metadata);
    return typeof parsed === "object" &&
      parsed !== null &&
      "createdBy" in parsed &&
      typeof parsed.createdBy === "string"
      ? parsed.createdBy
      : null;
  } catch {
    return null;
  }
}

export function createApiKeys({
  auth,
  data,
  db,
  recordAuditEvent: record,
  requireOrganizationScope
}: ApiKeysDeps): ApiKeys {
  async function views(rows: (typeof apiKeysTable.$inferSelect)[]): Promise<ApiKeyView[]> {
    const creatorIds = [...new Set(rows.flatMap((row) => creatorIdOf(row.metadata) ?? []))];
    const creators =
      creatorIds.length > 0
        ? await db
            .select({ email: usersTable.email, id: usersTable.id, name: usersTable.name })
            .from(usersTable)
            .where(inArray(usersTable.id, creatorIds))
        : [];
    const creatorById = new Map(creators.map((creator) => [creator.id, creator]));

    return rows.map((row) => {
      const creatorId = creatorIdOf(row.metadata);
      return {
        id: row.id,
        name: row.name ?? "",
        prefix: row.start ?? "",
        createdBy: creatorId ? (creatorById.get(creatorId) ?? null) : null,
        createdAt: row.createdAt,
        lastUsedAt: row.lastRequest,
        expiresAt: row.expiresAt
      };
    });
  }

  return {
    async list(input) {
      data.authorize("apiKey:read");
      const page = await data.page(apiKeysTable, input, {
        orderBy: apiKeysTable.createdAt,
        direction: "desc",
        limits: API_KEYS_CONFIG.pagination
      });
      return { items: await views(page.items), pageInfo: page.pageInfo };
    },
    async create(input) {
      data.authorize("apiKey:create");
      const scope = requireOrganizationScope();
      const name = input.name.trim();
      const expiresInDays = input.expiresInDays ?? null;

      if (name.length === 0) {
        throw new GraphQLError("api key name is required", {
          extensions: { code: "BAD_USER_INPUT" }
        });
      }

      if (
        expiresInDays !== null &&
        (!Number.isInteger(expiresInDays) ||
          expiresInDays < EXPIRY_DAYS.min ||
          expiresInDays > EXPIRY_DAYS.max)
      ) {
        throw new GraphQLError("api key expiry is out of range", {
          extensions: { code: "BAD_USER_INPUT" }
        });
      }

      const created = await auth.createApiKey(scope, { name, expiresInDays });
      const [row] = await data.selectFrom(apiKeysTable, eq(apiKeysTable.id, created.id));

      if (!row) {
        throw new Error("api key was not created");
      }

      await record({
        action: "api_key_created",
        actorUserId: scope.userId,
        metadata: { name },
        organizationId: scope.organizationId,
        targetId: created.id
      });

      const [apiKey] = await views([row]);
      if (!apiKey) {
        throw new Error("api key was not created");
      }
      return { apiKey, key: created.key };
    },
    async revoke(id) {
      data.authorize("apiKey:delete");
      const scope = requireOrganizationScope();
      const [revoked] = await data
        .delete(apiKeysTable, eq(apiKeysTable.id, id))
        .returning({ id: apiKeysTable.id, name: apiKeysTable.name });

      if (!revoked) {
        return false;
      }

      await record({
        action: "api_key_revoked",
        actorUserId: scope.userId,
        metadata: { name: revoked.name ?? "" },
        organizationId: scope.organizationId,
        targetId: revoked.id
      });

      return true;
    }
  };
}
