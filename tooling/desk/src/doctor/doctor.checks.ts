import type { DeskConfigLoadResult } from "../config/config.load";
import type { Provider } from "../contracts";
import { checkControllerIdentity } from "../github/github.identity";
import type { Exec, GitHubPort } from "../ports";

export type CheckStatus = "ok" | "warn" | "error";

export interface DoctorCheck {
  readonly id: string;
  readonly label: string;
  readonly status: CheckStatus;
  readonly detail: string;
}

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
  const match = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(text);
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
    : check("pnpm", "pnpm", "error", "pnpm is not installed or does not start");
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
        : check("gh-identity", "gh identity", "error", identity.reason)
    );
  } catch (error) {
    checks.push(
      check(
        "gh-identity",
        "gh identity",
        "error",
        `gh is not authenticated or cannot reach GitHub: ${error instanceof Error ? error.message : "unknown error"}`
      )
    );
  }
  return checks;
};

const checkConfig = async (
  deps: DoctorDeps
): Promise<{
  check: DoctorCheck;
  providers: ReadonlySet<Provider>;
  owner: string | undefined;
  docker: boolean;
}> => {
  const loaded = await deps.loadConfig();
  if (!loaded.ok) {
    return {
      check: check("config", "Config", "error", `${loaded.reason}: ${loaded.detail}`),
      // Without a valid config every provider counts as required.
      providers: new Set<Provider>(["claude", "codex"]),
      owner: undefined,
      docker: false
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
    docker: config.isolation === "docker"
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
  const checks: DoctorCheck[] = [
    checkNode(deps.nodeVersion),
    await checkPnpm(deps),
    ...(await checkGit(deps)),
    ...(await checkGh(deps, config.owner)),
    config.check,
    ...(await checkProvider(deps, "claude", config.providers.has("claude"))),
    ...(await checkProvider(deps, "codex", config.providers.has("codex"))),
    ...((await deps.dockerChecks?.(config.docker)) ?? [])
  ];
  return { ok: checks.every((entry) => entry.status !== "error"), checks };
};

const MARK: Readonly<Record<CheckStatus, string>> = { ok: "ok", warn: "warn", error: "FAIL" };

/** Plain-text table for a terminal. */
export const formatDoctorReport = (report: DoctorReport): string => {
  const width = Math.max(...report.checks.map((entry) => entry.label.length));
  const rows = report.checks.map(
    (entry) => `${MARK[entry.status].padEnd(5)} ${entry.label.padEnd(width)}  ${entry.detail}`
  );
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
