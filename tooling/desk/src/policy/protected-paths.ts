import path from "node:path";

/**
 * Paths an agent run may never change, whatever the plan says. They hold
 * policy (hooks, permissions), agent installs, secrets and Git itself. The
 * rules follow the factory's `safeFile` and the Agent Desk plan.
 *
 * Generated GraphQL outputs are not listed here. An agent may change them
 * only by running `pnpm generate`; the engine proves that with its drift check
 * (`isGeneratedOutput` lets `scopeViolations` accept them without a plan entry).
 */

/** Directory or file names that are protected wherever they appear in a path. */
const PROTECTED_SEGMENT =
  /^(?:\.git|\.ai\.local|\.claude|\.agents|\.codex|\.cursor|\.grok|\.opencode|\.husky|node_modules|\.env(?:\.(?!example$).*)?)$/i;

/** Protected prefixes and files, relative to the repository root. */
const PROTECTED_PREFIX: readonly RegExp[] = [
  /^\.ai\/hooks(?:\/|$)/i,
  /^\.ai\/permissions(?:[./]|$)/i,
  /^\.serena\/memories(?:\/|$)/i,
  /^\.github\/workflows(?:\/|$)/i,
  /^(?:\.mcp\.json|\.gitattributes|\.gitmodules|opencode\.json)$/i
];

const GENERATED_OUTPUT: readonly RegExp[] = [
  /^apps\/[^/]+\/src\/graphql\/generated\//,
  /^apps\/api\/schema\.graphql$/
];

const hasControlCharacter = (value: string): boolean =>
  [...value].some((character) => character.charCodeAt(0) < 32);

/**
 * A repo-relative POSIX path, or `null` when the input is unsafe: empty,
 * absolute, drive-lettered, containing a backslash or control character, or
 * climbing out with `..`. Redundant `./` and `//` are rejected, not repaired,
 * so a changed path always matches the plan's spelling.
 */
export const normalizeRepoPath = (input: string): string | null => {
  if (input === "" || input.includes("\\") || input.includes(":") || hasControlCharacter(input)) {
    return null;
  }
  if (path.posix.isAbsolute(input) || path.posix.normalize(input) !== input) return null;
  if (input.split("/").some((part) => part === ".." || part === "." || part === "")) return null;
  return input;
};

export const isGeneratedOutput = (repoPath: string): boolean =>
  GENERATED_OUTPUT.some((pattern) => pattern.test(repoPath));

/** Why a path is off limits, or `null` when an agent may change it. */
export const protectedPathReason = (repoPath: string): string | null => {
  const normalized = normalizeRepoPath(repoPath);
  if (normalized === null) return `unsafe path '${repoPath}'`;
  if (normalized.split("/").some((segment) => PROTECTED_SEGMENT.test(segment))) {
    return `'${normalized}' is inside a protected directory`;
  }
  if (PROTECTED_PREFIX.some((pattern) => pattern.test(normalized))) {
    return `'${normalized}' is protected policy or tooling`;
  }
  return null;
};

/** True for a protected or unsafe path. */
export const isProtectedPath = (repoPath: string): boolean =>
  protectedPathReason(repoPath) !== null;

const inScope = (changed: string, allowed: readonly string[]): boolean =>
  allowed.some((entry) => (entry.endsWith("/") ? changed.startsWith(entry) : changed === entry));

/**
 * The changed paths that fall outside `allowed`. An allowed entry is a file, or
 * a directory when it ends with `/`. Unsafe paths always count as violations.
 * Generated GraphQL outputs are in scope without an entry (see the file header).
 */
export const scopeViolations = (changed: readonly string[], allowed: readonly string[]): string[] =>
  changed.filter((file) => {
    const normalized = normalizeRepoPath(file);
    if (normalized === null) return true;
    if (isGeneratedOutput(normalized)) return false;
    return !inScope(normalized, allowed);
  });
