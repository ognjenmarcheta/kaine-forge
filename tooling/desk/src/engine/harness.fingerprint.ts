import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { HarnessFingerprint } from "../contracts";

/**
 * The files an agent reads from its checkout besides the task: the project instructions,
 * the role definitions, the review checklist, the permission rules and the installed
 * skills. A change in any of them is a new harness version.
 */
const REPO_FILES = ["AGENTS.md", "CLAUDE.md", ".ai/review.md", ".ai/permissions.json"] as const;
const ROLE_DIR = ".ai/agents";
const SKILLS_DIR = ".agents/skills";

/** A file under a stable name: the name goes into the hash, so a rename or a move is a change. */
interface NamedFile {
  readonly name: string;
  readonly file: string;
}

const isMissing = (error: unknown): boolean =>
  error instanceof Error &&
  "code" in error &&
  (error.code === "ENOENT" || error.code === "ENOTDIR");

const entriesOf = async (dir: string) => {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
};

/** sha256 over the files in name order. A missing file hashes as missing, so adding one is a change. */
const hashFiles = async (files: readonly NamedFile[]): Promise<string> => {
  const hash = createHash("sha256");
  const byName = (a: NamedFile, b: NamedFile): number =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  for (const { name, file } of [...files].sort(byName)) {
    let content = "<missing>";
    try {
      content = (await readFile(file, "utf8")).replaceAll("\r\n", "\n");
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    hash.update(name).update("\0").update(content).update("\0");
  }
  return hash.digest("hex");
};

/** The instruction files of a checkout, named by their repo path. */
const repoInstructionFiles = async (checkout: string): Promise<NamedFile[]> => {
  const named = (name: string): NamedFile => ({ name, file: path.join(checkout, name) });
  const roles = (await entriesOf(path.join(checkout, ROLE_DIR)))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => named(`${ROLE_DIR}/${entry.name}`));
  const skills = (await entriesOf(path.join(checkout, SKILLS_DIR)))
    .filter((entry) => entry.isDirectory())
    .map((entry) => named(`${SKILLS_DIR}/${entry.name}/SKILL.md`));
  return [...REPO_FILES.map(named), ...roles, ...skills];
};

/**
 * The harness a run starts with. Take it before the agent runs: a builder may edit these
 * files, and the record must name the instructions the agent was given.
 */
/** The `repo` part alone: the hash of what an agent would read in this checkout now. */
export const repoFingerprint = async (checkout: string): Promise<string> =>
  hashFiles(await repoInstructionFiles(checkout));

export const harnessFingerprint = async (
  checkout: string,
  deskFiles: readonly string[],
  headSha: (cwd: string) => Promise<string>
): Promise<HarnessFingerprint> => ({
  repo: await repoFingerprint(checkout),
  desk: await hashFiles(deskFiles.map((file) => ({ name: path.basename(file), file }))),
  head: await headSha(checkout)
});
