import {
  createStorageClient,
  deleteObject,
  generatePresignedDownloadUrl,
  generatePresignedUploadUrl,
  headObjectMetadata,
  readObjectPrefix,
  resolveStorageConfig,
  type StorageConfig
} from "@repo/storage";

import { STORAGE_CONFIG } from "./storage.definition";

/** Where one stored object lives. Every Attachment row records its own. */
export interface ObjectRef {
  bucket: string;
  key: string;
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
  delete: ({ bucket, key }) =>
    deleteObject(client(), bucket, key, {
      abortSignal: AbortSignal.timeout(STORAGE_CONFIG.objectDeleteTimeoutMs)
    })
};
