import { HOUSEKEEPING_CONFIG } from "./housekeeping.definition";
import type { RetentionWindows } from "./housekeeping.retention";

export interface HousekeepingConfig {
  intervalMs: number;
  retention: RetentionWindows;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function days(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return (parsed > 0 ? parsed : fallback) * DAY_MS;
}

/**
 * Whether and how often the API purges expired auth rows and applies the
 * retention windows. On by default: it needs only the database (and S3 once
 * an export archive is due). `HOUSEKEEPING_ENABLED=false` turns it off.
 */
export function resolveHousekeepingConfig(
  env: Record<string, string | undefined>
): HousekeepingConfig | null {
  if (env.HOUSEKEEPING_ENABLED === "false") {
    return null;
  }

  const interval = Number(env.HOUSEKEEPING_INTERVAL_MS);
  const defaults = HOUSEKEEPING_CONFIG.retentionDays;

  return {
    intervalMs: interval > 0 ? interval : HOUSEKEEPING_CONFIG.defaultIntervalMs,
    retention: {
      auditEventsMs: days(env.RETENTION_AUDIT_EVENTS_DAYS, defaults.auditEvents),
      dataExportsMs: days(env.RETENTION_DATA_EXPORTS_DAYS, defaults.dataExports),
      notificationsMs: days(env.RETENTION_NOTIFICATIONS_DAYS, defaults.notifications),
      purgedFilesMs: days(env.RETENTION_PURGED_FILES_DAYS, defaults.purgedFiles),
      webhookDeliveriesMs: days(env.RETENTION_WEBHOOK_DELIVERIES_DAYS, defaults.webhookDeliveries)
    }
  };
}
