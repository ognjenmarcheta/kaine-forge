import {
  DEFAULT_ALLOWED_MIME_TYPES,
  MIME_EXTENSIONS,
  STORAGE_DEFAULTS
} from "./storage.definition";
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

  const extensions = MIME_EXTENSIONS[input.mimeType];

  if (input.originalName !== undefined && extensions) {
    const extension = getFileExtension(input.originalName);

    if (!extensions.includes(extension)) {
      errors.push(`file extension "${extension}" does not match mime type ${input.mimeType}`);
    }
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

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const isText = (bytes: Uint8Array) => !bytes.includes(0);

/**
 * How the first bytes of each allowlisted type look. Office Open XML files are
 * ZIP archives and legacy Office files are OLE compound files, so those formats
 * share a signature; text formats have none and only must not contain NUL.
 */
const FILE_SIGNATURES: Readonly<Record<string, (bytes: Uint8Array) => boolean>> = {
  "image/jpeg": (bytes) => startsWith(bytes, [0xff, 0xd8, 0xff]),
  "image/png": (bytes) => startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/gif": (bytes) => startsWith(bytes, ascii("GIF87a")) || startsWith(bytes, ascii("GIF89a")),
  "image/webp": (bytes) => startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8),
  "application/pdf": (bytes) => startsWith(bytes, ascii("%PDF-")),
  "application/msword": (bytes) => startsWith(bytes, OLE),
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (bytes) =>
    startsWith(bytes, ZIP),
  "application/vnd.ms-excel": (bytes) => startsWith(bytes, OLE),
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": (bytes) =>
    startsWith(bytes, ZIP),
  "text/plain": isText,
  "text/csv": isText
};

/**
 * Whether an object's first bytes fit its claimed MIME type. A type with no
 * known signature fails: add one here when you extend the allowlist.
 */
export function matchesFileSignature(mimeType: string, bytes: Uint8Array): boolean {
  return FILE_SIGNATURES[mimeType]?.(bytes) ?? false;
}

/**
 * The Content-Disposition a download should carry: images render inline,
 * everything else downloads under its sanitized name.
 */
export function contentDisposition(mimeType: string, originalName: string): string {
  return mimeType.startsWith("image/")
    ? "inline"
    : `attachment; filename="${sanitizeFilename(originalName) || "download"}"`;
}
