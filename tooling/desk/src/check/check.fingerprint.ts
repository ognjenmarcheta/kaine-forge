import { createHash } from "node:crypto";
import { stripVTControlCharacters } from "node:util";

/**
 * A fingerprint names a failure, not a run. Two rounds that fail the same way
 * must get the same value even though timestamps, durations, temp
 * directories, line numbers and run ids differ. The machine stops early when
 * two checks in a row share one.
 */

const ISO_TIME = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g;
const CLOCK_TIME = /\b\d{1,2}:\d{2}:\d{2}(?:\.\d+)?\b/g;
const DURATION = /\b\d+(?:\.\d+)?\s?(?:ms|µs|us|ns|s|sec|secs|seconds|m|min|mins|h)\b/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const LONG_HEX = /\b[0-9a-f]{12,}\b/gi;
const PID = /\bpid[ =:]+\d+\b/gi;
const ABSOLUTE_PATH = /(?<![\w<>.:/-])\/(?:[\w.@+~-]+\/)+([\w.@+~-]+)/g;
const FILE_POSITION = /(\.[A-Za-z0-9]+):\d+(?::\d+)?/g;
const LINE_WORD = /\b(line|col|column)\s+\d+/gi;

/** Lines that say what went wrong. Used to skip banners and progress noise. */
const FAILURE_LINE =
  /\b(?:error|errors|fail|failed|failing|failure|assert\w*|expected|received|cannot|unexpected|exception|elifecycle|ts\d{4})\b|[✖✗×✘]/i;

const MAX_LINES = 20;
const MAX_LINE_LENGTH = 300;

export interface FingerprintInput {
  readonly argv: readonly string[];
  /** Full stdout and stderr of the failing step. */
  readonly output: string;
  readonly timedOut?: boolean;
  /** Directories to blank out, such as the worktree, the temp dir and the home dir. */
  readonly roots?: readonly string[];
  /** Used instead of the output when the failure is not in the output, such as generated drift. */
  readonly lines?: readonly string[];
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const normalizeLine = (line: string, roots: readonly string[] = []): string => {
  let text = stripVTControlCharacters(line);
  for (const root of [...roots].filter((r) => r.length > 1).sort((a, b) => b.length - a.length)) {
    text = text.replace(new RegExp(`${escapeRegExp(root.replace(/\/+$/, ""))}`, "g"), "<dir>");
  }
  return text
    .replace(ISO_TIME, "<time>")
    .replace(CLOCK_TIME, "<time>")
    .replace(DURATION, "<dur>")
    .replace(UUID, "<id>")
    .replace(LONG_HEX, "<id>")
    .replace(PID, "pid <n>")
    .replace(ABSOLUTE_PATH, "<abs>/$1")
    .replace(FILE_POSITION, "$1:<n>")
    .replace(LINE_WORD, "$1 <n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LINE_LENGTH);
};

/** The first lines that describe the failure, normalized. Falls back to the last lines. */
export const failureLines = (output: string, roots: readonly string[] = []): string[] => {
  const normalized = output
    .split("\n")
    .map((line) => normalizeLine(line, roots))
    .filter((line) => line !== "");
  const matching = [...new Set(normalized.filter((line) => FAILURE_LINE.test(line)))];
  return matching.length > 0 ? matching.slice(0, MAX_LINES) : normalized.slice(-MAX_LINES);
};

export const fingerprintFailure = (input: FingerprintInput): string => {
  const lines =
    input.lines ??
    (input.timedOut === true ? ["<timed out>"] : failureLines(input.output, input.roots));
  return createHash("sha256")
    .update(JSON.stringify({ argv: input.argv, lines }))
    .digest("hex");
};
