import { builderOutputSchema, type PlannerOutput } from "../contracts";
import type { AgentDenial, AgentEvent, AgentRunRequest, AgentRunResult } from "./agent.runner";
import { commandsIn, gitSubcommand } from "./agent.shell";
import {
  FORBIDDEN_GIT_SUBCOMMANDS,
  FORBIDDEN_SCRIPTS,
  FORBIDDEN_SERENA_TOOLS,
  type Receipt
} from "./permissions";
import { isProtectedPath, protectedPathReason, scopeViolations } from "../policy/protected-paths";

/**
 * Checks after an agent run. The engine runs it after every agent stage and
 * sends the stage to `needs-you` when it finds a violation. A skill name in
 * the agent's prose proves nothing; the evidence is in the trace.
 */

export const VIOLATION_KINDS = [
  "skill-not-used",
  "skill-out-of-scope",
  "forbidden-command-attempted",
  "permission-denied",
  "claimed-check-not-run",
  "scope",
  "protected-path",
  "refs-changed",
  "schema"
] as const;
export type ViolationKind = (typeof VIOLATION_KINDS)[number];

export interface Violation {
  readonly kind: ViolationKind;
  readonly message: string;
}

export interface VerifyInput<T> {
  readonly request: AgentRunRequest<T>;
  readonly result: AgentRunResult<T>;
  /** Violations the engine found by comparing HEAD, branch, tags and remotes before and after. */
  readonly refs?: { readonly violations: readonly string[] } | undefined;
  /** Paths the run changed, from the worktree diff. */
  readonly changedFiles?: readonly string[] | undefined;
  /** The approved plan. With it, every changed path must be one the plan lists. */
  readonly plan?: PlannerOutput | undefined;
  /** Receipts from the PostToolUse hook. They count as evidence beside the trace. */
  readonly receipts?: readonly Receipt[] | undefined;
}

export interface VerifyResult {
  readonly ok: boolean;
  readonly violations: readonly Violation[];
}

type ToolCall = Extract<AgentEvent, { type: "tool_call" }>;

const toolCalls = (trace: readonly AgentEvent[]): ToolCall[] =>
  trace.filter((event): event is ToolCall => event.type === "tool_call");

const deniedIds = (denials: readonly AgentDenial[]): Set<string> =>
  new Set(denials.flatMap((denial) => (denial.toolUseId === undefined ? [] : [denial.toolUseId])));

const skillFiles = (skill: string): string[] => [
  `skills/${skill}/SKILL.md`,
  `.ai/skills/${skill}.md`
];

const readsSkillFile = (call: ToolCall, skill: string): boolean => {
  const files = skillFiles(skill);
  if (call.tool === "Read") {
    return call.paths.some((file) => files.some((suffix) => file.endsWith(suffix)));
  }
  if (call.tool === "Bash" && call.command !== undefined) {
    const command = call.command;
    return files.some((suffix) => command.includes(suffix));
  }
  return false;
};

const isSkillCall = (call: ToolCall, skill: string): boolean =>
  call.tool === "Skill" &&
  call.skill !== undefined &&
  (call.skill === skill || call.skill.endsWith(`:${skill}`));

const skillViolations = <T>(
  request: AgentRunRequest<T>,
  calls: readonly ToolCall[],
  denied: ReadonlySet<string>
): Violation[] => {
  const violations: Violation[] = [];
  const executed = calls.filter((call) => !denied.has(call.id));
  if (request.skillMode === "invoke") {
    for (const skill of request.skills) {
      const used = executed.some((call) => isSkillCall(call, skill) || readsSkillFile(call, skill));
      if (!used) {
        violations.push({
          kind: "skill-not-used",
          message: `Skill '${skill}' was not used: the run has no Skill call and no read of its SKILL.md.`
        });
      }
    }
  }
  const allowed = new Set(request.skills);
  for (const call of executed) {
    if (call.tool !== "Skill" || call.skill === undefined) continue;
    const name = call.skill.includes(":")
      ? (call.skill.split(":").at(-1) ?? call.skill)
      : call.skill;
    if (!allowed.has(name)) {
      violations.push({
        kind: "skill-out-of-scope",
        message: `Skill '${call.skill}' is outside the list for the ${request.role} role.`
      });
    }
  }
  return violations;
};

const hasAny = (args: readonly string[], flags: readonly string[]): boolean =>
  args.some((arg) => flags.includes(arg));

/**
 * Some forbidden subcommands also have read-only forms (`git branch
 * --show-current`, `git stash list`). Looking is not an attempt to change
 * anything, so those forms are not reported here. The permission rules still
 * deny them, and a denial is reported as `permission-denied`.
 */
const isReadOnlyGit = (sub: string, args: readonly string[]): boolean => {
  switch (sub) {
    case "branch":
      return (
        args.length === 0 ||
        (hasAny(args, [
          "--show-current",
          "--list",
          "-l",
          "-v",
          "-vv",
          "-a",
          "-r",
          "--all",
          "--remotes",
          "--contains",
          "--merged",
          "--no-merged"
        ]) &&
          !hasAny(args, [
            "-d",
            "-D",
            "-m",
            "-M",
            "-c",
            "-C",
            "--delete",
            "--move",
            "--copy",
            "-u",
            "--set-upstream-to",
            "--unset-upstream"
          ]))
      );
    case "tag":
      return args.length === 0 || hasAny(args, ["-l", "--list"]);
    case "remote":
      return args.length === 0 || args[0] === "-v" || args[0] === "show" || args[0] === "get-url";
    case "config":
      return hasAny(args, ["--get", "--get-all", "--get-regexp", "--list", "-l"]);
    case "worktree":
      return args[0] === "list";
    case "stash":
      return args[0] === "list" || args[0] === "show";
    default:
      return false;
  }
};

