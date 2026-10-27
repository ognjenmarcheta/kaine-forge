import {
  requireOrganizationPermission,
  type AuthenticatedOrganizationScope
} from "@repo/auth/scope";
import { organizationsTable, usersTable } from "@repo/db/schema";
import type { Database } from "@repo/db/types";
import type { Logger } from "@repo/logger";
import {
  buildPublicAssetUrl,
  COMMON_MIME_TYPES,
  matchesFileSignature,
  STORAGE_DEFAULTS,
  validateFile,
  type PublicAssetConfig
} from "@repo/storage";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { PUBLIC_ASSET_CONFIG, type PublicAssetKind } from "./public-assets.definition";
import { ownedPublicAssetKey, publicAssetKey } from "./public-assets.util";
import { formatLoggableError } from "../../observability";
import { renderSquareWebp } from "../storage/attachment.image";
import type { ObjectRef, ObjectStore } from "../storage/attachment.store";

export interface PublicAssetsDeps {
  db: Database;
  logger: Pick<Logger, "warn">;
  /** Null when S3_PUBLIC_BUCKET or S3_PUBLIC_BASE_URL is unset: uploads are off. */
  publicStorage: PublicAssetConfig | null;
  requireOrganizationScope: () => AuthenticatedOrganizationScope;
  store: ObjectStore;
}

export interface PublicAssetUrls {
  avatarUrl: string | null;
  organizationLogoUrl: string | null;
}

/**
 * The Public Assets of one request's session: the user's avatar and the Active
 * Organization's logo. The owner always comes from the session, never from the
 * client, and only a member with `logo:update` may change the logo.
 */
export interface PublicAssets {
  current: () => Promise<PublicAssetUrls>;
  /** Presigns an upload to a private staging key that only this owner can confirm. */
  request: (input: {
    kind: PublicAssetKind;
    mimeType: string;
    sizeBytes: number;
  }) => Promise<{ uploadUrl: string; stagingKey: string; expiresIn: number }>;
  /**
   * Checks the staged image, publishes a square WebP of it under a new key,
   * saves its URL, and deletes the staged object and the replaced asset.
   */
  confirm: (kind: PublicAssetKind, stagingKey: string) => Promise<PublicAssetUrls>;
}

