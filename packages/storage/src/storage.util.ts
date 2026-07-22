import { DEFAULT_ALLOWED_MIME_TYPES, STORAGE_DEFAULTS } from "./storage.definition";
import type {
  FileValidationInput,
  FileValidationOptions,
  FileValidationResult,
  StorageKeyParts
} from "./storage.type";

export function buildStorageKey(parts: StorageKeyParts): string {
  const sanitized = sanitizeFilename(parts.originalName);
  return `${parts.organizationId}/${parts.entityType}/${parts.fileId}/${sanitized}`;
}

export function parseStorageKey(key: string): StorageKeyParts | null {
  const segments = key.split("/");

  if (segments.length < 4) {
    return null;
  }

  const organizationId = segments[0];
  const entityType = segments[1];
  const fileId = segments[2];
  const originalName = segments.slice(3).join("/");

  if (!organizationId || !entityType || !fileId || !originalName) {
    return null;
  }

  return { organizationId, entityType, fileId, originalName };
}

export function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[._-]+/, "")
    .slice(0, 200);
}

export function validateFile(
  input: FileValidationInput,
  options: Partial<FileValidationOptions> = {}
): FileValidationResult {
  const maxSize = options.maxSizeBytes ?? STORAGE_DEFAULTS.maxFileSizeBytes;
  // Empty array opts out of MIME checks for advanced callers; omit/undefined uses defaults.
  const allowedTypes =
    options.allowedMimeTypes === undefined ? DEFAULT_ALLOWED_MIME_TYPES : options.allowedMimeTypes;
  const errors: string[] = [];

  if (input.sizeBytes > maxSize) {
    errors.push(`file size ${input.sizeBytes} exceeds maximum ${maxSize} bytes`);
  }

  if (allowedTypes.length > 0 && !allowedTypes.includes(input.mimeType)) {
    errors.push(`mime type ${input.mimeType} is not allowed`);
  }

  return { valid: errors.length === 0, errors };
}

export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");

  if (lastDot === -1 || lastDot === filename.length - 1) {
    return "";
  }

  return filename.slice(lastDot + 1).toLowerCase();
}
