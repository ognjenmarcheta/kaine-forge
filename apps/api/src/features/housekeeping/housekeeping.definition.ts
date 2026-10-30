export const HOUSEKEEPING_CONFIG = {
  /** Rows one delete takes; each batch commits on its own, so no run holds row locks for long. */
  batchSize: 1000,
  defaultIntervalMs: 60 * 60 * 1000,
  /** How long past its expiry an Invitation row stays, whatever its status. */
  invitationRetentionMs: 30 * 24 * 60 * 60 * 1000,
  /**
   * Retention windows in days, each overridable by its environment variable
   * (`.env.example`). Purged Attachment rows, failed and expired data exports,
   * Audit Events, Notifications, webhook delivery log rows, sync Tombstones,
   * and sync push receipts.
   */
  retentionDays: {
    purgedFiles: 30,
    dataExports: 30,
    auditEvents: 365,
    notifications: 90,
    webhookDeliveries: 30,
    syncTombstones: 90,
    syncReceipts: 30
  },
  /**
   * How long a processed billing webhook event id stays. Providers stop
   * redelivering an event after about three days; the id only dedupes.
   */
  billingEventRetentionMs: 30 * 24 * 60 * 60 * 1000,
  /** A data export pending or running this long lost its job; housekeeping fails it. */
  stalledExportMs: 24 * 60 * 60 * 1000,
  /** pg advisory lock key, distinct from the storage sweep and migration keys. */
  advisoryLockKey: 7_461_203
} as const;
