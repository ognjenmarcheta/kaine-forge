import {
  createStorageClient,
  deleteObject,
  generatePresignedDownloadUrl,
  generatePresignedUploadUrl,
  getObjectBytes,
  headObjectMetadata,
  listObjectKeysBefore,
  putObject,
  readObjectPrefix,
  resolvePublicAssetConfig,
  resolveStorageConfig,
  type PublicAssetConfig,
  type StorageConfig
} from "@repo/storage";

import { STORAGE_CONFIG } from "./storage.definition";

/** Where one stored object lives. Every Attachment row records its own. */
export interface ObjectRef {
  bucket: string;
  key: string;
}

/** Where an image Attachment's WebP thumbnail lives, next to its object. */
export function thumbnailRef({ bucket, key }: ObjectRef): ObjectRef {
  return { bucket, key: `${key}${STORAGE_CONFIG.image.thumbnailKeySuffix}` };
}

/** Every object an Attachment owns: its own, plus its thumbnail when it is an image. */
export function objectRefsOf(file: ObjectRef & { mimeType: string }): ObjectRef[] {
  const ref = { bucket: file.bucket, key: file.key };
  return file.mimeType.startsWith("image/") ? [ref, thumbnailRef(ref)] : [ref];
}

/** The object store behind Attachments: S3 in production, in memory in tests. */
export interface ObjectStore {
  /** Where a new object with this key goes. */
  place: (key: string) => ObjectRef;
  /** A PUT URL that only accepts a body of exactly this type and size. */
  presignUpload: (
    ref: ObjectRef,
    object: { mimeType: string; sizeBytes: number }
  ) => Promise<{ url: string; expiresIn: number }>;
  presignDownload: (ref: ObjectRef, contentDisposition: string) => Promise<string>;
  /** The stored object's metadata, or null when there is no readable object. */
  head: (
    ref: ObjectRef
  ) => Promise<{ contentType?: string | undefined; sizeBytes?: number | undefined } | null>;
  /** The object's first `bytes` bytes, or null when there is no readable object. */
  readPrefix: (ref: ObjectRef, bytes: number) => Promise<Uint8Array | null>;
  /** The whole object, or null when there is no readable object. */
  get: (ref: ObjectRef) => Promise<Uint8Array | null>;
  put: (
    ref: ObjectRef,
    body: Uint8Array,
    contentType: string,
    cacheControl?: string
  ) => Promise<void>;
  /** Up to `limit` objects of the private bucket under `prefix`, last modified before `before`. */
  listBefore: (prefix: string, before: Date, limit: number) => Promise<ObjectRef[]>;
  /** Settles in bounded time; rejects when the delete fails. */
  delete: (ref: ObjectRef) => Promise<void>;
}

let storageConfig: StorageConfig | null = null;
let s3Client: ReturnType<typeof createStorageClient> | null = null;

// Resolved on first use, so a process without S3 env still starts and only an
// Attachment call fails with the missing variable.
function config(): StorageConfig {
  storageConfig ??= resolveStorageConfig();
  return storageConfig;
}

let publicConfig: PublicAssetConfig | null | undefined;

/** The public bucket and its CDN URL, or null when Public Assets are off. */
export function publicAssetStorage(): PublicAssetConfig | null {
  if (publicConfig === undefined) {
    publicConfig = resolvePublicAssetConfig();
  }

  return publicConfig;
}

function client(): ReturnType<typeof createStorageClient> {
  s3Client ??= createStorageClient(config());
  return s3Client;
}

export const s3ObjectStore: ObjectStore = {
  place: (key) => ({ bucket: config().bucket, key }),
  async presignUpload({ bucket, key }, { mimeType, sizeBytes }) {
    const { url, expiresIn } = await generatePresignedUploadUrl(
      client(),
      bucket,
      key,
      mimeType,
      sizeBytes,
      config().uploadUrlExpirySeconds
    );
    return { url, expiresIn };
  },
  async presignDownload({ bucket, key }, contentDisposition) {
    const { url } = await generatePresignedDownloadUrl(
      client(),
      bucket,
      key,
      config().downloadUrlExpirySeconds,
      { contentDisposition }
    );
    return url;
  },
  head: ({ bucket, key }) => headObjectMetadata(client(), bucket, key),
  readPrefix: ({ bucket, key }, bytes) => readObjectPrefix(client(), bucket, key, bytes),
  get: ({ bucket, key }) => getObjectBytes(client(), bucket, key),
  put: ({ bucket, key }, body, contentType, cacheControl) =>
    putObject(client(), bucket, key, body, { contentType, cacheControl }),
  async listBefore(prefix, before, limit) {
    const { bucket } = config();
    const keys = await listObjectKeysBefore(client(), bucket, prefix, before, limit);
    return keys.map((key) => ({ bucket, key }));
  },
  delete: ({ bucket, key }) =>
    deleteObject(client(), bucket, key, {
      abortSignal: AbortSignal.timeout(STORAGE_CONFIG.objectDeleteTimeoutMs)
    })
};
