import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import type { PlannerOutput } from "../contracts";

/**
 * The release-metadata rule of this repository, as code. The source of truth
 * is the `changeset-required` job in `.github/workflows/ci-pr.yml`:
 *
 * - "source" files are `apps/**`, `packages/**` and `tooling/**`;
 * - a changeset is any changed `.changeset/*.md`;
 * - a PR with source changes and no changeset fails, unless it carries the
 *   label `release:skip-changeset`.
 *
 * Docs, `.ai/`, `.github/` and root-config changes need neither. The rule is
 * replicated here (the job runs only in CI), and `ship.changeset.test.ts`
 * reads the workflow so the two cannot drift apart unseen.
 */

export const SKIP_CHANGESET_LABEL = "release:skip-changeset";
export const CHANGESET_DIR = ".changeset";

const SOURCE_ROOTS = ["apps", "packages", "tooling"] as const;

export const BUMPS = ["patch", "minor", "major"] as const;
export type Bump = (typeof BUMPS)[number];

const isSourceFile = (file: string): boolean =>
  SOURCE_ROOTS.some((root) => file.startsWith(`${root}/`));

/** `.changeset/*.md`: one directory level, like the workflow filter. */
const isChangesetFile = (file: string): boolean => /^\.changeset\/[^/]+\.md$/.test(file);

// --- workspaces ------------------------------------------------------------

export interface WorkspacePackage {
  readonly name: string;
  /** Repo-relative POSIX directory. */
  readonly dir: string;
  readonly private: boolean;
}

const packageJsonSchema = z.object({
  name: z.string().min(1),
  private: z.boolean().optional()
});

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

