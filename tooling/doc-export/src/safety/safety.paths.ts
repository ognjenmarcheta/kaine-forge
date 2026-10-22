import { protectedPathReason } from "@repo/desk";
import { lstat, realpath, stat } from "node:fs/promises";
import path from "node:path";

import type { DocKind } from "../ooxml/ooxml.package";

/**
 * Where an export may read and write. Agents run the tool through Bash, so the tool holds its
 * own line: the input is a `.md` file inside the repository, and the output is a file of the
 * requested kind inside the repository, outside every dot-directory and `node_modules`, and
 * not a path the Agent Desk protects. Real paths decide, so `..` and symlinks cannot leave
 * the repository.
 */

/** The tool refuses a path. Its message names the path and the rule. */
export class RefusalError extends Error {
  override readonly name = "RefusalError";
}

const errorCode = (error: unknown): string | undefined =>
  error instanceof Error && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;

/** `target` relative to `root`, or `null` when it is outside. */
const insideRoot = (root: string, target: string): string | null => {
  const relative = path.relative(root, target);
  if (relative === "" || path.isAbsolute(relative)) return null;
  if (relative === ".." || relative.startsWith(`..${path.sep}`)) return null;
  return relative;
};

/** The real path of an input Markdown file inside the repository. */
export const resolveInput = async (repoRoot: string, cwd: string, input: string) => {
  if (path.extname(input).toLowerCase() !== ".md") {
    throw new RefusalError(`Input '${input}' is not a Markdown (.md) file`);
  }
  const root = await realpath(repoRoot);
  let real: string;
  try {
    real = await realpath(path.resolve(cwd, input));
  } catch (error) {
    if (errorCode(error) === "ENOENT") throw new RefusalError(`Input '${input}' does not exist`);
    throw error;
  }
  if (insideRoot(root, real) === null) {
    throw new RefusalError(`Input '${input}' is outside the repository`);
  }
  if (!(await stat(real)).isFile()) throw new RefusalError(`Input '${input}' is not a file`);
  return real;
};

/** The nearest path at or above `target` that exists, and the segments below it. */
const existingAncestor = async (
  target: string
): Promise<{ readonly base: string; readonly rest: readonly string[] }> => {
  const rest: string[] = [];
  let current = target;
  for (;;) {
    try {
      await lstat(current);
      return { base: current, rest };
    } catch (error) {
      if (errorCode(error) !== "ENOENT") throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) return { base: current, rest };
    rest.unshift(path.basename(current));
    current = parent;
  }
};

/** The real path an export of `kind` may write, inside the repository. */
export const resolveOutput = async (
  repoRoot: string,
  cwd: string,
  output: string,
  kind: DocKind
) => {
  if (path.extname(output).toLowerCase() !== `.${kind}`) {
    throw new RefusalError(`Output '${output}' must end in .${kind}`);
  }
  const root = await realpath(repoRoot);
  const { base, rest } = await existingAncestor(path.resolve(cwd, output));
  // An existing output must be a plain file: never a symlink to follow, never a folder.
  if (rest.length === 0) {
    const existing = await lstat(base);
    if (existing.isSymbolicLink() || !existing.isFile()) {
      throw new RefusalError(`Output '${output}' exists and is not a regular file`);
    }
  }
  const target = path.join(await realpath(base), ...rest);
  const relative = insideRoot(root, target);
  if (relative === null) throw new RefusalError(`Output '${output}' is outside the repository`);

  const segments = relative.split(path.sep);
  const folders = segments.slice(0, -1);
  if (folders.some((segment) => segment.startsWith("."))) {
    throw new RefusalError(`Output '${output}' is inside a dot-directory`);
  }
  if (segments.some((segment) => segment.toLowerCase() === "node_modules")) {
    throw new RefusalError(`Output '${output}' is inside node_modules`);
  }
  const reason = protectedPathReason(segments.join("/"));
  if (reason !== null) throw new RefusalError(`Output '${output}' is protected: ${reason}`);
  return target;
};
