import { stat } from "node:fs/promises";
import path from "node:path";

import type { Exec } from "../ports";

/** Where the built UI lands, relative to the repository root. */
export const DEFAULT_UI_DIR = path.join("tooling", "desk-ui", "dist");

/** The command that builds the UI. An argv, never a shell string. */
export const UI_BUILD_ARGV = ["pnpm", "--filter", "@repo/desk-ui", "build"] as const;

const UI_BUILD_TIMEOUT_MS = 5 * 60_000;
const TAIL_LINES = 12;

const isFile = async (file: string): Promise<boolean> => {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
};

/** A build exists when its entry page does. An empty `dist` folder is not a build. */
export const hasBuiltUi = (uiDir: string): Promise<boolean> =>
  isFile(path.join(uiDir, "index.html"));

export interface EnsureUiOptions {
  readonly exec: Exec;
  readonly repoRoot: string;
  /** Terminal output for the engineer. */
  readonly print: (text: string) => void;
}

/**
 * The built UI directory, or `null` when there is none. A missing build is
 * made first (`pnpm --filter @repo/desk-ui build`), with a message, so
 * `pnpm desk serve` works on a fresh clone. A failed build does not stop the
 * server: the API still works, and the message says how to see the error.
 */
export const ensureUiBuilt = async (options: EnsureUiOptions): Promise<string | null> => {
  const uiDir = path.join(options.repoRoot, DEFAULT_UI_DIR);
  if (await hasBuiltUi(uiDir)) return uiDir;

  options.print(`The desk UI is not built. Building it: ${UI_BUILD_ARGV.join(" ")}\n`);
  const result = await options.exec({
    argv: UI_BUILD_ARGV,
    cwd: options.repoRoot,
    timeoutMs: UI_BUILD_TIMEOUT_MS
  });
  if (result.code === 0 && (await hasBuiltUi(uiDir))) {
    options.print("Built the desk UI.\n");
    return uiDir;
  }

  const reason = result.timedOut ? "it timed out" : `it exited with code ${result.code ?? "none"}`;
  const tail = `${result.stderr}\n${result.stdout}`
    .split("\n")
    .filter((line) => line.trim() !== "")
    .slice(-TAIL_LINES)
    .join("\n");
  options.print(
    `The UI build failed (${reason}). The server runs without the UI. Run \`${UI_BUILD_ARGV.join(" ")}\` to see the error.\n${tail === "" ? "" : `${tail}\n`}`
  );
  return null;
};
