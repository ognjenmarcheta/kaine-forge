import type { FILE_STATUS } from "./storage.definition";

export type FileStatus = (typeof FILE_STATUS)[keyof typeof FILE_STATUS];

/**
 * What an Attachment is attached to. Mirrors the GraphQL `AttachmentEntityType`
 * enum: web and mobile pass it into their generated operation types, so a drift
 * fails their typecheck.
 */
export type AttachmentEntityType = "general" | "todo";

export interface StorageConfig {
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  forcePathStyle: boolean;
  uploadUrlExpirySeconds: number;
  downloadUrlExpirySeconds: number;
}

export interface StorageKeyParts {
  organizationId: string;
  entityType: string;
  fileId: string;
  originalName: string;
}

export interface PresignedUploadResult {
  url: string;
  key: string;
  expiresIn: number;
}

export interface PresignedDownloadResult {
  url: string;
  expiresIn: number;
}

export interface FileValidationOptions {
  maxSizeBytes: number;
  allowedMimeTypes: readonly string[];
}

export interface FileValidationInput {
  mimeType: string;
  sizeBytes: number;
  /** When present, its extension must be one `MIME_EXTENSIONS` lists for `mimeType`. */
  originalName?: string | undefined;
}

export interface FileValidationResult {
  valid: boolean;
  errors: string[];
}
