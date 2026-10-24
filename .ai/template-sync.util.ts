// The manifest's `self` files (this module, template-sync.ts, template-adoption.util.ts) are
// updated first and then re-run, so they import only each other, node built-ins, and zod.
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";

import {
  applyTemplateAdoption,
  parseTemplateAdoptionConfig,
  type TemplateAdoptionConfig
} from "./template-adoption.util";

export const TEMPLATE_UPSTREAM_URL = "https://github.com/ognjenmarcheta/kaine-forge.git";
export const TEMPLATE_UPSTREAM_REF = "main";
/** Project-owned AI sources. Upstream never ships this folder and sync never writes it. */
export const PROJECT_AI_PATH = ".ai/project";
export const TEMPLATE_CONFIG_PATH = `${PROJECT_AI_PATH}/template.json`;
export const SYNC_MANIFEST_PATH = ".ai/template-sync.manifest.json";
export const CONFLICT_MARKER = "<<<<<<< local";

const COMMIT_PATTERN = /^[0-9a-f]{40}$/;

const templateConfigSchema = z.object({
  schemaVersion: z.literal(1),
  adoption: z.record(z.string(), z.unknown()),
  upstream: z.object({ url: z.string().min(1), ref: z.string().min(1) }),
  base: z.string().regex(COMMIT_PATTERN).optional()
});

export interface TemplateConfig {
  schemaVersion: 1;
  adoption: TemplateAdoptionConfig;
  upstream: { url: string; ref: string };
  /** Upstream commit the project last synced from. Absent until the first sync resolves it. */
  base?: string;
}

export const parseTemplateConfig = (raw: unknown): TemplateConfig => {
  const parsed = templateConfigSchema.parse(raw);
  return {
    schemaVersion: 1,
    adoption: parseTemplateAdoptionConfig(parsed.adoption),
    upstream: parsed.upstream,
    ...(parsed.base ? { base: parsed.base } : {})
  };
};

export const renderTemplateConfig = (config: TemplateConfig): string =>
  `${JSON.stringify(config, null, 2)}\n`;

export const readTemplateConfig = (file: string): TemplateConfig | null =>
  existsSync(file) ? parseTemplateConfig(JSON.parse(readFileSync(file, "utf8"))) : null;

/** Adoption record for a project: keeps the upstream and base of an earlier record. */
export const nextTemplateConfig = (
  adoption: TemplateAdoptionConfig,
  previous: TemplateConfig | null
): TemplateConfig => ({
  schemaVersion: 1,
  adoption,
  upstream: previous?.upstream ?? { url: TEMPLATE_UPSTREAM_URL, ref: TEMPLATE_UPSTREAM_REF },
  ...(previous?.base ? { base: previous.base } : {})
});

const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  self: z.array(z.string().min(1)),
  paths: z.array(z.string().startsWith(".ai/"))
});

/** Upstream's list of synced files. Entries ending in `/` cover a whole folder. */
export type SyncManifest = z.infer<typeof manifestSchema>;

export const manifestIncludes = (entries: readonly string[], path: string): boolean =>
  !path.startsWith(`${PROJECT_AI_PATH}/`) &&
  entries.some((entry) => (entry.endsWith("/") ? path.startsWith(entry) : path === entry));

export const parseSyncManifest = (raw: unknown): SyncManifest => {
  const manifest = manifestSchema.parse(raw);
  const outside = manifest.self.filter((path) => !manifestIncludes(manifest.paths, path));
  if (outside.length > 0) {
    throw new Error(`sync manifest 'self' entries are not in 'paths': ${outside.join(", ")}`);
  }
  return manifest;
};

export type SyncOutcome = "updated" | "added" | "deleted" | "merged" | "conflict" | "skipped";

export interface SyncChange {
  path: string;
  outcome: SyncOutcome;
  /** Text to write; null deletes the file; undefined leaves the local file as it is. */
  content?: string | null;
  note?: string;
}

export type MergeText = (
  local: string,
  base: string,
  upstream: string
) => { content: string; conflict: boolean };

/**
 * Plans a 3-way update of the synced files. Base and target are upstream snapshots; both
 * get the project's adoption rename first, so identity strings never count as a change.
 */
export const planSync = (input: {
  base: ReadonlyMap<string, string>;
  target: ReadonlyMap<string, string>;
  local: ReadonlyMap<string, string>;
  paths: readonly string[];
  adoption: TemplateAdoptionConfig;
  merge: MergeText;
}): SyncChange[] => {
  const base = applyTemplateAdoption(input.base, input.adoption).files;
  const target = applyTemplateAdoption(input.target, input.adoption).files;
  const candidates = [...new Set([...base.keys(), ...target.keys()])]
    .filter((path) => manifestIncludes(input.paths, path))
    .sort();
  const changes: SyncChange[] = [];

  for (const path of candidates) {
    const before = base.get(path);
    const after = target.get(path);
    const local = input.local.get(path);

    if (before === after || local === after) continue;
    if (after === undefined) {
      if (local === undefined) continue;
      changes.push(
        local === before
          ? { path, outcome: "deleted", content: null }
          : { path, outcome: "skipped", note: "deleted upstream; kept your edited copy" }
      );
      continue;
    }
    if (local === undefined) {
      changes.push(
        before === undefined
          ? { path, outcome: "added", content: after }
          : { path, outcome: "skipped", note: "deleted locally; upstream changed it" }
      );
      continue;
    }
    if (local === before) {
      changes.push({ path, outcome: "updated", content: after });
      continue;
    }

    const merged = input.merge(local, before ?? "", after);
    changes.push({
      path,
      outcome: merged.conflict ? "conflict" : "merged",
      content: merged.content
    });
  }

  return changes;
};

