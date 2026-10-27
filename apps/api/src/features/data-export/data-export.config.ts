import { DATA_EXPORT_CONFIG } from "./data-export.definition";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long a ready export archive stays downloadable: `DATA_EXPORT_ARCHIVE_DAYS`,
 * 7 days by default. Retention then deletes the archive and marks the export expired.
 */
export function resolveDataExportArchiveTtlMs(env: Record<string, string | undefined>): number {
  const days = Number(env.DATA_EXPORT_ARCHIVE_DAYS);
  return days > 0 ? days * DAY_MS : DATA_EXPORT_CONFIG.defaultArchiveTtlMs;
}