/** The `packages:` globs of `pnpm-workspace.yaml`. Only `dir/*` and exact `dir` are supported. */
const workspacePatterns = (yaml: string): string[] => {
  const patterns: string[] = [];
  let inPackages = false;
  for (const line of yaml.split(/\r?\n/)) {
    if (/^packages:\s*(#.*)?$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;
    const item = /^\s+-\s+(.+?)\s*(?:#.*)?$/.exec(line);
    if (item?.[1] !== undefined) {
      patterns.push(item[1].replace(/^["']|["']$/g, ""));
    } else if (line.trim() !== "" && !/^\s/.test(line) && !line.trimStart().startsWith("#")) {
      break;
    }
  }
  return patterns;
};

const readPackage = async (root: string, dir: string): Promise<WorkspacePackage | null> => {
  let text: string;
  try {
    text = await readFile(path.join(root, dir, "package.json"), "utf8");
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${dir}/package.json is not valid JSON`);
  }
  const parsed = packageJsonSchema.safeParse(json);
  if (!parsed.success) throw new Error(`${dir}/package.json has no package name`);
  return { name: parsed.data.name, dir, private: parsed.data.private === true };
};

/** Every workspace package of the repository at `root`, sorted by directory. */
export const discoverWorkspaces = async (root: string): Promise<WorkspacePackage[]> => {
  const yaml = await readFile(path.join(root, "pnpm-workspace.yaml"), "utf8");
  const dirs = new Set<string>();
  for (const pattern of workspacePatterns(yaml)) {
    if (/^[\w.-]+(?:\/[\w.-]+)*$/.test(pattern)) {
      dirs.add(pattern);
    } else if (/^[\w.-]+(?:\/[\w.-]+)*\/\*$/.test(pattern)) {
      const parent = pattern.slice(0, -2);
      const entries = await readdir(path.join(root, parent), { withFileTypes: true }).catch(
        (error: unknown) => {
          if (isMissing(error)) return [];
          throw error;
        }
      );
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith(".")) dirs.add(`${parent}/${entry.name}`);
      }
    } else {
      throw new Error(`Unsupported workspace pattern '${pattern}' in pnpm-workspace.yaml`);
    }
  }
  const found: WorkspacePackage[] = [];
  for (const dir of [...dirs].sort()) {
    const workspace = await readPackage(root, dir);
    if (workspace !== null) found.push(workspace);
  }
  return found;
};

/** Names of the workspaces that own the changed files (the longest directory wins). */
export const changedWorkspaces = (
  files: readonly string[],
  workspaces: readonly WorkspacePackage[]
): string[] => {
  const owners = new Set<string>();
  for (const file of files) {
    const owner = workspaces
      .filter((workspace) => file.startsWith(`${workspace.dir}/`))
      .sort((left, right) => right.dir.length - left.dir.length)[0];
    if (owner !== undefined) owners.add(owner.name);
  }
  return [...owners].sort();
};

// --- decision --------------------------------------------------------------

export type ChangesetDecision =
  /** No changeset and no label are needed. */
  | { readonly kind: "none"; readonly reason: string }
  /** The engine writes `.changeset/<slug>.md`. */
  | {
      readonly kind: "file";
      readonly packages: readonly string[];
      readonly bump: Bump;
      readonly reason: string;
      /** Changed packages the plan did not list. The PR body shows them as a risk. */
      readonly unlisted: readonly string[];
    }
  /** The engine adds `release:skip-changeset` to the PR. */
  | { readonly kind: "skip-label"; readonly label: string; readonly reason: string }
  /** The plan names packages that are not workspaces. The engine must not guess. */
  | { readonly kind: "invalid"; readonly unknown: readonly string[]; readonly reason: string };

export const changesetDecision = (
  changedFiles: readonly string[],
  plan: Pick<PlannerOutput, "changeset">,
  workspaces: readonly WorkspacePackage[]
): ChangesetDecision => {
  if (!changedFiles.some(isSourceFile)) {
    return {
      kind: "none",
      reason: "No file under apps/, packages/ or tooling/ changed, so no changeset is needed."
    };
  }
  if (changedFiles.some(isChangesetFile)) {
    return { kind: "none", reason: "The change already carries a .changeset/*.md file." };
  }

  const { required, packages, bump } = plan.changeset;
  if (!required) {
    return {
      kind: "skip-label",
      label: SKIP_CHANGESET_LABEL,
      reason: "The plan marks this change as not releasable."
    };
  }

  const known = new Set(workspaces.map((workspace) => workspace.name));
  const unknown = packages.filter((name) => !known.has(name));
  if (unknown.length > 0) {
    return {
      kind: "invalid",
      unknown,
      reason: `The plan names packages that are not workspaces: ${unknown.join(", ")}.`
    };
  }
  const listed = new Set(packages);
  return {
    kind: "file",
    packages: [...listed].sort(),
    bump,
    reason: `The plan asks for a ${bump} changeset.`,
    unlisted: changedWorkspaces(changedFiles, workspaces).filter((name) => !listed.has(name))
  };
};

// --- file ------------------------------------------------------------------

const RESERVED_NAMES: ReadonlySet<string> = new Set(["readme", "config"]);

/** `<slug>.md`. A name that collides with `README.md` or `config` (case-insensitively) gets a suffix. */
export const changesetFileName = (slug: string): string => {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new RangeError(
      `Changeset name must be lower-case words joined by hyphens, got '${slug}'`
    );
  }
  return `${RESERVED_NAMES.has(slug) ? `${slug}-change` : slug}.md`;
};

export const changesetRelativePath = (slug: string): string =>
  `${CHANGESET_DIR}/${changesetFileName(slug)}`;

const SUMMARY_MAX_CHARS = 300;

/** One or two sentences of `text`, short enough for a changelog line. */
export const summarizeForChangeset = (text: string): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat === "") throw new RangeError("A changeset needs a summary");
  const sentences = flat.split(/(?<=[.!?])\s+/);
  let summary = sentences.slice(0, 2).join(" ");
  if (summary.length > SUMMARY_MAX_CHARS) summary = sentences[0] ?? summary;
  if (summary.length > SUMMARY_MAX_CHARS) {
    summary = `${summary.slice(0, SUMMARY_MAX_CHARS).replace(/\s+\S*$/, "")}`;
  }
  return /[.!?]$/.test(summary) ? summary : `${summary}.`;
};

export interface RenderChangesetInput {
  readonly packages: readonly string[];
  readonly bump: Bump;
  readonly summary: string;
}

/** The `.changeset/<name>.md` text. `pnpm changeset` is interactive, so the engine writes this form. */
export const renderChangeset = ({ packages, bump, summary }: RenderChangesetInput): string => {
  if (packages.length === 0) throw new RangeError("A changeset names at least one package");
  if (!BUMPS.includes(bump)) throw new RangeError(`Unknown bump '${bump}'`);
  for (const name of packages) {
    if (!/^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name)) {
      throw new RangeError(`Invalid package name '${name}'`);
    }
  }
  const front = [...new Set(packages)].sort().map((name) => `"${name}": ${bump}`);
  return ["---", ...front, "---", "", summarizeForChangeset(summary), ""].join("\n");
};