export interface UpstreamCommit {
  sha: string;
  tree: string;
  committedAt: number;
}

/**
 * Finds the upstream commit a project started from: shared history first, then a root
 * commit with the same tree ("Use this template"), then the last commit before the root.
 */
export const guessBase = (input: {
  mergeBase: string | null;
  upstream: readonly UpstreamCommit[];
  localRoot: { tree: string; committedAt: number };
}): { sha: string; method: "merge-base" | "tree" | "date" } | null => {
  if (input.mergeBase) return { sha: input.mergeBase, method: "merge-base" };
  const sameTree = input.upstream.find((commit) => commit.tree === input.localRoot.tree);
  if (sameTree) return { sha: sameTree.sha, method: "tree" };
  const before = input.upstream
    .filter((commit) => commit.committedAt <= input.localRoot.committedAt)
    .sort((left, right) => right.committedAt - left.committedAt)[0];
  return before ? { sha: before.sha, method: "date" } : null;
};

export const findConflictMarkers = (files: ReadonlyMap<string, string>): string[] =>
  [...files]
    .filter(([, content]) => content.split(/\r?\n/).includes(CONFLICT_MARKER))
    .map(([path]) => path)
    .sort();

const git = (root: string, args: string[]): string =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"]
  });

const tryGit = (root: string, args: string[]): string | null => {
  try {
    return git(root, args);
  } catch {
    return null;
  }
};

/** Fetches an upstream ref or commit without adding a remote and returns its commit SHA. */
export const fetchUpstream = (root: string, url: string, ref: string): string => {
  if (/^[0-9a-f]{40}$/.test(ref) && tryGit(root, ["cat-file", "-e", `${ref}^{commit}`]) !== null) {
    return ref;
  }
  git(root, ["fetch", "--no-tags", "--quiet", url, ref]);
  return git(root, ["rev-parse", "FETCH_HEAD^{commit}"]).trim();
};

export const resolveBase = (root: string, target: string): ReturnType<typeof guessBase> => {
  const upstream = git(root, ["log", "--format=%H %T %ct", target])
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha = "", tree = "", committedAt = "0"] = line.split(" ");
      return { sha, tree, committedAt: Number(committedAt) };
    });
  const roots = git(root, ["log", "--max-parents=0", "--format=%T %ct", "HEAD"]).trim().split("\n");
  const [tree = "", committedAt = "0"] = (roots.at(-1) ?? "").split(" ");
  return guessBase({
    mergeBase: tryGit(root, ["merge-base", "HEAD", target])?.trim() || null,
    upstream,
    localRoot: { tree, committedAt: Number(committedAt) }
  });
};

export const readSyncManifest = (root: string, commit: string): SyncManifest => {
  const raw = tryGit(root, ["show", `${commit}:${SYNC_MANIFEST_PATH}`]);
  if (raw === null) throw new Error(`upstream ${commit.slice(0, 12)} has no ${SYNC_MANIFEST_PATH}`);
  return parseSyncManifest(JSON.parse(raw));
};

export const readCommitFiles = (
  root: string,
  commit: string,
  paths: readonly string[]
): Map<string, string> => {
  const files = new Map<string, string>();
  for (const path of git(root, ["ls-tree", "-r", "-z", "--name-only", commit, "--", ".ai"]).split(
    "\0"
  )) {
    if (path && manifestIncludes(paths, path))
      files.set(path, git(root, ["show", `${commit}:${path}`]));
  }
  return files;
};

export const readLocalFiles = (root: string, paths: Iterable<string>): Map<string, string> => {
  const files = new Map<string, string>();
  for (const path of paths) {
    const file = join(root, path);
    if (existsSync(file)) files.set(path, readFileSync(file, "utf8"));
  }
  return files;
};

/** Uncommitted or untracked paths among the given ones. */
export const dirtyPaths = (root: string, paths: readonly string[]): string[] =>
  paths.length === 0
    ? []
    : git(root, ["status", "--porcelain", "--untracked-files=all", "--", ...paths])
        .split("\n")
        .filter(Boolean)
        .map((line) => line.slice(3));

export const mergeWithGit: MergeText = (local, base, upstream) => {
  const dir = mkdtempSync(join(tmpdir(), "kaine-sync-merge-"));
  try {
    const files = { local, base, upstream };
    for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
    const result = spawnSync(
      "git",
      [
        "merge-file",
        "-p",
        "-L",
        "local",
        "-L",
        "base",
        "-L",
        "upstream",
        "local",
        "base",
        "upstream"
      ],
      { cwd: dir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    );
    if (result.status === null || result.status > 127) {
      throw new Error(`git merge-file failed: ${result.stderr || result.error?.message}`);
    }
    return { content: result.stdout, conflict: result.status > 0 };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

export const writeSyncChanges = (root: string, changes: readonly SyncChange[]): void => {
  for (const change of changes) {
    const file = join(root, change.path);
    if (change.content === null) {
      if (existsSync(file)) unlinkSync(file);
    } else if (change.content !== undefined) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, change.content);
    }
  }
};

/** Local files covered by the synced paths of a manifest. */
export const listLocalSyncedFiles = (root: string, paths: readonly string[]): string[] =>
  readdirSync(join(root, ".ai"), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      join(entry.parentPath, entry.name)
        .slice(root.length + 1)
        .replace(/\\/g, "/")
    )
    .filter((path) => manifestIncludes(paths, path))
    .sort();
