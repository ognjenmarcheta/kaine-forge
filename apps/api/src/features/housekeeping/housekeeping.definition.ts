export const HOUSEKEEPING_CONFIG = {
  /** Rows one delete takes; each batch commits on its own, so no run holds row locks for long. */
  batchSize: 1000,
  defaultIntervalMs: 60 * 60 * 1000,
  /** How long past its expiry an Invitation row stays, whatever its status. */
  invitationRetentionMs: 30 * 24 * 60 * 60 * 1000,
  /** pg advisory lock key, distinct from the storage sweep and migration keys. */
  advisoryLockKey: 7_461_203
} as const;
