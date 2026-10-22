import { lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { renderDocx } from "../docx/docx.render";
import { parseMarkdown } from "../markdown/markdown.parse";
import {
  DOC_KINDS,
  isDocKind,
  normalizePackage,
  verifyPackage,
  type DocKind
} from "../ooxml/ooxml.package";
import { renderPptx } from "../pptx/pptx.render";
import { RefusalError, resolveInput, resolveOutput } from "../safety/safety.paths";

/**
 * `pnpm doc:export`: Markdown to `.docx` or `.pptx`, and `--verify` for exported files.
 * Exit codes: 0 done, 1 refused or failed, 2 usage error. No network, no child processes.
 */

export const USAGE = `Usage:
  pnpm doc:export <input.md> --to docx|pptx --out <path>
  pnpm doc:export --verify <path>...

Paths are relative to the repository root. The input must be a .md file inside the
repository. The output must be inside the repository, end in .docx or .pptx to match --to,
and must not be inside a dot-directory, node_modules, or a path the Agent Desk protects.
--verify takes files or folders (folders are searched for .docx and .pptx files) and
passes only when every file is a ZIP with the parts Word or PowerPoint needs.
`;

export interface CliEnvironment {
  /** The repository the tool may read from and write to. */
  readonly repoRoot: string;
  /** Relative paths resolve against it. */
  readonly cwd: string;
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
}

class UsageError extends Error {}

/** Folders `--verify` never searches: Git data and installed packages. */
const SKIPPED_FOLDERS = new Set([".git", "node_modules"]);

const kindOfFile = (file: string): DocKind | null => {
  const extension = path.extname(file).slice(1).toLowerCase();
  return isDocKind(extension) ? extension : null;
};

/** The `.docx` and `.pptx` files under a folder, sorted. Symlinks are not followed. */
const findPackages = async (folder: string): Promise<string[]> => {
  const found: string[] = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory() && !SKIPPED_FOLDERS.has(entry.name)) {
      found.push(...(await findPackages(full)));
    } else if (entry.isFile() && kindOfFile(entry.name) !== null) {
      found.push(full);
    }
  }
  return found.sort();
};

const verify = async (targets: readonly string[], env: CliEnvironment): Promise<number> => {
  const files: string[] = [];
  let failed = false;
  for (const target of targets) {
    const full = path.resolve(env.cwd, target);
    let info;
    try {
      info = await lstat(full);
    } catch {
      env.out(`FAIL ${target}: does not exist\n`);
      failed = true;
      continue;
    }
    if (info.isDirectory()) files.push(...(await findPackages(full)));
    else files.push(full);
  }
  if (files.length === 0 && !failed) {
    env.out(`FAIL no .docx or .pptx files found in ${targets.join(", ")}\n`);
    return 1;
  }
  for (const file of files) {
    const shown = (path.relative(env.cwd, file) || file).split(path.sep).join("/");
    const kind = kindOfFile(file);
    if (kind === null) {
      env.out(`FAIL ${shown}: not a .docx or .pptx file\n`);
      failed = true;
      continue;
    }
    const result = await verifyPackage(await readFile(file), kind);
    if (result.ok) {
      env.out(`ok   ${shown} (${kind}, ${String(result.parts)} parts)\n`);
    } else {
      env.out(`FAIL ${shown}: ${result.reason}\n`);
      failed = true;
    }
  }
  return failed ? 1 : 0;
};

const exportFile = async (
  input: string,
  kind: DocKind,
  output: string,
  env: CliEnvironment
): Promise<number> => {
  const source = await resolveInput(env.repoRoot, env.cwd, input);
  const target = await resolveOutput(env.repoRoot, env.cwd, output, kind);
  const blocks = parseMarkdown(await readFile(source, "utf8"));
  const fallbackTitle = path.basename(source, path.extname(source));
  const bytes =
    kind === "docx"
      ? await renderDocx(blocks, fallbackTitle)
      : await renderPptx(blocks, fallbackTitle);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, await normalizePackage(bytes));
  env.out(`wrote ${path.relative(env.repoRoot, target).split(path.sep).join("/")}\n`);
  return 0;
};

const parse = (argv: readonly string[]) => {
  try {
    return parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        to: { type: "string" },
        out: { type: "string" },
        verify: { type: "boolean" },
        help: { type: "boolean", short: "h" }
      }
    });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : "invalid arguments");
  }
};

const dispatch = async (argv: readonly string[], env: CliEnvironment): Promise<number> => {
  const { values, positionals } = parse(argv);
  if (values.help === true) {
    env.out(USAGE);
    return 0;
  }
  if (values.verify === true) {
    if (values.to !== undefined || values.out !== undefined) {
      throw new UsageError("--verify takes no --to or --out");
    }
    if (positionals.length === 0) throw new UsageError("--verify needs at least one path");
    return verify(positionals, env);
  }
  const [input, ...extra] = positionals;
  if (input === undefined) throw new UsageError("Name the input Markdown file");
  if (extra.length > 0) throw new UsageError(`Unexpected arguments: ${extra.join(" ")}`);
  if (values.to === undefined || !isDocKind(values.to)) {
    throw new UsageError(`--to must be one of: ${DOC_KINDS.join(", ")}`);
  }
  if (values.out === undefined) throw new UsageError("--out is required");
  return exportFile(input, values.to, values.out, env);
};

export const runCli = async (argv: readonly string[], env: CliEnvironment): Promise<number> => {
  try {
    return await dispatch(argv, env);
  } catch (error) {
    if (error instanceof UsageError) {
      env.err(`Error: ${error.message}\n\n${USAGE}`);
      return 2;
    }
    if (error instanceof RefusalError) {
      env.err(`Refused: ${error.message}\n`);
      return 1;
    }
    env.err(`Error: ${error instanceof Error ? error.message : "unknown error"}\n`);
    return 1;
  }
};
