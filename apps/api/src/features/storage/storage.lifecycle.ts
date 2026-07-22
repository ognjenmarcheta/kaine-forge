import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import { buildStorageKey, STORAGE_DEFAULTS, validateFile } from "@repo/storage";

import { STORAGE_CONFIG } from "./storage.definition";
import type { FilesFilterInput, RequestUploadInput } from "./storage.type";

interface StoredFile {
  id: string;
  key: string;
  mimeType?: string;
  sizeBytes?: number;
  status?: string;
}

interface ObjectMetadata {
  contentType?: string | undefined;
  sizeBytes?: number | undefined;
}

interface PresignedUpload {
  expiresIn: number;
  key: string;
  url: string;
}

interface PresignedDownload {
  url: string;
}

export interface StorageLifecycleAdapter<TFile extends StoredFile> {
  bucket: string | (() => string);
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
  createDownloadUrl: (bucket: string, key: string, expiresIn: number) => Promise<PresignedDownload>;
  defaultEntityType: string;
  deleteObject: (bucket: string, key: string) => Promise<void>;
  fileExists: (bucket: string, key: string) => Promise<boolean>;
  /** Optional HEAD of the object to re-check size/content-type on confirm. */
  getObjectMetadata?: (bucket: string, key: string) => Promise<ObjectMetadata | null>;
  getFileById: (scope: AuthenticatedOrganizationScope, fileId: string) => Promise<TFile | null>;
  listFiles: (scope: AuthenticatedOrganizationScope, filter: FilesFilterInput) => Promise<TFile[]>;
  presignedUrlExpirySeconds: number | (() => number);
  updateFileStatus: (
    scope: AuthenticatedOrganizationScope,
    fileId: string,
    status: "pending" | "uploaded" | "deleted"
  ) => Promise<TFile>;
}

export function createStorageLifecycle<TFile extends StoredFile>(
  adapter: StorageLifecycleAdapter<TFile>
) {
  const getBucket = () =>
    typeof adapter.bucket === "function" ? adapter.bucket() : adapter.bucket;
  const getPresignedUrlExpirySeconds = () =>
    typeof adapter.presignedUrlExpirySeconds === "function"
      ? adapter.presignedUrlExpirySeconds()
      : adapter.presignedUrlExpirySeconds;

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
        bucket: getBucket(),
        originalName: input.originalName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null
      });
      const presigned = await adapter.createUploadUrl(
        getBucket(),
        key,
        input.mimeType,
        getPresignedUrlExpirySeconds()
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

      // Re-apply default policy to claimed metadata (size + MIME allowlist).
      if (typeof file.sizeBytes === "number" && typeof file.mimeType === "string") {
        const validation = validateFile({
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes
        });

        if (!validation.valid) {
          throw new Error(`file validation failed: ${validation.errors.join(", ")}`);
        }
      }

      const exists = await adapter.fileExists(getBucket(), file.key);

      if (!exists) {
        throw new Error("file has not been uploaded to storage");
      }

      if (adapter.getObjectMetadata) {
        const metadata = await adapter.getObjectMetadata(getBucket(), file.key);

        if (!metadata) {
          throw new Error("file has not been uploaded to storage");
        }

        if (
          typeof metadata.sizeBytes === "number" &&
          metadata.sizeBytes > STORAGE_DEFAULTS.maxFileSizeBytes
        ) {
          throw new Error(
            `uploaded object size ${metadata.sizeBytes} exceeds maximum ${STORAGE_DEFAULTS.maxFileSizeBytes} bytes`
          );
        }

        if (
          typeof metadata.sizeBytes === "number" &&
          typeof file.sizeBytes === "number" &&
          metadata.sizeBytes > file.sizeBytes
        ) {
          throw new Error(
            `uploaded object size ${metadata.sizeBytes} exceeds claimed size ${file.sizeBytes} bytes`
          );
        }

        if (
          metadata.contentType &&
          file.mimeType &&
          metadata.contentType.split(";")[0]?.trim().toLowerCase() !== file.mimeType.toLowerCase()
        ) {
          throw new Error(
            `uploaded content type ${metadata.contentType} does not match claimed type ${file.mimeType}`
          );
        }
      }

      return adapter.updateFileStatus(scope, file.id, "uploaded");
    },
    async deleteFile(scope: AuthenticatedOrganizationScope, fileId: string) {
      const file = await adapter.getFileById(scope, fileId);

      if (!file) {
        throw new Error("file not found");
      }

      await adapter.deleteObject(getBucket(), file.key);
      await adapter.updateFileStatus(scope, file.id, "deleted");
      return true;
    },
    getFile(scope: AuthenticatedOrganizationScope, fileId: string) {
      return adapter.getFileById(scope, fileId);
    },
    listFiles(scope: AuthenticatedOrganizationScope, filter: FilesFilterInput) {
      return adapter.listFiles(scope, filter);
    },
    async getDownloadUrl(file: TFile) {
      if (file.status !== "uploaded") {
        return null;
      }

      const result = await adapter.createDownloadUrl(
        getBucket(),
        file.key,
        getPresignedUrlExpirySeconds()
      );

      return result.url;
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