const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export function createPublicAssets({
  db,
  logger,
  publicStorage,
  requireOrganizationScope,
  store
}: PublicAssetsDeps): PublicAssets {
  function requireStorage(): PublicAssetConfig {
    if (!publicStorage) {
      throw new Error("public assets are not configured");
    }

    return publicStorage;
  }

  /** Whose asset `kind` is, after the permission check the logo needs. */
  function ownerOf(kind: PublicAssetKind, scope: AuthenticatedOrganizationScope): string {
    if (kind === "avatar") {
      return scope.userId;
    }

    requireOrganizationPermission(scope, "logo:update");

    return scope.organizationId;
  }

  function stagingPrefix(kind: PublicAssetKind, ownerId: string): string {
    return `${PUBLIC_ASSET_CONFIG.stagingPrefix}${kind}/${ownerId}/`;
  }

  async function removeQuietly(ref: ObjectRef, message: string): Promise<void> {
    try {
      await store.delete(ref);
    } catch (err) {
      logger.warn({ error: formatLoggableError(err), key: ref.key }, message);
    }
  }

  async function current(): Promise<PublicAssetUrls> {
    const scope = requireOrganizationScope();
    const [[user], [organization]] = await Promise.all([
      db
        .select({ image: usersTable.image })
        .from(usersTable)
        .where(eq(usersTable.id, scope.userId)),
      db
        .select({ logo: organizationsTable.logo })
        .from(organizationsTable)
        .where(eq(organizationsTable.id, scope.organizationId))
    ]);

    return { avatarUrl: user?.image ?? null, organizationLogoUrl: organization?.logo ?? null };
  }

  /** Why the staged object cannot be published, or null when it can. */
  async function rejectionOf(staged: ObjectRef): Promise<string | null> {
    const metadata = await store.head(staged);

    if (!metadata) {
      return null;
    }

    const mimeType = metadata.contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
    const validation = validateFile(
      { mimeType, sizeBytes: metadata.sizeBytes ?? 0 },
      { allowedMimeTypes: COMMON_MIME_TYPES.images }
    );

    if (!validation.valid) {
      return `file validation failed: ${validation.errors.join(", ")}`;
    }

    const prefix = await store.readPrefix(staged, STORAGE_DEFAULTS.signatureSampleBytes);

    return prefix && matchesFileSignature(mimeType, prefix)
      ? null
      : `uploaded content does not match claimed type ${mimeType}`;
  }

  return {
    current,
    async request({ kind, mimeType, sizeBytes }) {
      // Scope first, so a request without one fails on scope, not on configuration.
      const ownerId = ownerOf(kind, requireOrganizationScope());
      requireStorage();
      const validation = validateFile(
        { mimeType, sizeBytes },
        { allowedMimeTypes: COMMON_MIME_TYPES.images }
      );

      if (!validation.valid) {
        throw new Error(`file validation failed: ${validation.errors.join(", ")}`);
      }

      const staged = store.place(`${stagingPrefix(kind, ownerId)}${randomUUID()}`);
      const upload = await store.presignUpload(staged, { mimeType, sizeBytes });

      return { uploadUrl: upload.url, stagingKey: staged.key, expiresIn: upload.expiresIn };
    },
    async confirm(kind, stagingKey) {
      const ownerId = ownerOf(kind, requireOrganizationScope());
      const storage = requireStorage();

      // Only a key this owner was issued: another user's or organization's staged
      // upload is "not found", like any key that was never issued.
      if (!new RegExp(`^${stagingPrefix(kind, ownerId)}${UUID_PATTERN}$`).test(stagingKey)) {
        throw new Error("public asset upload not found");
      }

      const staged = store.place(stagingKey);
      const rejection = await rejectionOf(staged);
      const original = rejection ? null : await store.get(staged);

      if (!original) {
        if (rejection) {
          await removeQuietly(staged, "failed to delete rejected public asset upload");
          throw new Error(rejection);
        }

        throw new Error("public asset has not been uploaded");
      }

      let rendered: Buffer;

      try {
        rendered = await renderSquareWebp(original, PUBLIC_ASSET_CONFIG.kinds[kind].size);
      } catch (err) {
        await removeQuietly(staged, "failed to delete rejected public asset upload");
        throw new Error(
          `image could not be processed: ${err instanceof Error ? err.message : "unknown error"}`
        );
      }

      const published: ObjectRef = {
        bucket: storage.bucket,
        key: publicAssetKey(kind, ownerId, randomUUID())
      };
      await store.put(published, rendered, "image/webp", PUBLIC_ASSET_CONFIG.cacheControl);
      const url = buildPublicAssetUrl(storage.baseUrl, published.key);
      const before = await current();
      const previous = kind === "avatar" ? before.avatarUrl : before.organizationLogoUrl;

      if (kind === "avatar") {
        await db
          .update(usersTable)
          .set({ image: url, updatedAt: new Date() })
          .where(eq(usersTable.id, ownerId));
      } else {
        await db
          .update(organizationsTable)
          .set({ logo: url })
          .where(eq(organizationsTable.id, ownerId));
      }

      await removeQuietly(staged, "failed to delete published public asset upload");
      // Only an asset this app published for this owner: an OAuth avatar URL,
      // or a URL that names someone else's asset, is left alone.
      const previousKey = previous ? ownedPublicAssetKey(storage, kind, ownerId, previous) : null;

      if (previousKey) {
        await removeQuietly(
          { bucket: storage.bucket, key: previousKey },
          "failed to delete replaced public asset"
        );
      }

      return kind === "avatar"
        ? { ...before, avatarUrl: url }
        : { ...before, organizationLogoUrl: url };
    }
  };
}
