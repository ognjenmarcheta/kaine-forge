import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import type { DeskConfigLoadResult } from "../config/config.load";
import type { DeskConfig, HealthFix, Provider } from "../contracts";
import { worktreeDirFor } from "../engine/pipeline.stage.setup";
import { checkControllerIdentity } from "../github/github.identity";
import { AGENT_LABELS } from "../github/github.labels";
import type { Exec, GitHubPort } from "../ports";
import type { RepoLocation } from "../store/store.root";

export type CheckStatus = "ok" | "warn" | "error";

export interface DoctorCheck {
  readonly id: string;
  readonly label: string;
  readonly status: CheckStatus;
  readonly detail: string;
  /** A command the engineer runs by hand to repair the check. */
  readonly command?: string | undefined;
  /** A repair the desk can run itself. */
  readonly fix?: HealthFix | undefined;
}

/** The same check with a way to repair it. */
export const withRemedy = (
  check: DoctorCheck,
  remedy: { readonly command: string; readonly fix?: HealthFix }
): DoctorCheck => ({ ...check, ...remedy });

export interface DoctorReport {
  /** False when any check is an error. Warnings do not fail the doctor. */
  readonly ok: boolean;
  readonly checks: readonly DoctorCheck[];
}

export interface DoctorDeps {
  readonly exec: Exec;
  readonly github: Pick<GitHubPort, "repository" | "viewer">;
  readonly cwd: string;
  readonly nodeVersion: string;
  readonly loadConfig: () => Promise<DeskConfigLoadResult>;
  /**
   * Docker checks (daemon, image, logins, probes). `required` says whether the config asks for
   * Docker isolation, which turns a missing daemon or image into an error.
   */
  readonly dockerChecks?: ((required: boolean) => Promise<DoctorCheck[]>) | undefined;
  /** Where the checkout lives. With it, a Windows host gets the worktree path check. */
  readonly location?: Pick<RepoLocation, "repoRoot" | "stateRoot"> | undefined;
  /** Defaults to `process.platform`. */
  readonly platform?: NodeJS.Platform | undefined;
}

const MIN_NODE_MAJOR = 22;
const MIN_GIT: readonly [number, number] = [2, 5];

/** Flags each provider CLI must offer. A name with `|` accepts either spelling. */
export const REQUIRED_FLAGS: Readonly<Record<Provider, readonly string[]>> = {
  claude: [
    "--output-format",
    "--json-schema",
    "--permission-mode",
    "--permission-prompts",
    "--agents",
    "--setting-sources",
    "--settings",
    "--session-id",
    "--resume",
    "--strict-mcp-config"
  ],
  codex: ["--json", "--output-schema", "--sandbox|-s", "--cd|-C", "--ignore-user-config", "resume"]
};

/** The help command that lists a provider's flags. */
const HELP_ARGV: Readonly<Record<Provider, readonly string[]>> = {
  claude: ["claude", "--help"],
  codex: ["codex", "exec", "--help"]
};

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Is `flag` (or a short alias) listed as an option, not as a prefix of a longer one? */
export const helpMentions = (help: string, flag: string): boolean =>
  flag.split("|").some((name) => {
    if (name === "resume") return /^\s+resume\b/m.test(help);
    return new RegExp(`(?:^|[\\s,|\\[<])${escape(name)}(?![\\w-])`, "m").test(help);
  });

export const missingFlags = (help: string, provider: Provider): string[] =>
  REQUIRED_FLAGS[provider].filter((flag) => !helpMentions(help, flag));

const versionOf = (text: string): number[] | null => {
  // A match starts where a digit run starts, so a long run is not rescanned from inside.
  const match = /(?:^|\D)(\d+)\.(\d+)(?:\.(\d+))?/.exec(text);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)] : null;
};

const check = (id: string, label: string, status: CheckStatus, detail: string): DoctorCheck => ({
  id,
  label,
  status,
  detail
});

