import { GitError } from "../git";
import { protectedPathReason } from "../policy";
import type { Exec } from "../ports";

/**
 * The patch that comes out of a container is untrusted input. Before the host
 * applies it, `guardPatch` asks Git itself which paths the patch touches (so the
 * guard sees what `git apply` will do, not what a header claims) and refuses:
 *
 * - a path in a protected place (`.git`, agent installs, hooks, workflows, secrets);
 * - a symbolic link or a submodule entry (mode 120000 or 160000);
 * - a patch above the size or file count limit;
 * - anything that is not a Git patch.
 *
 * A binary patch is fine: `git diff --binary` carries binary files as text.
 */

export const DEFAULT_MAX_PATCH_BYTES = 8 * 1024 * 1024;
export const DEFAULT_MAX_PATCH_FILES = 2000;

export interface PatchGuardOptions {
  readonly maxBytes: number;
  readonly maxFiles?: number;
}

export type PatchVerdict =
  | { readonly ok: true; readonly files: readonly string[]; readonly bytes: number }
  | { readonly ok: false; readonly reasons: readonly string[] };

const FORBIDDEN_MODES: ReadonlySet<string> = new Set(["120000", "160000"]);

/** Paths from `git apply --numstat -z`. A rename is `add\tdel\t\0old\0new\0`. */
export const parseNumstat = (output: string): string[] => {
  const tokens = output.split("\0");
  const paths: string[] = [];
  for (let index = 0; index < tokens.length;) {
    const record = tokens[index++];
    if (record === undefined || record === "") continue;
    const match = /^(?:\d+|-)\t(?:\d+|-)\t(.*)$/s.exec(record);
    if (match === null) throw new GitError("Unreadable numstat record", ["git", "apply"], 0);
    const inline = match[1] ?? "";
    if (inline !== "") {
      paths.push(inline);
    } else {
      const from = tokens[index++];
      const to = tokens[index++];
      if (from === undefined || to === undefined || from === "" || to === "") {
        throw new GitError("Truncated rename in numstat", ["git", "apply"], 0);
      }
      paths.push(from, to);
    }
  }
  return paths;
};

/** Modes and paths from `git apply --summary`. */
export const parseSummary = (output: string): { modes: string[]; paths: string[] } => {
  const modes: string[] = [];
  const paths: string[] = [];
  for (const line of output.split("\n")) {
    const create = /^ (?:create|delete) mode (\d+) (.+)$/.exec(line);
    if (create !== null) {
      modes.push(create[1] ?? "");
      paths.push(create[2] ?? "");
      continue;
    }
    const change = /^ mode change (\d+) => (\d+) (.+)$/.exec(line);
    if (change !== null) {
      modes.push(change[1] ?? "", change[2] ?? "");
      paths.push(change[3] ?? "");
    }
  }
  return { modes, paths };
};

const reject = (...reasons: string[]): PatchVerdict => ({ ok: false, reasons });

export const guardPatch = async (
  exec: Exec,
  cwd: string,
  patch: string,
  options: PatchGuardOptions
): Promise<PatchVerdict> => {
  const bytes = Buffer.byteLength(patch, "utf8");
  if (bytes === 0) return { ok: true, files: [], bytes };
  if (bytes > options.maxBytes) {
    return reject(`The patch is ${bytes} bytes. The limit is ${options.maxBytes} bytes.`);
  }
  if (!patch.startsWith("diff --git ")) return reject("The output is not a Git patch.");
  if (patch.includes("\0")) return reject("The patch holds a NUL byte.");

  const ask = async (flags: readonly string[]): Promise<string> => {
    const result = await exec({
      argv: ["git", "apply", ...flags],
      cwd,
      input: patch,
      env: { GIT_TERMINAL_PROMPT: "0" },
      timeoutMs: 60_000
    });
    if (result.code !== 0) {
      throw new GitError(
        `git apply ${flags[0] ?? ""} could not read the patch: ${result.stderr.trim().slice(-300)}`,
        ["git", "apply", ...flags],
        result.code
      );
    }
    return result.stdout;
  };

  let paths: string[];
  let modes: string[];
  try {
    const numstat = parseNumstat(await ask(["--numstat", "-z"]));
    const summary = parseSummary(await ask(["--summary"]));
    paths = [...new Set([...numstat, ...summary.paths])];
    modes = summary.modes;
  } catch (error) {
    return reject(error instanceof Error ? error.message : "Git could not read the patch.");
  }

  const reasons: string[] = [];
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_PATCH_FILES;
  if (paths.length > maxFiles)
    reasons.push(`The patch touches ${paths.length} files. The limit is ${maxFiles}.`);
  for (const file of paths) {
    const reason = protectedPathReason(file);
    if (reason !== null) reasons.push(`Protected path: ${reason}.`);
  }
  const bad = modes.filter((mode) => FORBIDDEN_MODES.has(mode));
  if (bad.length > 0) reasons.push("The patch adds or changes a symbolic link or a submodule.");
  return reasons.length > 0 ? reject(...reasons) : { ok: true, files: paths.sort(), bytes };
};

/** Apply a guarded patch to the worktree. `git apply` is all or nothing. */
export const applyPatch = async (exec: Exec, worktree: string, patch: string): Promise<void> => {
  if (patch === "") return;
  const result = await exec({
    argv: ["git", "apply", "--binary", "--whitespace=nowarn"],
    cwd: worktree,
    input: patch,
    env: { GIT_TERMINAL_PROMPT: "0" },
    timeoutMs: 120_000
  });
  if (result.code !== 0) {
    throw new GitError(
      `The container patch does not apply to the worktree: ${result.stderr.trim().slice(-300)}`,
      ["git", "apply"],
      result.code
    );
  }
};
