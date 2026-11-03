import { PROVIDERS, type Provider } from "../contracts";
import type { Clock, Exec } from "../ports";
import { OPENCODE_MIN_VERSION } from "./opencode.runner";

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
  codex: ["--json", "--output-schema", "--sandbox|-s", "--cd|-C", "--ignore-user-config", "resume"],
  opencode: ["--standalone", "--format", "--session|-s", "--model|-m", "--title"]
};

/** The help command that lists a provider's flags. */
export const HELP_ARGV: Readonly<Record<Provider, readonly string[]>> = {
  claude: ["claude", "--help"],
  codex: ["codex", "exec", "--help"],
  opencode: ["opencode", "run", "--help"]
};

const versionTriple = (text: string): [number, number, number] | null => {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(text);
  return match === null ? null : [Number(match[1]), Number(match[2]), Number(match[3])];
};

/** Is the first `x.y.z` in `text` at least `minimum`? `false` when there is none. */
export const versionAtLeast = (text: string, minimum: string): boolean => {
  const found = versionTriple(text);
  const floor = versionTriple(minimum);
  if (found === null || floor === null) return false;
  for (let index = 0; index < 3; index += 1) {
    if (found[index] !== floor[index]) return found[index]! > floor[index]!;
  }
  return true;
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

/** What `<provider> --version` and its help say about a provider CLI on this machine. */
export type ProviderProbe =
  | { readonly status: "ok"; readonly version: string }
  | { readonly status: "missing" }
  | { readonly status: "too-old"; readonly version: string }
  | { readonly status: "help-failed"; readonly version: string }
  | { readonly status: "flags"; readonly version: string; readonly lacking: readonly string[] };

/** Runs the provider's version and help commands. The desk can run it only when the status is `ok`. */
export const probeProvider = async (
  exec: Exec,
  cwd: string,
  provider: Provider
): Promise<ProviderProbe> => {
  const version = await exec({ argv: [provider, "--version"], cwd, timeoutMs: 15_000 });
  if (version.code !== 0) return { status: "missing" };
  const line = version.stdout.trim().split("\n")[0] ?? "";
  if (provider === "opencode" && !versionAtLeast(line, OPENCODE_MIN_VERSION)) {
    return { status: "too-old", version: line };
  }
  const help = await exec({ argv: HELP_ARGV[provider], cwd, timeoutMs: 15_000 });
  if (help.code !== 0) return { status: "help-failed", version: line };
  const lacking = missingFlags(`${help.stdout}\n${help.stderr}`, provider);
  return lacking.length === 0
    ? { status: "ok", version: line }
    : { status: "flags", version: line, lacking };
};

/**
 * The provider CLIs the desk can run now, and the owner's Codex builder opt-in. The engine and
 * the jobs ask it before each run, so a missing CLI moves the run to another provider.
 */
export interface ProviderPort {
  readonly usable: () => Promise<ReadonlySet<Provider>>;
  /** A spawn found the CLI missing after a good probe: leave it out until the next probe. */
  readonly forget: (provider: Provider) => void;
  readonly allowCodexBuilder: () => boolean;
}

/** How long one probe of the provider CLIs counts. An install or an update shows within it. */
export const PROVIDER_PROBE_TTL_MS = 60_000;

export const createProviderPort = (deps: {
  readonly exec: Exec;
  readonly cwd: string;
  readonly clock: Clock;
  readonly allowCodexBuilder: () => boolean;
}): ProviderPort => {
  let cached: { readonly at: number; readonly usable: Promise<Set<Provider>> } | null = null;
  // Cleared by the next probe, so a CLI installed later comes back.
  const forgotten = new Set<Provider>();
  return {
    usable: async () => {
      const now = deps.clock.now().getTime();
      if (cached === null || now - cached.at >= PROVIDER_PROBE_TTL_MS) {
        forgotten.clear();
        cached = {
          at: now,
          usable: Promise.all(
            PROVIDERS.map(async (provider) => ({
              provider,
              probe: await probeProvider(deps.exec, deps.cwd, provider)
            }))
          ).then(
            (probes) =>
              new Set(probes.filter((entry) => entry.probe.status === "ok").map((e) => e.provider))
          )
        };
      }
      const usable = await cached.usable;
      return new Set([...usable].filter((provider) => !forgotten.has(provider)));
    },
    forget: (provider) => {
      forgotten.add(provider);
    },
    allowCodexBuilder: deps.allowCodexBuilder
  };
};
