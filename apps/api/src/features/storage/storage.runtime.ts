import {
  createStorageClient,
  deleteObject,
  generatePresignedDownloadUrl,
  generatePresignedUploadUrl,
  objectExists,
  resolveStorageConfig
} from "@repo/storage";
import type { StorageConfig } from "@repo/storage";
import { randomUUID } from "node:crypto";

import { createFileRecord, getFileById, listFiles, updateFileStatus } from "./storage.adapter";
import { STORAGE_CONFIG } from "./storage.definition";
import { createStorageLifecycle } from "./storage.lifecycle";
import type { StorageLifecycleAdapter } from "./storage.lifecycle";

export interface StorageRuntimeFile {
  id: string;
  key: string;
  status?: string;
}

export interface StorageRuntimeLogger {
  warn: (input: { err: unknown; key: string }, message: string) => void;
}

export type StorageRuntime<TFile extends StorageRuntimeFile = StorageRuntimeFile> = ReturnType<
  typeof createStorageLifecycle<TFile>
>;

export type StorageRuntimeAdapter<TFile extends StorageRuntimeFile> =
  StorageLifecycleAdapter<TFile> & {
    logger?: StorageRuntimeLogger | undefined;
  };

let _storageConfig: StorageConfig | null = null;
let _s3: ReturnType<typeof createStorageClient> | null = null;

function getStorageConfig(): StorageConfig {
  if (!_storageConfig) {
    _storageConfig = resolveStorageConfig();
  }
  return _storageConfig;
}

function getS3Client(): ReturnType<typeof createStorageClient> {
  if (!_s3) {
    _s3 = createStorageClient(getStorageConfig());
  }
  return _s3;
}

export function createStorageRuntime<TFile extends StorageRuntimeFile>(
  adapter: StorageRuntimeAdapter<TFile>
): StorageRuntime<TFile> {
  const { deleteObject: deleteStorageObject, logger, ...lifecycleAdapter } = adapter;

  return createStorageLifecycle({
    ...lifecycleAdapter,
    deleteObject: async (bucket, key) => {
      try {
        await deleteStorageObject(bucket, key);
      } catch (err) {
        logger?.warn({ err, key }, "failed to delete object from S3");
      }
    }
  });
}

export function createApiStorageRuntime(logger?: StorageRuntimeLogger): StorageRuntime {
  return createStorageRuntime({
    bucket: () => getStorageConfig().bucket,
    createFileId: randomUUID,
    createFileRecord,
    createDownloadUrl: async (bucket, key, expiresIn) =>
      generatePresignedDownloadUrl(getS3Client(), bucket, key, expiresIn),
    createUploadUrl: async (bucket, key, mimeType, expiresIn) =>
      generatePresignedUploadUrl(getS3Client(), bucket, key, mimeType, expiresIn),
    defaultEntityType: STORAGE_CONFIG.defaultEntityType,
    deleteObject: async (bucket, key) => {
      await deleteObject(getS3Client(), bucket, key);
    },
    fileExists: async (bucket, key) => objectExists(getS3Client(), bucket, key),
    getFileById,
    listFiles,
    logger,
    presignedUrlExpirySeconds: () => getStorageConfig().presignedUrlExpirySeconds,
    updateFileStatus
  });
}
