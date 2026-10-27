import { HOUSEKEEPING_CONFIG } from "./housekeeping.definition";

export interface HousekeepingConfig {
  intervalMs: number;
}

/**
 * Whether and how often the API purges expired auth rows. On by default: it
 * needs only the database. `HOUSEKEEPING_ENABLED=false` turns it off.
 */
export function resolveHousekeepingConfig(
  env: Record<string, string | undefined>
): HousekeepingConfig | null {
  if (env.HOUSEKEEPING_ENABLED === "false") {
    return null;
  }

  const interval = Number(env.HOUSEKEEPING_INTERVAL_MS);

  return { intervalMs: interval > 0 ? interval : HOUSEKEEPING_CONFIG.defaultIntervalMs };
}
