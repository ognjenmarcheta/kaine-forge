import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import { buildStorageKey, STORAGE_DEFAULTS, validateFile } from "@repo/storage";

import { STORAGE_CONFIG } from "./storage.definition";
import type { RequestUploadInput } from "./storage.type";

interface StoredFile {
  id: string;
  key: string;
  status?: string;
}

interface PresignedUpload {
  expiresIn: number;
  key: string;
  url: string;
}

export interface StorageLifecycleAdapter<TFile extends StoredFile> {
  bucket: string;
  createFileId: () => string;
  createFileRecord: (
    scope: AuthenticatedOrganizationScope,
    input: {
      id: string;
      key: string;
      bucket: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      entityType: string | null;
      entityId: string | null;
    }
  ) => Promise<TFile>;
  createUploadUrl: (
    bucket: string,
    key: string,
    mimeType: string,
    expiresIn: number
  ) => Promise<PresignedUpload>;
  defaultEntityType: string;
  deleteObject: (bucket: string, key: string) => Promise<void>;
  fileExists: (bucket: string, key: string) => Promise<boolean>;
  getFileById: (scope: AuthenticatedOrganizationScope, fileId: string) => Promise<TFile | null>;
  presignedUrlExpirySeconds: number;
  updateFileStatus: (
    scope: AuthenticatedOrganizationScope,
    fileId: string,
    status: "pending" | "uploaded" | "deleted"
  ) => Promise<TFile>;
}

export function createStorageLifecycle<TFile extends StoredFile>(
  adapter: StorageLifecycleAdapter<TFile>
) {
  return {
    async requestUploadUrl(scope: AuthenticatedOrganizationScope, input: RequestUploadInput) {
      const validation = validateFile({ mimeType: input.mimeType, sizeBytes: input.sizeBytes }, {});

      if (!validation.valid) {
        throw new Error(`file validation failed: ${validation.errors.join(", ")}`);
      }

      const fileId = adapter.createFileId();
      const entityType = input.entityType ?? adapter.defaultEntityType;
      const key = buildStorageKey({
        organizationId: scope.organizationId,
        entityType,
        fileId,
        originalName: input.originalName
      });

      const file = await adapter.createFileRecord(scope, {
        id: fileId,
        key,
        bucket: adapter.bucket,
        originalName: input.originalName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null
      });
      const presigned = await adapter.createUploadUrl(
        adapter.bucket,
        key,
        input.mimeType,
        adapter.presignedUrlExpirySeconds
      );

      return {
        fileId: file.id,
        uploadUrl: presigned.url,
        key: presigned.key,
        expiresIn: presigned.expiresIn
      };
    },
    async confirmUpload(scope: AuthenticatedOrganizationScope, fileId: string) {
      const file = await adapter.getFileById(scope, fileId);

      if (!file) {
        throw new Error("file not found");
      }

      if (file.status !== "pending") {
        throw new Error(`file status is ${file.status ?? "unknown"}, expected pending`);
      }

      const exists = await adapter.fileExists(adapter.bucket, file.key);

      if (!exists) {
        throw new Error("file has not been uploaded to storage");
      }

      return adapter.updateFileStatus(scope, file.id, "uploaded");
    },
    async deleteFile(scope: AuthenticatedOrganizationScope, fileId: string) {
      const file = await adapter.getFileById(scope, fileId);

      if (!file) {
        throw new Error("file not found");
      }

      await adapter.deleteObject(adapter.bucket, file.key);
      await adapter.updateFileStatus(scope, file.id, "deleted");
      return true;
    }
  };
}

export function createStorageLifecycleAdapter(
  input: Omit<
    StorageLifecycleAdapter<StoredFile>,
    "defaultEntityType" | "presignedUrlExpirySeconds"
  > & {
    defaultEntityType?: string;
    presignedUrlExpirySeconds?: number;
  }
): StorageLifecycleAdapter<StoredFile> {
  return {
    ...input,
    defaultEntityType: input.defaultEntityType ?? STORAGE_CONFIG.defaultEntityType,
    presignedUrlExpirySeconds:
      input.presignedUrlExpirySeconds ?? STORAGE_DEFAULTS.presignedUrlExpirySeconds
  };
}
