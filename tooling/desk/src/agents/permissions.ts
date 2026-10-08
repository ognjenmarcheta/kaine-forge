import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import type { Provider } from "../contracts";
import type { AgentPermissions } from "./agent.runner";
import { ROLE_SKILLS, type DeskRole } from "../engine/worktree.bootstrap";

/**
 * Tool permissions for each role, as Claude `--allowedTools` and
 * `--disallowedTools` rules, plus the per-run settings file that wires the
 * repo's PreToolUse hook and the desk's receipt hook.
 *
 * Facts the rules rest on (spike, claude 2.1.282, see docs/agents/agent-desk.md):
 *
 * - The allowlist is NARROW on purpose. A deny prefix is bypassable: with
 *   `Bash(git:*)` allowed, `git -C . commit` and `git -c k=v commit` ran. Only
 *   read-only git subcommands are allowed, and a narrow list denied those forms.
 * - `Bash(pnpm --filter <workspace> test:*)` with an exact workspace name allows
 *   that script only. A `*` in the workspace slot also allows
 *   `pnpm --filter x exec evil test`, so the names are always exact.
 * - An allow rule does not restrict `Skill`. Only a deny rule does, so skills
 *   outside the role list are denied by name.
 * - Deny rules are defence in depth. The engine still checks that HEAD, the
 *   branch, tags and remotes are unchanged after every agent stage.
 */

export class PermissionsPolicyError extends Error {
  override readonly name = "PermissionsPolicyError";
  constructor(
    readonly reason: "missing" | "malformed" | "invalid-input",
    message: string,
    options?: { readonly cause: Error }
  ) {
    super(message, options);
  }
}

const policyFileSchema = z.object({
  rules: z.array(
    z.object({
      id: z.string(),
      decision: z.enum(["deny", "ask", "allow"]),
      command: z.string().min(1),
      flag: z.string().optional()
    })
  )
});

/**
 * Bash deny rules from `<worktree>/.ai/permissions.json`. A headless run cannot
 * answer a prompt, so an `ask` rule is a deny. A rule with a `flag` is left to
 * the PreToolUse hook: Claude's rule syntax cannot match an option anywhere in
 * a command.
 */
export const readPolicyDenies = async (worktree: string): Promise<string[]> => {
  const file = path.join(worktree, ".ai", "permissions.json");
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    throw new PermissionsPolicyError("missing", `Cannot read ${file}.`, {
      cause: error instanceof Error ? error : new Error(String(error))
    });
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new PermissionsPolicyError("malformed", `${file} is not valid JSON.`, {
      cause: error instanceof Error ? error : new Error(String(error))
    });
  }
  const parsed = policyFileSchema.safeParse(json);
  if (!parsed.success) {
    throw new PermissionsPolicyError(
      "malformed",
      `${file} does not match the policy format: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`
    );
  }
  return parsed.data.rules
    .filter((rule) => rule.decision !== "allow" && rule.flag === undefined)
    .flatMap((rule) => [`Bash(${rule.command})`, `Bash(${rule.command} *)`]);
};

const bash = (command: string): string => `Bash(${command}:*)`;

const READ_TOOLS = ["Read", "Glob", "Grep"] as const;
const GIT_READ = ["git diff", "git status", "git log", "git show"].map(bash);

const SERENA_READ = [
  "find_symbol",
  "find_referencing_symbols",
  "get_symbols_overview",
  "search_for_pattern",
  "list_dir",
  "find_file",
  "find_declaration",
  "find_implementations",
  "get_diagnostics_for_file",
  "list_memories",
  "read_memory",
  "initial_instructions",
  "get_current_config"
].map((tool) => `mcp__serena__${tool}`);

const SERENA_EDIT = [
  "replace_symbol_body",
  "insert_after_symbol",
  "insert_before_symbol",
  "replace_content",
  "rename_symbol"
].map((tool) => `mcp__serena__${tool}`);

/** Serena tools that write memory or run shell commands. Memory files are tracked, so a write dirties the diff. */
export const FORBIDDEN_SERENA_TOOLS: readonly string[] = [
  "write_memory",
  "edit_memory",
  "delete_memory",
  "rename_memory",
  "onboarding",
  "execute_shell_command",
  "create_text_file"
].map((tool) => `mcp__serena__${tool}`);

