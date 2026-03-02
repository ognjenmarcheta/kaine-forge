import { STORAGE_DEFAULTS, STORAGE_ENV_KEYS } from "./storage.definition";
import type { StorageConfig } from "./storage.type";

export function resolveStorageConfig(env?: Record<string, string | undefined>): StorageConfig {
  const source = env ?? process.env;

  const endpoint = source[STORAGE_ENV_KEYS.endpoint];
  const accessKey = source[STORAGE_ENV_KEYS.accessKey];
  const secretKey = source[STORAGE_ENV_KEYS.secretKey];
  const bucket = source[STORAGE_ENV_KEYS.bucket];

  if (!endpoint) {
    throw new Error(`missing required env var: ${STORAGE_ENV_KEYS.endpoint}`);
  }

  if (!accessKey) {
    throw new Error(`missing required env var: ${STORAGE_ENV_KEYS.accessKey}`);
  }

  if (!secretKey) {
    throw new Error(`missing required env var: ${STORAGE_ENV_KEYS.secretKey}`);
  }

  if (!bucket) {
    throw new Error(`missing required env var: ${STORAGE_ENV_KEYS.bucket}`);
  }

  const region = source[STORAGE_ENV_KEYS.region] ?? STORAGE_DEFAULTS.region;

  const forcePathStyleRaw = source[STORAGE_ENV_KEYS.forcePathStyle];
  const forcePathStyle =
    forcePathStyleRaw !== undefined
      ? forcePathStyleRaw === "true"
      : STORAGE_DEFAULTS.forcePathStyle;

  const expiryRaw = source[STORAGE_ENV_KEYS.presignedUrlExpiry];
  const presignedUrlExpirySeconds = expiryRaw
    ? parseInt(expiryRaw, 10)
    : STORAGE_DEFAULTS.presignedUrlExpirySeconds;

  return {
    endpoint,
    region,
    accessKey,
    secretKey,
    bucket,
    forcePathStyle,
    presignedUrlExpirySeconds
  };
}
