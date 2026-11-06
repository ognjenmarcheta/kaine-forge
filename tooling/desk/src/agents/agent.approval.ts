import { commandsIn } from "./agent.shell";
import { forbiddenCommandReason } from "./agent.verify";
import { DESK_COMMAND_DENIES, DESK_GIT_DENIES } from "./permissions";

/** A character that chains, pipes, redirects, substitutes, escapes, or makes a pattern. An approved command has none. */
const SHELL_SYNTAX = /[;&|`<>$()*\\\n\r]/;

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

const escapeRegExp = (text: string): string => text.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

/**
 * Whether the deny rule `Bash(...)` denies `text`. `Bash(cmd:*)` is a prefix rule. `Bash(cmd *)`
 * and other `*` rules are globs. A rule without `*` denies that exact command only.
 */
const ruleDenies = (rule: string, text: string): boolean => {
  const inner = /^Bash\((.+)\)$/.exec(rule)?.[1];
  if (inner === undefined) return false;
  if (inner.endsWith(":*")) {
    const prefix = inner.slice(0, -2);
    return text === prefix || text.startsWith(`${prefix} `);
  }
  if (inner.includes("*")) {
    const glob = new RegExp(`^${inner.split("*").map(escapeRegExp).join(".*")}$`);
    return glob.test(text) || (inner.endsWith(" *") && text === inner.slice(0, -2));
  }
  return text === inner;
};

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
    return "The command chains, pipes, redirects, substitutes, escapes, or holds a pattern. Only one simple command can be allowed.";
  }
  const simple = commandsIn(line);
  const words = simple[0];
  if (simple.length !== 1 || words === undefined) return "The command is not one simple command.";
  const forbidden = forbiddenCommandReason(line);
  if (forbidden !== null) return `The desk never lets an agent run ${forbidden}.`;
  // The words after `env`, a variable assignment, or `bash -c` are what the program runs.
  const unwrapped = words.join(" ");
  for (const rule of [...DESK_GIT_DENIES, ...DESK_COMMAND_DENIES, ...policyDenies]) {
    if (ruleDenies(rule, line) || ruleDenies(rule, unwrapped)) {
      return "The desk or the checkout's policy denies this command to every agent.";
    }
  }
  const program = (words[0] ?? "").split("/").at(-1) ?? "";
  if (PACKAGE_PROGRAMS.has(program)) {
    const risky = words.slice(1).find((word) => RISKY_WORDS.has(word));
    if (risky !== undefined) return `The desk does not let an agent run '${program} ${risky}'.`;
  }
  return null;
};
