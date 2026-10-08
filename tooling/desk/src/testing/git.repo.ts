import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createExec, type Exec } from "../ports";

/** Real `Exec` with a git environment that ignores the developer's own git config. */
export const hermeticExec: Exec = (() => {
  const real = createExec();
  return (request) =>
    real({
      ...request,
      env: {
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_AUTHOR_NAME: "Desk Test",
        GIT_AUTHOR_EMAIL: "desk@example.test",
        GIT_COMMITTER_NAME: "Desk Test",
        GIT_COMMITTER_EMAIL: "desk@example.test",
        ...request.env
      }
    });
})();

export interface TestRepo {
  readonly dir: string;
  /** Run `git <args>` in the repo (or `cwd`), return trimmed stdout, throw on failure. */
  readonly git: (args: readonly string[], cwd?: string) => Promise<string>;
  /** Write a file, creating directories. */
  readonly write: (relative: string, content: string | Buffer) => Promise<void>;
  /** Stage everything and commit. Returns the new commit hash. */
  readonly commit: (message: string) => Promise<string>;
}

export interface TestScratch {
  /** Realpath of a fresh temporary directory. */
  readonly root: string;
  /** `git init` a repo at `root/<name>` with one commit on `main`. */
  readonly repo: (name: string) => Promise<TestRepo>;
  readonly cleanup: () => Promise<void>;
}

const bind = (dir: string): TestRepo => {
  const git: TestRepo["git"] = async (args, cwd = dir) => {
    const result = await hermeticExec({ argv: ["git", ...args], cwd });
    if (result.code !== 0) {
      throw new Error(`git ${args.join(" ")} failed (${result.code}): ${result.stderr}`);
    }
    return result.stdout.trim();
  };
  return {
    dir,
    git,
    write: async (relative, content) => {
      const file = path.join(dir, relative);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, content);
    },
    commit: async (message) => {
      await git(["add", "-A"]);
      await git(["commit", "--quiet", "-m", message]);
      return git(["rev-parse", "HEAD"]);
    }
  };
};

export const createScratch = async (): Promise<TestScratch> => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "desk-git-test-")));
  return {
    root,
    repo: async (name) => {
      const dir = path.join(root, name);
      await mkdir(dir, { recursive: true });
      const repo = bind(dir);
      await repo.git(["init", "--quiet", "-b", "main"]);
      await repo.write("README.md", "# fixture\n");
      await repo.commit("initial");
      return repo;
    },
    cleanup: () => rm(root, { recursive: true, force: true })
  };
};

/** A bare "origin" and a clone of it with `main` pushed, for fetch and `origin/main` tests. */
export const createOriginAndClone = async (
  scratch: TestScratch
): Promise<{ origin: TestRepo; clone: TestRepo }> => {
  const seed = await scratch.repo("seed");
  const originDir = path.join(scratch.root, "origin.git");
  await seed.git(["clone", "--quiet", "--bare", seed.dir, originDir], scratch.root);
  const cloneDir = path.join(scratch.root, "clone");
  await seed.git(["clone", "--quiet", originDir, cloneDir], scratch.root);
  return { origin: bind(originDir), clone: bind(cloneDir) };
};
