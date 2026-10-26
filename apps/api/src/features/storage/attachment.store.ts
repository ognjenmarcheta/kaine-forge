import {
  createStorageClient,
  deleteObject,
  generatePresignedDownloadUrl,
  generatePresignedUploadUrl,
  headObjectMetadata,
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
  presignUpload: (ref: ObjectRef, mimeType: string) => Promise<{ url: string; expiresIn: number }>;
  presignDownload: (ref: ObjectRef) => Promise<string>;
  /** The stored object's metadata, or null when there is no readable object. */
  head: (
    ref: ObjectRef
  ) => Promise<{ contentType?: string | undefined; sizeBytes?: number | undefined } | null>;
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
  async presignUpload({ bucket, key }, mimeType) {
    const { url, expiresIn } = await generatePresignedUploadUrl(
      client(),
      bucket,
      key,
      mimeType,
      config().presignedUrlExpirySeconds
    );
    return { url, expiresIn };
  },
  async presignDownload({ bucket, key }) {
    const { url } = await generatePresignedDownloadUrl(
      client(),
      bucket,
      key,
      config().presignedUrlExpirySeconds
    );
    return url;
  },
  head: ({ bucket, key }) => headObjectMetadata(client(), bucket, key),
  delete: ({ bucket, key }) =>
    deleteObject(client(), bucket, key, {
      abortSignal: AbortSignal.timeout(STORAGE_CONFIG.objectDeleteTimeoutMs)
    })
};
