import { forbiddenCommandReason } from "./agent.verify";
import { DESK_COMMAND_DENIES, DESK_GIT_DENIES } from "./permissions";

/** A character that chains, pipes, redirects, substitutes, or makes a pattern. An approved command has none. */
const SHELL_SYNTAX = /[;&|`<>$()*\n\r]/;

/** Words that make a package-manager or turbo command run other code, or change what is installed. */
const RISKY_WORDS: ReadonlySet<string> = new Set([
  "exec",
  "dlx",
  "install",
  "add",
  "remove",
  "publish",
  "dev",
  "start",
  "preview",
  "serve"
]);

const PACKAGE_PROGRAMS: ReadonlySet<string> = new Set(["pnpm", "npm", "yarn", "turbo"]);

/** `Bash(pnpm exec:*)` is the prefix `pnpm exec`. Any other rule has no prefix. */
const prefixOf = (rule: string): string | null => /^Bash\((.+):\*\)$/.exec(rule)?.[1] ?? null;

/**
 * Why the owner may not allow `command` for an agent, or `null` when the owner may. The command
 * is one simple command, exact as the desk recorded it. The desk's own deny rules and the
 * checkout's policy (`policyDenies`) keep winning in the run, so a command refused here would
 * never run anyway. This check stops the desk from offering a button that cannot work, and stops
 * a caller from storing a command that the desk should never allow.
 */
export const approvalRefusal = (
  command: string,
  policyDenies: readonly string[] = []
): string | null => {
  const line = command.trim();
  if (line === "") return "The command is empty.";
  if (SHELL_SYNTAX.test(line)) {
    return "The command chains, pipes, redirects or substitutes. Only one simple command can be allowed.";
  }
  const forbidden = forbiddenCommandReason(line);
  if (forbidden !== null) return `The desk never lets an agent run ${forbidden}.`;
  for (const rule of [...DESK_GIT_DENIES, ...DESK_COMMAND_DENIES, ...policyDenies]) {
    const prefix = prefixOf(rule);
    if (prefix !== null && (line === prefix || line.startsWith(`${prefix} `))) {
      return `The desk denies '${prefix}' to every agent.`;
    }
  }
  const words = line.split(/\s+/);
  const program = (words[0] ?? "").split("/").at(-1) ?? "";
  if (PACKAGE_PROGRAMS.has(program)) {
    const risky = words.slice(1).find((word) => RISKY_WORDS.has(word));
    if (risky !== undefined) return `The desk does not let an agent run '${program} ${risky}'.`;
  }
  return null;
};
