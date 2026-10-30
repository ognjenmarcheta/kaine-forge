export const BILLING_CONFIG = {
  webhookPathPrefix: "/api/billing/webhooks/",
  /** Provider events are a few kilobytes; anything near this is not one. */
  webhookMaxBodyBytes: 1024 * 1024,
  /** Where checkout and the portal send the owner back, under WEB_APP_URL. */
  returnPath: "/organization/billing",
  /** How often a replica checks per-seat quantities against member counts. */
  seatReconcileIntervalMs: 60 * 60 * 1000,
  /** pg advisory lock key, distinct from the storage sweep, housekeeping, and migration keys. */
  seatReconcileLockKey: 7_461_204
} as const;
