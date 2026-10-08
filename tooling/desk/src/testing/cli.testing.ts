import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { ok, type FakeRoute } from "./exec.fake";
import { createFakeGit, type FakeGit } from "./git.fake";
import { fakeGitHub, snapshotOf, type FakeGitHub, type FakeGitHubOptions } from "./github.fake";
import {
  ISSUE,
  REPO_FILES,
  createFakePnpm,
  createScriptedRunner,
  type FakePnpm,
  type ScriptedRunner,
  type ScriptedStep
} from "./pipeline.testing";
import { runCli, type CliDeps, type CliResult } from "../cli/desk.cli";
import type { Exec, ExecRequest } from "../ports";

/**
 * A CLI over fakes: a fake git, a scripted `pnpm`, a scripted agent runner and
 * a fake GitHub, with real state files in a temporary directory. Nothing
 * starts a real agent or touches the network.
 */

export const CLI_NOW = new Date("2026-10-07T09:00:00Z");

export interface CliEnv {
  readonly root: string;
  readonly repo: string;
  /** `<repo>/.git/kaine-desk`, where the CLI keeps its state. */
  readonly stateRoot: string;
  readonly git: FakeGit;
  readonly pnpm: FakePnpm;
  readonly github: FakeGitHub;
  readonly runner: ScriptedRunner;
  readonly deps: CliDeps;
  /** Every argv the CLI passed to `exec` that no route and no fake claimed. */
  readonly extraCalls: ExecRequest[];
  readonly run: (...argv: string[]) => Promise<CliResult>;
  readonly issueDir: (issue?: number) => string;
  readonly worktree: (issue?: number) => string;
  /** Write `.ai.local/desk/config.json` in the repository. */
  readonly writeConfig: (config: Record<string, unknown>) => Promise<void>;
  readonly cleanup: () => Promise<void>;
}

export interface CliEnvOptions {
  readonly steps?: readonly ScriptedStep[];
  readonly github?: FakeGitHubOptions;
  /** Answer these argv prefixes before the fakes do. */
  readonly routes?: readonly FakeRoute[];
  readonly deps?: Partial<CliDeps>;
}

export const createCliEnv = async (options: CliEnvOptions = {}): Promise<CliEnv> => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "desk-cli-")));
  const repo = path.join(root, "repo");
  await mkdir(path.join(repo, ".git"), { recursive: true });

  const git = createFakeGit({ repoRoot: repo, files: REPO_FILES });
  const pnpm = createFakePnpm(git.exec);
  const github = fakeGitHub({ snapshot: snapshotOf({ number: ISSUE }), ...options.github });
  const runner = createScriptedRunner(options.steps ?? []);
  const extraCalls: ExecRequest[] = [];

  const routes: readonly FakeRoute[] = [
    { argv: ["git", "rev-parse", "--show-toplevel"], reply: ok(`${repo}\n`) },
    { argv: ["git", "rev-parse", "--git-common-dir"], reply: ok(".git\n") },
    ...(options.routes ?? [])
  ];
  const exec: Exec = (request) => {
    const route = routes.find((candidate) =>
      candidate.argv.every((word, index) => request.argv[index] === word)
    );
    if (route === undefined) {
      extraCalls.push(request);
      return pnpm.exec(request);
    }
    const reply = typeof route.reply === "function" ? route.reply(request) : route.reply;
    return Promise.resolve({
      code: reply.code === undefined ? 0 : reply.code,
      stdout: reply.stdout ?? "",
      stderr: reply.stderr ?? "",
      timedOut: reply.timedOut ?? false,
      truncated: false
    });
  };

  const deps: CliDeps = {
    exec,
    clock: { now: () => CLI_NOW },
    cwd: repo,
    nodeVersion: "v24.12.0",
    createGitHub: () => github,
    git: git.port,
    runnerFor: () => runner,
    followIntervalMs: 20,
    pipeline: { lease: { processStart: () => Promise.resolve(null) } },
    ...options.deps
  };

  return {
    root,
    repo,
    stateRoot: path.join(repo, ".git", "kaine-desk"),
    git,
    pnpm,
    github,
    runner,
    deps,
    extraCalls,
    run: (...argv) => runCli(argv, deps),
    issueDir: (issue = ISSUE) => path.join(repo, ".git", "kaine-desk", "issues", String(issue)),
    worktree: (issue = ISSUE) => path.join(root, "repo.worktrees", `KAINE-${issue}`),
    writeConfig: async (config) => {
      await mkdir(path.join(repo, ".ai.local", "desk"), { recursive: true });
      await writeFile(path.join(repo, ".ai.local", "desk", "config.json"), JSON.stringify(config));
    },
    cleanup: () => rm(root, { recursive: true, force: true })
  };
};
