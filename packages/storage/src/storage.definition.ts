export const STORAGE_ENV_KEYS = {
  endpoint: "S3_ENDPOINT",
  region: "S3_REGION",
  accessKey: "S3_ACCESS_KEY",
  secretKey: "S3_SECRET_KEY",
  bucket: "S3_BUCKET",
  forcePathStyle: "S3_FORCE_PATH_STYLE",
  /** Fallback for both expiries below when they are unset. */
  presignedUrlExpiry: "S3_PRESIGNED_URL_EXPIRY",
  uploadUrlExpiry: "S3_UPLOAD_URL_EXPIRY",
  downloadUrlExpiry: "S3_DOWNLOAD_URL_EXPIRY"
} as const;

export const STORAGE_DEFAULTS = {
  region: "us-east-1",
  uploadUrlExpirySeconds: 600,
  downloadUrlExpirySeconds: 300,
  /** Bytes read from the start of an uploaded object to check its signature. */
  signatureSampleBytes: 512,
  maxFileSizeBytes: 10 * 1024 * 1024,
  forcePathStyle: true
} as const;

export const FILE_STATUS = {
  pending: "pending",
  uploaded: "uploaded",
  deleted: "deleted"
} as const;

export const COMMON_MIME_TYPES = {
  // SVG omitted by default: can execute scripts when served as image/document.
  images: ["image/jpeg", "image/png", "image/gif", "image/webp"],
  documents: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain"
  ],
  spreadsheets: [
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv"
  ]
} as const;

/** Default allowlist used when callers omit `allowedMimeTypes`. */
export const DEFAULT_ALLOWED_MIME_TYPES: readonly string[] = [
  ...COMMON_MIME_TYPES.images,
  ...COMMON_MIME_TYPES.documents,
  ...COMMON_MIME_TYPES.spreadsheets
];

/**
 * File name extensions each MIME type accepts. A file whose extension is not
 * listed for its claimed type fails `validateFile` (for example `x.pdf.exe`).
 */
export const MIME_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/gif": ["gif"],
  "image/webp": ["webp"],
  "application/pdf": ["pdf"],
  "application/msword": ["doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "text/plain": ["txt"],
  "application/vnd.ms-excel": ["xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "text/csv": ["csv"]
};
