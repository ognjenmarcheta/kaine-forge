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
import type { FilesFilterInput, RequestUploadInput } from "./storage.type";
import type { ApiContext } from "../../context";

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

type ResolverContext = ApiContext;

type RequestUploadArgs = { input: RequestUploadInput };
type FileByIdArgs = { id: string };
type FilesArgs = { filter?: FilesFilterInput };
type ConfirmUploadArgs = { fileId: string };
type DeleteFileArgs = { fileId: string };

function createStorageLifecycleForContext(ctx: ResolverContext) {
  const config = getStorageConfig();
  const s3 = getS3Client();

  return createStorageLifecycle({
    bucket: config.bucket,
    createFileId: randomUUID,
    createFileRecord,
    createUploadUrl: async (bucket, key, mimeType, expiresIn) =>
      generatePresignedUploadUrl(s3, bucket, key, mimeType, expiresIn),
    defaultEntityType: STORAGE_CONFIG.defaultEntityType,
    deleteObject: async (bucket, key) => {
      try {
        await deleteObject(s3, bucket, key);
      } catch (err) {
        ctx.logger.warn({ err, key }, "failed to delete object from S3");
      }
    },
    fileExists: async (bucket, key) => objectExists(s3, bucket, key),
    getFileById,
    presignedUrlExpirySeconds: config.presignedUrlExpirySeconds,
    updateFileStatus
  });
}

export const storageResolvers = {
  Query: {
    async file(_parent: unknown, args: FileByIdArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return getFileById(scope, args.id);
    },
    async files(_parent: unknown, args: FilesArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return listFiles(scope, args.filter ?? {});
    }
  },
  Mutation: {
    async requestUploadUrl(_parent: unknown, args: RequestUploadArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return createStorageLifecycleForContext(ctx).requestUploadUrl(scope, args.input);
    },
    async confirmUpload(_parent: unknown, args: ConfirmUploadArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return createStorageLifecycleForContext(ctx).confirmUpload(scope, args.fileId);
    },
    async deleteFile(_parent: unknown, args: DeleteFileArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return createStorageLifecycleForContext(ctx).deleteFile(scope, args.fileId);
    }
  },
  FileInfo: {
    async downloadUrl(parent: { status: string; key: string }) {
      if (parent.status !== "uploaded") {
        return null;
      }

      const result = await generatePresignedDownloadUrl(
        getS3Client(),
        getStorageConfig().bucket,
        parent.key,
        getStorageConfig().presignedUrlExpirySeconds
      );

      return result.url;
    }
  }
};
