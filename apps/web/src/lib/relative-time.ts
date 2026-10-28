const RELATIVE_UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60],
  ["month", 30 * 24 * 60 * 60],
  ["week", 7 * 24 * 60 * 60],
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60]
];

/** "5 minutes ago", "yesterday", … in the active language. */
export function formatRelativeTime(value: string, language: string, now = Date.now()): string {
  const seconds = Math.round((new Date(value).getTime() - now) / 1000);
  const format = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(0, "minute");
}