const checkNode = (nodeVersion: string): DoctorCheck => {
  const major = versionOf(nodeVersion)?.[0];
  return major !== undefined && major >= MIN_NODE_MAJOR
    ? check("node", "Node.js", "ok", nodeVersion)
    : check("node", "Node.js", "error", `${nodeVersion}: the repo needs Node ${MIN_NODE_MAJOR}+`);
};

const checkPnpm = async ({ exec, cwd }: DoctorDeps): Promise<DoctorCheck> => {
  const result = await exec({ argv: ["pnpm", "--version"], cwd, timeoutMs: 15_000 });
  return result.code === 0
    ? check("pnpm", "pnpm", "ok", result.stdout.trim())
    : withRemedy(check("pnpm", "pnpm", "error", "pnpm is not installed or does not start"), {
        command: "corepack enable"
      });
};

const checkGit = async ({ exec, cwd }: DoctorDeps): Promise<DoctorCheck[]> => {
  const version = await exec({ argv: ["git", "--version"], cwd, timeoutMs: 15_000 });
  if (version.code !== 0) {
    return [check("git", "git", "error", "git is not installed or does not start")];
  }
  const parsed = versionOf(version.stdout);
  const supported =
    parsed !== null &&
    (parsed[0]! > MIN_GIT[0] || (parsed[0] === MIN_GIT[0] && parsed[1]! >= MIN_GIT[1]));
  const worktrees = await exec({
    argv: ["git", "worktree", "list", "--porcelain"],
    cwd,
    timeoutMs: 15_000
  });
  return [
    check(
      "git",
      "git",
      supported ? "ok" : "error",
      supported
        ? version.stdout.trim()
        : `${version.stdout.trim()}: worktrees need git ${MIN_GIT.join(".")}+`
    ),
    check(
      "git-worktree",
      "git worktrees",
      worktrees.code === 0 ? "ok" : "error",
      worktrees.code === 0
        ? "git worktree list works in this checkout"
        : "git worktree list failed: run the desk inside the repository"
    )
  ];
};

const checkGh = async (deps: DoctorDeps, owner: string | undefined): Promise<DoctorCheck[]> => {
  const { exec, cwd, github } = deps;
  const version = await exec({ argv: ["gh", "--version"], cwd, timeoutMs: 15_000 });
  if (version.code !== 0) {
    return [check("gh", "gh", "error", "gh is not installed. See https://cli.github.com")];
  }
  const checks = [check("gh", "gh", "ok", version.stdout.split("\n")[0]?.trim() ?? "installed")];
  try {
    const identity = await checkControllerIdentity(github, owner);
    checks.push(
      identity.ok
        ? check(
            "gh-identity",
            "gh identity",
            "ok",
            `signed in as the owner ${identity.owner} for ${identity.repository.fullName}`
          )
        : withRemedy(check("gh-identity", "gh identity", "error", identity.reason), {
            command: "gh auth login"
          })
    );
  } catch (error) {
    checks.push(
      withRemedy(
        check(
          "gh-identity",
          "gh identity",
          "error",
          `gh is not authenticated or cannot reach GitHub: ${error instanceof Error ? error.message : "unknown error"}`
        ),
        { command: "gh auth login" }
      )
    );
  }
  return checks;
};

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const labelListSchema = z.array(z.object({ name: z.string() }));

/** The execution labels the desk sets on issues. Without them every label write fails. */
const checkAgentLabels = async ({ exec, cwd }: DoctorDeps): Promise<DoctorCheck> => {
  const result = await exec({
    argv: ["gh", "label", "list", "--json", "name", "--limit", "1000"],
    cwd,
    timeoutMs: 15_000
  });
  const parsed = labelListSchema.safeParse(result.code === 0 ? parseJson(result.stdout) : null);
  if (!parsed.success) {
    return check("agent-labels", "Agent labels", "warn", "gh could not list the labels");
  }
  const names = new Set(parsed.data.map((label) => label.name));
  const missing = AGENT_LABELS.filter((label) => !names.has(label));
  return missing.length === 0
    ? check("agent-labels", "Agent labels", "ok", `${AGENT_LABELS.join(", ")} exist`)
    : withRemedy(
        check(
          "agent-labels",
          "Agent labels",
          "warn",
          `missing ${missing.join(", ")}: the desk cannot label its issues`
        ),
        { command: "pnpm desk labels sync --apply", fix: "agent-labels" }
      );
};