/** Git subcommands an agent never runs. The engine commits, branches and pushes. */
export const FORBIDDEN_GIT_SUBCOMMANDS: readonly string[] = [
  "commit",
  "push",
  "reset",
  "checkout",
  "rebase",
  "stash",
  "merge",
  "switch",
  "branch",
  "tag",
  "pull",
  "fetch",
  "clean",
  "restore",
  "cherry-pick",
  "revert",
  "remote",
  "config",
  "worktree",
  "update-ref"
];

const DESK_GIT_DENIES = FORBIDDEN_GIT_SUBCOMMANDS.map((subcommand) => bash(`git ${subcommand}`));

/** pnpm scripts the engine runs itself or that move shared state. */
export const FORBIDDEN_SCRIPTS: readonly string[] = [
  "ai:install",
  "ai:doctor",
  "release:apps",
  "db:push"
];

/** Commands the engine runs itself, and anything that starts a server or fetches code. */
const DESK_COMMAND_DENIES = [
  "gh",
  ...FORBIDDEN_SCRIPTS.map((script) => `pnpm ${script}`),
  "pnpm install",
  "pnpm add",
  "pnpm dev",
  "pnpm start",
  "pnpm preview",
  "pnpm serve",
  "pnpm desk",
  "pnpm exec",
  "pnpm dlx",
  "npx",
  "vite",
  "expo"
].map(bash);

/** Where an agent may not write, as Claude `Edit(...)` rules (they cover Write too). */
export const PROTECTED_EDIT_RULES: readonly string[] = [
  ".git/**",
  ".claude/**",
  ".agents/**",
  ".codex/**",
  ".cursor/**",
  ".grok/**",
  ".opencode/**",
  ".husky/**",
  ".ai/hooks/**",
  ".ai/permissions.json",
  ".ai.local/**",
  ".mcp.json",
  ".serena/memories/**",
  ".github/workflows/**",
  "**/.env",
  "**/.env.local",
  "**/node_modules/**"
].map((glob) => `Edit(${glob})`);

/** Every `kaine-*` skill the repo ships. A skill outside a role's list is out of scope. */
const KAINE_SKILLS: readonly string[] = [
  "kaine-adopt-template",
  "kaine-create-feature",
  "kaine-encode-knowledge",
  "kaine-explain",
  "kaine-fix-ci",
  "kaine-graph",
  "kaine-harness-eval",
  "kaine-intake",
  "kaine-open-pr",
  "kaine-rebase",
  "kaine-release-apps",
  "kaine-review",
  "kaine-scorecard",
  "kaine-secret-scan",
  "kaine-simplify",
  "kaine-summarize-work",
  "kaine-sync-docs",
  "kaine-test",
  "kaine-triage-deps",
  "kaine-triage-issue",
  "kaine-write-plan"
];

const WORKSPACE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;
const WORKSPACE_SCRIPTS = ["test", "typecheck", "lint"] as const;

/** Skills in the worktree's `.ai/skills`, so a new skill is out of scope by default. */
const worktreeSkills = async (worktree: string): Promise<string[]> => {
  try {
    const entries = await readdir(path.join(worktree, ".ai", "skills"));
    return entries.filter((entry) => entry.endsWith(".md")).map((entry) => entry.slice(0, -3));
  } catch {
    return [];
  }
};

export interface PermissionsOptions {
  /** Absolute path of the issue worktree. The policy is read from here. */
  readonly worktree: string;
  /**
   * Workspace package names whose `test`, `typecheck` and `lint` scripts a
   * builder may run, for example `@repo/api`. Exact names only. Without them a
   * builder can run `pnpm generate` and nothing else of pnpm.
   */
  readonly workspaces?: readonly string[];
  /** Skills for this run. Default: the role's own list. */
  readonly skills?: readonly string[];
}

/**
 * Allow and deny rules for one role and provider. Claude gets rule lists. Codex
 * gets a sandbox instead: its rules are fixed in the Codex runner, and a planner
 * or reviewer is always `read-only` there.
 */
