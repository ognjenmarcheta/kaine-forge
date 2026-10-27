export const HOUSEKEEPING_CONFIG = {
  /** Rows one delete takes; each batch commits on its own, so no run holds row locks for long. */
  batchSize: 1000,
  defaultIntervalMs: 60 * 60 * 1000,
  /** How long past its expiry an Invitation row stays, whatever its status. */
  invitationRetentionMs: 30 * 24 * 60 * 60 * 1000,
  /**
   * Retention windows in days, each overridable by its environment variable
   * (`.env.example`). Purged Attachment rows, failed and expired data exports,
   * Audit Events, and Notifications.
   */
  retentionDays: {
    purgedFiles: 30,
    dataExports: 30,
    auditEvents: 365,
    notifications: 90
  },
  /** A data export pending or running this long lost its job; housekeeping fails it. */
  stalledExportMs: 24 * 60 * 60 * 1000,
  /** pg advisory lock key, distinct from the storage sweep and migration keys. */
  advisoryLockKey: 7_461_203
} as const;