const workspaceListSchema = z.array(z.object({ name: z.string().optional(), path: z.string() }));

const entryPointsSchema = z.object({
  main: z.unknown().optional(),
  types: z.unknown().optional(),
  exports: z.unknown().optional()
});

const entryStrings = (value: unknown): string[] =>
  typeof value === "string"
    ? [value]
    : typeof value === "object" && value !== null
      ? Object.values(value).flatMap(entryStrings)
      : [];

/** Does a manifest's `main`, `types` or `exports` point into `dist/`? */
const resolvesThroughDist = (manifest: unknown): boolean => {
  const parsed = entryPointsSchema.safeParse(manifest);
  if (!parsed.success) return false;
  const { main, types, exports } = parsed.data;
  return entryStrings([main, types, exports]).some((entry) => /^(\.\/)?dist\//.test(entry));
};

const exists = (target: string): Promise<boolean> =>
  access(target).then(
    () => true,
    () => false
  );

/**
 * Workspaces whose package exports point into `dist/` but have no `dist`.
 * Tests that import them fail until they are built. `null` when pnpm cannot list the workspaces.
 */
export const missingWorkspaceBuilds = async (exec: Exec, cwd: string): Promise<string[] | null> => {
  const listed = await exec({
    argv: ["pnpm", "ls", "-r", "--depth", "-1", "--json"],
    cwd,
    timeoutMs: 60_000
  });
  const parsed = workspaceListSchema.safeParse(listed.code === 0 ? parseJson(listed.stdout) : null);
  if (!parsed.success) return null;
  const missing: string[] = [];
  for (const workspace of parsed.data) {
    if (workspace.name === undefined) continue;
    const manifest = parseJson(
      await readFile(path.join(workspace.path, "package.json"), "utf8").catch(() => "")
    );
    if (resolvesThroughDist(manifest) && !(await exists(path.join(workspace.path, "dist")))) {
      missing.push(workspace.name);
    }
  }
  return missing.sort();
};

/** `pnpm turbo run build` for the given workspaces and what they depend on. */
export const workspaceBuildArgv = (names: readonly string[]): string[] => [
  "pnpm",
  "turbo",
  "run",
  "build",
  ...names.map((name) => `--filter=${name}`)
];

const checkWorkspaceBuilds = async ({ exec, cwd }: DoctorDeps): Promise<DoctorCheck> => {
  const missing = await missingWorkspaceBuilds(exec, cwd);
  if (missing === null) {
    return check("workspace-builds", "Workspace builds", "warn", "pnpm could not list workspaces");
  }
  return missing.length === 0
    ? check("workspace-builds", "Workspace builds", "ok", "every built package has its dist")
    : withRemedy(
        check(
          "workspace-builds",
          "Workspace builds",
          "warn",
          `not built: ${missing.join(", ")}. Tests that import them fail until they are built`
        ),
        { command: workspaceBuildArgv(missing).join(" "), fix: "workspace-builds" }
      );
};

/** Node reads nested manifests such as this one to pick a file's module type. */
const NESTED_MANIFEST = path.join("cjs", "package.json");
const WINDOWS_MAX_PATH = 260;

/** The longest `<id>/node_modules/[@scope/]<name>` directory in a pnpm store, relative to it. */
const longestPackageDir = async (store: string): Promise<string | null> => {
  let ids: string[];
  try {
    ids = await readdir(store);
  } catch {
    return null;
  }
  let longest = "";
  for (const id of ids) {
    const modules = path.join(id, "node_modules");
    const names = await readdir(path.join(store, modules)).catch((): string[] => []);
    for (const name of names) {
      const dirs = name.startsWith("@")
        ? (await readdir(path.join(store, modules, name)).catch((): string[] => [])).map((inner) =>
            path.join(name, inner)
          )
        : [name];
      for (const dir of dirs) {
        const relative = path.join(modules, dir);
        if (relative.length > longest.length) longest = relative;
      }
    }
  }
  return longest === "" ? null : longest;
};

/**
 * Windows only. An issue worktree repeats this checkout's `node_modules`. When
 * its folder is deep, Node cannot read a nested `package.json` at 260
 * characters and loads a CommonJS file as an ES module.
 */
const checkWorktreePath = async (
  cwd: string,
  location: Pick<RepoLocation, "repoRoot" | "stateRoot">,
  config: DeskConfig
): Promise<DoctorCheck | null> => {
  const longest = await longestPackageDir(path.join(cwd, "node_modules", ".pnpm"));
  if (longest === null) return null;
  const root = worktreeDirFor({ config, location }, 99_999);
  const length = path.join(root, "node_modules", ".pnpm", longest, NESTED_MANIFEST).length;
  return length < WINDOWS_MAX_PATH
    ? check(
        "worktree-path",
        "Worktree path",
        "ok",
        `${length} characters at most in ${path.dirname(root)}`
      )
    : check(
        "worktree-path",
        "Worktree path",
        "error",
        `issue worktrees in ${path.dirname(root)} reach ${length} characters in node_modules; Windows fails at ${WINDOWS_MAX_PATH}. Set "worktreesDir" in .ai.local/desk/config.json to a shorter folder.`
      );
};

/** The same sandbox the Codex runner asks for on Windows, reading a file without a model call. */
const CODEX_PROBE_ARGV = [
  "codex",
  "sandbox",
  "-c",
  'sandbox_mode="read-only"',
  "-c",
  'windows.sandbox="unelevated"',
  "--",
  "node",
  "-e",
  "process.stdout.write(String(require('node:fs').readFileSync('package.json').length))"
];

/** Windows only. `codex --help` passing says nothing about whether the sandbox can read. */
const checkCodexSandbox = async (
  { exec, cwd }: DoctorDeps,
  required: boolean
): Promise<DoctorCheck> => {
  const result = await exec({ argv: CODEX_PROBE_ARGV, cwd, timeoutMs: 60_000 });
  if (result.code === 0 && /^\d+$/.test(result.stdout.trim())) {
    return check(
      "codex-sandbox",
      "Codex sandbox",
      "ok",
      "the Windows sandbox can read the checkout"
    );
  }
  const reason = `${result.stderr}\n${result.stdout}`.trim().split("\n").at(-1) ?? "";
  return check(
    "codex-sandbox",
    "Codex sandbox",
    required ? "error" : "warn",
    `the Windows sandbox cannot read the checkout, so a Codex agent cannot read the code (${reason || `exit ${result.code}`}). Set those roles to "claude" in providers.`
  );
};

const checkConfig = async (
  deps: DoctorDeps
): Promise<{
  check: DoctorCheck;
  providers: ReadonlySet<Provider>;
  owner: string | undefined;
  docker: boolean;
  config: DeskConfig | null;
}> => {
  const loaded = await deps.loadConfig();
  if (!loaded.ok) {
    return {
      check: check("config", "Config", "error", `${loaded.reason}: ${loaded.detail}`),
      // Without a valid config every provider counts as required.
      providers: new Set<Provider>(["claude", "codex"]),
      owner: undefined,
      docker: false,
      config: null
    };
  }
  const { config } = loaded;
  return {
    check: check(
      "config",
      "Config",
      "ok",
      loaded.source === "file" ? "valid (.ai.local/desk/config.json)" : "defaults"
    ),
    providers: new Set<Provider>(Object.values(config.providers)),
    owner: config.owner,
    docker: config.isolation === "docker",
    config
  };
};

const checkProvider = async (
  { exec, cwd }: DoctorDeps,
  provider: Provider,
  required: boolean
): Promise<DoctorCheck[]> => {
  const missing: CheckStatus = required ? "error" : "warn";
  const role = required ? "required by the config" : "optional";
  const version = await exec({ argv: [provider, "--version"], cwd, timeoutMs: 15_000 });
  if (version.code !== 0) {
    return [check(provider, provider, missing, `${provider} is not installed (${role})`)];
  }
  const checks = [check(provider, provider, "ok", version.stdout.trim().split("\n")[0] ?? "")];
  const help = await exec({ argv: HELP_ARGV[provider], cwd, timeoutMs: 15_000 });
  if (help.code !== 0) {
    checks.push(
      check(
        `${provider}-flags`,
        `${provider} flags`,
        missing,
        `${HELP_ARGV[provider].join(" ")} failed`
      )
    );
    return checks;
  }
  const lacking = missingFlags(`${help.stdout}\n${help.stderr}`, provider);
  checks.push(
    lacking.length === 0
      ? check(
          `${provider}-flags`,
          `${provider} flags`,
          "ok",
          `${REQUIRED_FLAGS[provider].length} required flags present`
        )
      : check(
          `${provider}-flags`,
          `${provider} flags`,
          missing,
          `missing: ${lacking.join(", ")} (${role}). Update ${provider}.`
        )
  );
  return checks;
};

/** Read-only environment checks. Nothing here writes to GitHub or to the repository. */
export const runDoctor = async (deps: DoctorDeps): Promise<DoctorReport> => {
  const config = await checkConfig(deps);
  const windows = (deps.platform ?? process.platform) === "win32";
  const gh = await checkGh(deps, config.owner);
  const codex = await checkProvider(deps, "codex", config.providers.has("codex"));
  const codexRuns = codex.every((entry) => entry.status === "ok");
  const worktreePath =
    windows && deps.location !== undefined && config.config !== null
      ? await checkWorktreePath(deps.cwd, deps.location, config.config)
      : null;
  const checks: DoctorCheck[] = [
    checkNode(deps.nodeVersion),
    await checkPnpm(deps),
    ...(await checkGit(deps)),
    ...gh,
    ...(gh.every((entry) => entry.status === "ok") ? [await checkAgentLabels(deps)] : []),
    config.check,
    ...(await checkProvider(deps, "claude", config.providers.has("claude"))),
    ...codex,
    ...(windows && codexRuns ? [await checkCodexSandbox(deps, config.providers.has("codex"))] : []),
    ...(worktreePath === null ? [] : [worktreePath]),
    await checkWorkspaceBuilds(deps),
    ...((await deps.dockerChecks?.(config.docker)) ?? [])
  ];
  return { ok: checks.every((entry) => entry.status !== "error"), checks };
};

const MARK: Readonly<Record<CheckStatus, string>> = { ok: "ok", warn: "warn", error: "FAIL" };

/** Plain-text table for a terminal. */
export const formatDoctorReport = (report: DoctorReport): string => {
  const width = Math.max(...report.checks.map((entry) => entry.label.length));
  const rows = report.checks.flatMap((entry) => [
    `${MARK[entry.status].padEnd(5)} ${entry.label.padEnd(width)}  ${entry.detail}`,
    ...(entry.status !== "ok" && entry.command !== undefined
      ? [`${" ".repeat(6 + width)}  run: ${entry.command}`]
      : [])
  ]);
  const failed = report.checks.filter((entry) => entry.status === "error").length;
  const warned = report.checks.filter((entry) => entry.status === "warn").length;
  return [
    ...rows,
    "",
    report.ok
      ? `Doctor passed${warned > 0 ? ` with ${warned} warning(s)` : ""}.`
      : `Doctor found ${failed} problem(s).`
  ].join("\n");
};