export const permissionsFor = async (
  role: DeskRole,
  provider: Provider,
  options: PermissionsOptions
): Promise<AgentPermissions> => {
  if (provider === "codex") {
    return {
      allow: [],
      disallow: [],
      sandbox: role === "builder" ? "workspace-write" : "read-only"
    };
  }

  const skills = options.skills ?? ROLE_SKILLS[role];
  const workspaces = options.workspaces ?? [];
  for (const name of workspaces) {
    if (!WORKSPACE_NAME.test(name)) {
      throw new PermissionsPolicyError("invalid-input", `Invalid workspace name '${name}'.`);
    }
  }

  const allow: string[] = [
    ...READ_TOOLS,
    ...skills.map((skill) => `Skill(skill:${skill})`),
    ...GIT_READ,
    ...SERENA_READ
  ];
  if (role === "builder") {
    allow.push("Edit", "Write", bash("pnpm generate"), ...SERENA_EDIT);
    for (const workspace of workspaces) {
      for (const script of WORKSPACE_SCRIPTS)
        allow.push(bash(`pnpm --filter ${workspace} ${script}`));
    }
    if (skills.includes("kaine-create-feature")) allow.push(bash("pnpm create:feature"));
  }

  const inScope = new Set(skills);
  const outOfScope = [...new Set([...KAINE_SKILLS, ...(await worktreeSkills(options.worktree))])]
    .filter((skill) => !inScope.has(skill))
    .sort();

  const disallow = [
    ...(await readPolicyDenies(options.worktree)),
    ...DESK_GIT_DENIES,
    ...DESK_COMMAND_DENIES,
    "WebFetch",
    "WebSearch",
    ...FORBIDDEN_SERENA_TOOLS,
    ...PROTECTED_EDIT_RULES,
    ...outOfScope.map((skill) => `Skill(skill:${skill})`)
  ];
  return { allow, disallow: [...new Set(disallow)] };
};

// --- per-run settings ------------------------------------------------------

interface HookCommand {
  readonly type: "command";
  readonly command: string;
  readonly timeout: number;
}
interface HookGroup {
  readonly matcher: string;
  readonly hooks: readonly HookCommand[];
}
export interface RunSettings {
  readonly hooks: {
    readonly PreToolUse: readonly HookGroup[];
    readonly PostToolUse: readonly HookGroup[];
  };
}

/** The receipt hook that ships with the desk (`tooling/desk/hooks/receipt.mjs`). */
export const defaultReceiptHookPath = (): string =>
  fileURLToPath(new URL("../../hooks/receipt.mjs", import.meta.url));

const UNSAFE_IN_QUOTES = /["$`\\\n\r]/;

/** Quote a path for the shell string a hook runs. A path that cannot be quoted safely is refused. */
const quote = (value: string): string => {
  if (UNSAFE_IN_QUOTES.test(value)) {
    throw new PermissionsPolicyError("invalid-input", `Cannot use '${value}' in a hook command.`);
  }
  return `"${value}"`;
};

export interface RunSettingsInput {
  readonly worktree: string;
  readonly receiptsPath: string;
  /** Override for tests. Default: the desk's own `hooks/receipt.mjs`. */
  readonly receiptHookPath?: string;
}

/**
 * The `--settings` file for one run: the repo's PreToolUse hook (read from the
 * worktree, so it exists in any fresh checkout) and a PostToolUse logger that
 * appends the receipts file.
 */
export const buildRunSettings = (input: RunSettingsInput): RunSettings => {
  const preToolUse = path.join(input.worktree, ".ai", "hooks", "pre-tool-use.mjs");
  const receiptHook = input.receiptHookPath ?? defaultReceiptHookPath();
  return {
    hooks: {
      PreToolUse: [
        {
          matcher: "^(Bash|PowerShell)$",
          hooks: [
            { type: "command", command: `node ${quote(preToolUse)} --agent claude`, timeout: 10 }
          ]
        }
      ],
      PostToolUse: [
        {
          matcher: ".*",
          hooks: [
            {
              type: "command",
              command: `node ${quote(receiptHook)} ${quote(input.receiptsPath)}`,
              timeout: 10
            }
          ]
        }
      ]
    }
  };
};

const receiptSchema = z.object({
  tool: z.string(),
  command: z.string().optional(),
  file: z.string().optional(),
  skill: z.string().optional(),
  ts: z.string()
});
export type Receipt = z.infer<typeof receiptSchema>;

/** Parse a receipts file. A line that is not a receipt is skipped. */
export const parseReceipts = (text: string): Receipt[] =>
  text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .flatMap((line) => {
      try {
        const parsed = receiptSchema.safeParse(JSON.parse(line));
        return parsed.success ? [parsed.data] : [];
      } catch {
        return [];
      }
    });