/** Why a command line is forbidden for an agent, or `null` when it is not. */
export const forbiddenCommandReason = (line: string): string | null => {
  for (const words of commandsIn(line)) {
    const program = (words[0] ?? "").split("/").at(-1) ?? "";
    if (program === "gh") return "gh";
    const sub = gitSubcommand(words);
    if (sub !== null && FORBIDDEN_GIT_SUBCOMMANDS.includes(sub)) {
      const args = words.slice(words.indexOf(sub) + 1);
      if (!isReadOnlyGit(sub, args)) return `git ${sub}`;
    }
    if (program === "git" && words.includes("--no-verify")) return "git --no-verify";
    if (["pnpm", "npm", "npx", "yarn", "turbo"].includes(program)) {
      const script = words.slice(1).find((word) => FORBIDDEN_SCRIPTS.includes(word));
      if (script !== undefined) return `${program} ${script}`;
    }
  }
  return null;
};

const attemptViolations = (calls: readonly ToolCall[]): Violation[] => {
  const violations: Violation[] = [];
  for (const call of calls) {
    if (call.command !== undefined) {
      const reason = forbiddenCommandReason(call.command);
      if (reason !== null) {
        violations.push({
          kind: "forbidden-command-attempted",
          message: `The agent tried a forbidden command (${reason}): ${call.command}`
        });
      }
    }
    if (FORBIDDEN_SERENA_TOOLS.includes(call.tool)) {
      violations.push({
        kind: "forbidden-command-attempted",
        message: `The agent called a forbidden tool: ${call.tool}`
      });
    }
  }
  return violations;
};

const denialViolations = (denials: readonly AgentDenial[]): Violation[] =>
  denials.map((denial) => ({
    kind: "permission-denied" as const,
    message: `Permission denied for ${denial.tool}${
      denial.command !== undefined
        ? `: ${denial.command}`
        : denial.paths.length > 0
          ? `: ${denial.paths.join(", ")}`
          : ""
    }`
  }));

/** A command line reduced to simple commands with single spaces, for prefix comparison. */
const normalizedCommands = (line: string): string[] =>
  commandsIn(line).map((words) => words.join(" "));

const checkViolations = <T>(
  result: AgentRunResult<T>,
  calls: readonly ToolCall[],
  denied: ReadonlySet<string>,
  receipts: readonly Receipt[]
): Violation[] => {
  const parsed = builderOutputSchema.safeParse(result.structured);
  if (!parsed.success) {
    return [
      {
        kind: "schema",
        message: `The builder result does not match the builder schema: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ")}`
      }
    ];
  }
  const observed = [
    ...calls
      .filter((call) => call.tool === "Bash" && call.command !== undefined && !denied.has(call.id))
      .flatMap((call) => normalizedCommands(call.command ?? "")),
    ...receipts
      .filter((receipt) => receipt.tool === "Bash")
      .flatMap((receipt) => normalizedCommands(receipt.command ?? ""))
  ];
  const violations: Violation[] = [];
  for (const claim of parsed.data.claimedChecks) {
    if (claim.result === "not-run") continue;
    const wanted = normalizedCommands(claim.command)[0] ?? "";
    if (
      wanted === "" ||
      !observed.some((command) => command === wanted || command.startsWith(`${wanted} `))
    ) {
      violations.push({
        kind: "claimed-check-not-run",
        message: `The builder claims it ran '${claim.command}' (${claim.result}), but the run has no such command.`
      });
    }
  }
  return violations;
};

const fileViolations = (
  changedFiles: readonly string[],
  plan: PlannerOutput | undefined
): Violation[] => {
  const violations: Violation[] = [];
  for (const file of changedFiles) {
    if (isProtectedPath(file)) {
      violations.push({
        kind: "protected-path",
        message: `The run changed a protected path: ${protectedPathReason(file) ?? file}`
      });
    }
  }
  if (plan !== undefined) {
    const allowed = [
      ...plan.files.map((entry) => entry.path),
      ...plan.tests.map((entry) => entry.path)
    ];
    for (const file of scopeViolations(
      changedFiles.filter((entry) => !isProtectedPath(entry)),
      allowed
    )) {
      violations.push({
        kind: "scope",
        message: `The run changed '${file}', which the approved plan does not list.`
      });
    }
  }
  return violations;
};

export const verifyAgentRun = <T>(input: VerifyInput<T>): VerifyResult => {
  const { request, result } = input;
  const calls = toolCalls(result.trace);
  const denied = deniedIds(result.denials);

  const violations: Violation[] = [
    ...skillViolations(request, calls, denied),
    ...attemptViolations(calls),
    ...denialViolations(result.denials),
    ...(request.role === "builder"
      ? checkViolations(result, calls, denied, input.receipts ?? [])
      : []),
    ...fileViolations(input.changedFiles ?? [], input.plan),
    ...(input.refs?.violations ?? []).map((message) => ({
      kind: "refs-changed" as const,
      message
    }))
  ];
  return { ok: violations.length === 0, violations };
};
