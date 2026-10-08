/** Text helpers for values the engine sends. They return plain strings; React escapes them. */

/** Only a web link opens from engine data: a `javascript:` or `data:` address never becomes an `href`. */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

export const firstLine = (text: string): string => (text.split("\n")[0] ?? "").trim();

const UNITS: readonly { readonly unit: Intl.RelativeTimeFormatUnit; readonly ms: number }[] = [
  { unit: "day", ms: 86_400_000 },
  { unit: "hour", ms: 3_600_000 },
  { unit: "minute", ms: 60_000 },
  { unit: "second", ms: 1000 }
];

/** "5 minutes ago", in the page language. `now` is epoch milliseconds. */
export function relativeTime(iso: string, now: number, language: string): string {
  const then = Date.parse(iso);
  const format = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
  if (Number.isNaN(then)) return iso;
  const diff = then - now;
  const chosen = UNITS.find(({ ms }) => Math.abs(diff) >= ms) ?? UNITS[UNITS.length - 1];
  if (chosen === undefined) return iso;
  return format.format(Math.trunc(diff / chosen.ms), chosen.unit);
}

const unitText = (value: number, unit: string, language: string): string =>
  new Intl.NumberFormat(language, { style: "unit", unit, unitDisplay: "narrow" }).format(value);

/** "1h 5m 3s", with the narrow unit symbols of the page language. */
export function formatDuration(ms: number, language: string): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const parts = [
    { unit: "hour", value: Math.floor(total / 3600) },
    { unit: "minute", value: Math.floor((total % 3600) / 60) },
    { unit: "second", value: total % 60 }
  ].filter(({ value }, index, all) => value > 0 || (index === all.length - 1 && total === 0));
  return parts.map(({ unit, value }) => unitText(value, unit, language)).join(" ");
}

/**
 * How long something has lasted, coarse enough for a card: "45s", "12m", "3h 5m", "2d 4h".
 * Two units at most, so the text keeps its width while it ticks.
 */
export function formatElapsed(ms: number, language: string): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return unitText(seconds, "second", language);
  const minutes = Math.floor(seconds / 60);
  const parts: readonly (readonly [number, string])[] =
    minutes >= 1440
      ? [
          [Math.floor(minutes / 1440), "day"],
          [Math.floor((minutes % 1440) / 60), "hour"]
        ]
      : minutes >= 60
        ? [
            [Math.floor(minutes / 60), "hour"],
            [minutes % 60, "minute"]
          ]
        : [[minutes, "minute"]];
  return parts
    .filter(([value], index) => index === 0 || value > 0)
    .map(([value, unit]) => unitText(value, unit, language))
    .join(" ");
}

/** The local time of day of an engine timestamp, in the page language ("14:05:09"). */
export function formatClock(iso: string, language: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(language, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}
