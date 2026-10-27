export const DATA_EXPORT_CONFIG = {
  /** Exports listed in a section; older ones expire and drop off. */
  pageSize: 10,
  /** How often the list refreshes while an export is pending or running. */
  pollIntervalMs: 5000
} as const;
