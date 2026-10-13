import { stripVTControlCharacters } from "node:util";

/**
 * Remove secrets from text before it reaches the log file or the terminal.
 * This is a copy of `redact()` in `.ai/factory-progress.ts` (a workspace cannot
 * import `.ai/*`). It is a safety net for known token shapes, not a proof that
 * a line has no secret.
 */
export const redact = (text: string): string =>
  stripVTControlCharacters(text)
    .replace(/(Bearer\s+)[^\s"']+/gi, "$1[redacted]")
    .replace(
      /((?:token|password|secret|api[_-]?key|authorization|cookie)[\w-]*["']?\s*[:=]\s*["']?)[^\s,"';}]+/gi,
      "$1[redacted]"
    )
    .replace(
      /\b(?:sk-[\w-]+|gh[pousr]_[\w]+|github_pat_[\w]+|eyJ[\w-]+\.[\w-]+\.[\w-]+)\b/g,
      "[redacted]"
    )
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g, "$1[redacted]@")
    .replace(/(https?:\/\/[^\s?#]+)[?#][^\s]+/g, "$1[redacted]");

/** Redact, then cut to `limit` characters. A cut is marked, so a reader knows text is missing. */
export const redactAndBound = (text: string, limit: number): string => {
  const clean = redact(text);
  return clean.length > limit ? `${clean.slice(0, limit)}...[truncated]` : clean;
};
