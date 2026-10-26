import { resolveStorageConfig, type StorageConfig } from "@repo/storage";

import { STORAGE_CONFIG } from "./storage.definition";

export interface AttachmentSweepConfig {
  intervalMs: number;
  /** How old a pending row must be before the sweep counts it as abandoned. */
  pendingTtlMs: number;
}

/**
 * Whether and how often the API sweeps storage objects. On by default when S3
 * is configured; `STORAGE_SWEEP_ENABLED=false` turns it off, and `true` makes
 * missing S3 settings a startup error instead of a silent skip.
 */
export function resolveAttachmentSweepConfig(
  env: Record<string, string | undefined>
): AttachmentSweepConfig | null {
  if (env.STORAGE_SWEEP_ENABLED === "false") {
    return null;
  }

  let storage: StorageConfig;

  try {
    storage = resolveStorageConfig(env);
  } catch (error) {
    if (env.STORAGE_SWEEP_ENABLED === "true") {
      throw error;
    }

    return null;
  }

  const interval = Number(env.STORAGE_SWEEP_INTERVAL_MS);

  return {
    intervalMs: interval > 0 ? interval : STORAGE_CONFIG.sweep.defaultIntervalMs,
    pendingTtlMs: storage.uploadUrlExpirySeconds * 1000 + STORAGE_CONFIG.sweep.pendingGraceMs
  };
}
