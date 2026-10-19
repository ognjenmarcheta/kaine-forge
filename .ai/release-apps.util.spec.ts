import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { runReleaseApps } from "./release-apps.util";

// The runner spawns git with the worker's environment, so the hermetic settings
// live in process.env for the duration of this file: no developer config, a
// fixed identity, and no system config. Git for Windows maps /dev/null itself and
// rejects os.devNull's `\\.\nul`, so the POSIX literal is the portable spelling.
const HERMETIC_GIT_ENV = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Release Test",
  GIT_AUTHOR_EMAIL: "release@example.test",
  GIT_COMMITTER_NAME: "Release Test",
  GIT_COMMITTER_EMAIL: "release@example.test"
};

const git = (cwd: string, args: string[]): string =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const write = (dir: string, relativePath: string, content: string): void => {
  const target = path.join(dir, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
};

const commitAll = (dir: string, message: string): string => {
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", message]);
  return git(dir, ["rev-parse", "HEAD"]);
};

const refOnOrigin = (origin: string, ref: string): string | null => {
  try {
    return git(origin, ["rev-parse", "--verify", "-q", ref]);
  } catch {
    return null;
  }
};

/** A commit under apps/api in `dir`, pushed to origin/main, so the api app is affected. */
const pushApiChange = (dir: string, name: string): string => {
  write(dir, `apps/api/src/${name}.ts`, `export const ${name} = true;\n`);
  const sha = commitAll(dir, `feat(api): ${name}`);
  git(dir, ["push", "-q", "origin", "main"]);
  return sha;
};

describe("runReleaseApps against a real repository", () => {
  let root: string;
  let origin: string;
  let clone: string;

  beforeAll(() => {
    for (const [key, value] of Object.entries(HERMETIC_GIT_ENV)) vi.stubEnv(key, value);
  });
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    // Git prints real paths; macOS tmpdir() is a symlink, so compare real paths only.
    root = realpathSync(mkdtempSync(path.join(tmpdir(), "release-apps-")));
    const seed = path.join(root, "seed");
    mkdirSync(seed);
    git(seed, ["init", "-q", "-b", "main"]);
    write(seed, "Dockerfile.api", "FROM scratch\n");
    write(seed, "apps/api/package.json", `${JSON.stringify({ name: "@repo/api" })}\n`);
    write(seed, "apps/api/src/index.ts", "export {};\n");
    write(seed, "docs/README.md", "# fixture\n");
    commitAll(seed, "chore: seed the fixture");

    origin = path.join(root, "origin.git");
    git(root, ["clone", "-q", "--bare", seed, origin]);
    clone = path.join(root, "clone");
    git(root, ["clone", "-q", origin, clone]);
  });

  afterEach(() => {
    if (!path.dirname(root).startsWith(realpathSync(tmpdir()))) {
      throw new Error("Unsafe test cleanup");
    }
    rmSync(root, { recursive: true, force: true });
  });

  it("creates the release branch on origin at HEAD, then fast-forwards it on the next run", () => {
    const first = pushApiChange(clone, "first");

    const created = runReleaseApps(
      { apps: [], dryRun: false },
      { repoRoot: clone, stdio: "ignore" }
    );

    expect(created.status).toBe("updated");
    if (created.status !== "updated") return;
    expect(created.plans.map((plan) => [plan.app.app, plan.action, plan.reason])).toEqual([
      ["api", "create", "affected"]
    ]);
    expect(refOnOrigin(origin, "refs/heads/release/api")).toBe(first);

    const second = pushApiChange(clone, "second");
    const updated = runReleaseApps(
      { apps: [], dryRun: false },
      { repoRoot: clone, stdio: "ignore" }
    );

    expect(updated.status).toBe("updated");
    if (updated.status !== "updated") return;
    expect(updated.plans.map((plan) => [plan.action, plan.baseRef])).toEqual([
      ["update", "refs/remotes/origin/release/api"]
    ]);
    expect(refOnOrigin(origin, "refs/heads/release/api")).toBe(second);
  });

  it("skips an app whose files did not change since its release branch", () => {
    pushApiChange(clone, "first");
    runReleaseApps({ apps: [], dryRun: false }, { repoRoot: clone, stdio: "ignore" });
    const releaseSha = refOnOrigin(origin, "refs/heads/release/api");

    write(clone, "docs/README.md", "# fixture\n\nDocs only.\n");
    commitAll(clone, "docs: unrelated change");
    git(clone, ["push", "-q", "origin", "main"]);

    const outcome = runReleaseApps(
      { apps: [], dryRun: false },
      { repoRoot: clone, stdio: "ignore" }
    );

    expect(outcome.status).toBe("no-updates");
    expect(refOnOrigin(origin, "refs/heads/release/api")).toBe(releaseSha);
  });

  it("plans without pushing on a dry run", () => {
    pushApiChange(clone, "first");
    const seen: string[] = [];

    const outcome = runReleaseApps(
      { apps: [], dryRun: true },
      {
        repoRoot: clone,
        stdio: "ignore",
        onPlans: (plans) => seen.push(...plans.map((p) => p.app.app))
      }
    );

    expect(outcome.status).toBe("planned");
    expect(seen).toEqual(["api"]);
    expect(refOnOrigin(origin, "refs/heads/release/api")).toBeNull();
  });

  it("does nothing when origin/main advanced past HEAD", () => {
    pushApiChange(clone, "first");
    const other = path.join(root, "other");
    git(root, ["clone", "-q", origin, other]);
    pushApiChange(other, "newer");

    const outcome = runReleaseApps(
      { apps: [], dryRun: false },
      { repoRoot: clone, stdio: "ignore" }
    );

    expect(outcome).toEqual({ status: "behind" });
    expect(refOnOrigin(origin, "refs/heads/release/api")).toBeNull();
  });

  it("refuses a release branch that is not an ancestor of HEAD and leaves origin untouched", () => {
    const other = path.join(root, "other");
    git(root, ["clone", "-q", origin, other]);
    git(other, ["checkout", "-q", "-b", "stray"]);
    write(other, "apps/api/src/stray.ts", "export const stray = true;\n");
    const stray = commitAll(other, "feat(api): stray release");
    git(other, ["push", "-q", "origin", "HEAD:refs/heads/release/api"]);

    pushApiChange(clone, "first");

    expect(() =>
      runReleaseApps({ apps: [], dryRun: false }, { repoRoot: clone, stdio: "ignore" })
    ).toThrow(/refs\/remotes\/origin\/release\/api is not an ancestor of HEAD/);
    expect(refOnOrigin(origin, "refs/heads/release/api")).toBe(stray);
  });

  it("refuses to run off main or with a dirty working tree", () => {
    pushApiChange(clone, "first");
    write(clone, "apps/api/src/dirty.ts", "export const dirty = true;\n");
    expect(() =>
      runReleaseApps({ apps: [], dryRun: false }, { repoRoot: clone, stdio: "ignore" })
    ).toThrow(/Working tree is not clean/);

    git(clone, ["checkout", "-q", "--", "."]);
    rmSync(path.join(clone, "apps/api/src/dirty.ts"));
    git(clone, ["checkout", "-q", "-b", "feature"]);
    expect(() =>
      runReleaseApps({ apps: [], dryRun: false }, { repoRoot: clone, stdio: "ignore" })
    ).toThrow(/must run from main\. Current branch: feature/);
  });
});
