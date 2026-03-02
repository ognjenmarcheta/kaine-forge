import {
  buildStorageKey,
  createStorageClient,
  deleteObject,
  generatePresignedDownloadUrl,
  generatePresignedUploadUrl,
  objectExists,
  resolveStorageConfig,
  validateFile
} from "@repo/storage";
import { randomUUID } from "node:crypto";

import { createFileRecord, getFileById, listFiles, updateFileStatus } from "./storage.adapter";
import { STORAGE_CONFIG } from "./storage.definition";
import type { FilesFilterInput, RequestUploadInput } from "./storage.type";
import type { ApiContext } from "../../context";
import { requireActiveOrganizationId, requireUser } from "../../middleware/auth.middleware";

const storageConfig = resolveStorageConfig();
const s3 = createStorageClient(storageConfig);

type ResolverContext = ApiContext;

type RequestUploadArgs = { input: RequestUploadInput };
type FileByIdArgs = { id: string };
type FilesArgs = { filter?: FilesFilterInput };
type ConfirmUploadArgs = { fileId: string };
type DeleteFileArgs = { fileId: string };

export const storageResolvers = {
  Query: {
    async file(_parent: unknown, args: FileByIdArgs, ctx: ResolverContext) {
      const organizationId = requireActiveOrganizationId(ctx);
      requireUser(ctx);
      return getFileById(organizationId, args.id);
    },
    async files(_parent: unknown, args: FilesArgs, ctx: ResolverContext) {
      const organizationId = requireActiveOrganizationId(ctx);
      requireUser(ctx);
      return listFiles(organizationId, args.filter ?? {});
    }
  },
  Mutation: {
    async requestUploadUrl(_parent: unknown, args: RequestUploadArgs, ctx: ResolverContext) {
      const user = requireUser(ctx);
      const organizationId = requireActiveOrganizationId(ctx);
      const input = args.input;

      const validation = validateFile({ mimeType: input.mimeType, sizeBytes: input.sizeBytes }, {});

      if (!validation.valid) {
        throw new Error(`file validation failed: ${validation.errors.join(", ")}`);
      }

      const fileId = randomUUID();
      const entityType = input.entityType ?? STORAGE_CONFIG.defaultEntityType;

      const key = buildStorageKey({
        organizationId,
        entityType,
        fileId,
        originalName: input.originalName
      });

      const file = await createFileRecord({
        id: fileId,
        key,
        bucket: storageConfig.bucket,
        originalName: input.originalName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        uploadedBy: user.id,
        organizationId,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null
      });

      const presigned = await generatePresignedUploadUrl(
        s3,
        storageConfig.bucket,
        key,
        input.mimeType,
        storageConfig.presignedUrlExpirySeconds
      );

      return {
        fileId: file.id,
        uploadUrl: presigned.url,
        key: presigned.key,
        expiresIn: presigned.expiresIn
      };
    },
    async confirmUpload(_parent: unknown, args: ConfirmUploadArgs, ctx: ResolverContext) {
      const organizationId = requireActiveOrganizationId(ctx);
      requireUser(ctx);

      const file = await getFileById(organizationId, args.fileId);

      if (!file) {
        throw new Error("file not found");
      }

      if (file.status !== "pending") {
        throw new Error(`file status is ${file.status}, expected pending`);
      }

      const exists = await objectExists(s3, storageConfig.bucket, file.key);

      if (!exists) {
        throw new Error("file has not been uploaded to storage");
      }

      return updateFileStatus(organizationId, file.id, "uploaded");
    },
    async deleteFile(_parent: unknown, args: DeleteFileArgs, ctx: ResolverContext) {
      const organizationId = requireActiveOrganizationId(ctx);
      requireUser(ctx);

      const file = await getFileById(organizationId, args.fileId);

      if (!file) {
        throw new Error("file not found");
      }

      try {
        await deleteObject(s3, storageConfig.bucket, file.key);
      } catch (err) {
        ctx.logger.warn({ err, fileId: file.id, key: file.key }, "failed to delete object from S3");
      }

      await updateFileStatus(organizationId, file.id, "deleted");
      return true;
    }
  },
  FileInfo: {
    async downloadUrl(parent: { status: string; key: string }) {
      if (parent.status !== "uploaded") {
        return null;
      }

      const result = await generatePresignedDownloadUrl(
        s3,
        storageConfig.bucket,
        parent.key,
        storageConfig.presignedUrlExpirySeconds
      );

      return result.url;
    }
  }
};
