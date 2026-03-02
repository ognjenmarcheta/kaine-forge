import type { FILE_STATUS } from "./storage.definition";

export type FileStatus = (typeof FILE_STATUS)[keyof typeof FILE_STATUS];

export interface StorageConfig {
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  forcePathStyle: boolean;
  presignedUrlExpirySeconds: number;
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
}

export interface FileValidationResult {
  valid: boolean;
  errors: string[];
}
