import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";

import { CHECK_REPORT_FILE, type CheckReport } from "../check";
import { issueStateSchema, deskConfigSchema, type PlannerOutput } from "../contracts";
import type { ShipEvent, ShipResult } from "./ship.contract";
import { recordRefsBaseline } from "./ship.refs";
import { ARTIFACTS, writeArtifactJson } from "../engine/pipeline.artifacts";
import { diffAgainstBase } from "../git";
import { createGitPort } from "../git";
import { authorize } from "../github/github.authorization";
import type { Exec, ExecRequest } from "../ports";
import { shipIssue, type ShipDeps, type ShipRequest } from "./ship.run";
import { createIssueStore, type IssueStore } from "../store/store.issue";
import {
  createOriginAndClone,
  createScratch,
  hermeticExec,
  type TestRepo,
  type TestScratch
} from "../testing/git.repo";
import { fakeGitHub, OWNER, snapshotOf, type FakeGitHub } from "../testing/github.fake";
import { ISSUE, planOutput, reviewOutput } from "../testing/pipeline.testing";

/** Shared fixtures for the ship tests. Not part of the public API. */

export const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

export const checkReportOf = (over: Partial<CheckReport> = {}): CheckReport => ({
  passed: true,
  kind: "ship",
  steps: [
    {
      argv: ["pnpm", "generate"],
      code: 0,
      timedOut: false,
      tail: "",
      durationMs: 5
    },
    {
      argv: ["pnpm", "check"],
      code: 0,
      timedOut: false,
      tail: "ok",
      durationMs: 10
    }
  ],
  fingerprint: null,
  diffHash: sha256("diff"),
  generatedDrift: false,
  startedAt: "2026-10-07T09:00:00.000Z",
  finishedAt: "2026-10-07T09:00:05.000Z",
  ...over
});

// --- a real repository to ship from ---------------------------------------------------------

export interface ShipEnvOptions {
  /** Files the agent "built" in the worktree, repo-relative. Default: `src/feature.ts`. */
  readonly edits?: Readonly<Record<string, string>>;
  /** Overrides for the approved plan. */
  readonly plan?: Partial<PlannerOutput>;
  readonly github?: Parameters<typeof fakeGitHub>[0];
  readonly config?: Record<string, unknown>;
  /** Skip the refs baseline, as a runner that never recorded one would. */
  readonly noBaseline?: boolean;
  /** Skip the review artifact. */
  readonly noReview?: boolean;
  /** Skip the plan-approved event. */
  readonly planNotApproved?: boolean;
  /** Files on `main` besides the defaults. */
  readonly repoFiles?: Readonly<Record<string, string>>;
}

export type HookName = "pre-commit" | "commit-msg" | "pre-push" | "pre-receive";

export interface ShipEnv {
  readonly scratch: TestScratch;
  readonly clone: TestRepo;
  readonly origin: TestRepo;
  readonly worktree: string;
  readonly branch: string;
  readonly baseSha: string;
  readonly store: IssueStore;
  readonly artifactsDir: string;
  readonly github: FakeGitHub;
  readonly deps: ShipDeps;
  /** Every argv the executor ran, in order. */
  readonly calls: ExecRequest[];
  /** Replies for successive `pnpm check` runs. After the list, they pass. */
  readonly checkReplies: { code: number; stdout?: string }[];
  readonly commitlintReplies: { code: number; stdout?: string }[];
  readonly events: ShipEvent[];
  /** Lines the test hooks wrote, in order (`pre-commit`, `commit-msg`, `pre-push`, `pre-receive`). */
  readonly hookLog: () => Promise<string[]>;
  readonly failHook: (hook: HookName, fail: boolean) => Promise<void>;
  /** Change the worktree like an agent would, then record fresh artifacts for the new code. */
  readonly rewrite: (edits: Readonly<Record<string, string>>) => Promise<void>;
  /** Write the loop check report, the review and the refs baseline for the code as it is now. */
  readonly refreshArtifacts: () => Promise<void>;
  /** Replace the approved plan (merged over the plan of the options) and refresh the artifacts. */
  readonly setPlan: (over: Partial<PlannerOutput>) => Promise<void>;
  /** Forget the recorded calls, for a test that runs the executor more than once. */
  readonly resetCalls: () => void;
  readonly ship: (over?: Partial<ShipRequest>, deps?: Partial<ShipDeps>) => Promise<ShipResult>;
  readonly commitCount: () => Promise<number>;
  readonly cleanup: () => Promise<void>;
}

const hookScript = (root: string, name: HookName): string =>
  [
    "#!/bin/sh",
    `echo "${name}" >> "${root}/hooks.log"`,
    `if [ -e "${root}/fail-${name}" ]; then echo "hook: ${name} rejects" >&2; exit 1; fi`,
    "exit 0",
    ""
  ].join("\n");

export const SHIP_REPO_FILES: Readonly<Record<string, string>> = {
  "pnpm-workspace.yaml": 'packages:\n  - "tooling/*"\n',
  "tooling/desk/package.json": '{"name":"@repo/desk","private":true}\n',
  "tooling/desk/src/index.ts": "export {};\n",
  ".changeset/config.json": "{}\n",
  "src/seed.ts": "export const seed = 1;\n"
};

export const createShipEnv = async (options: ShipEnvOptions = {}): Promise<ShipEnv> => {
  const scratch = await createScratch();
  const { clone, origin } = await createOriginAndClone(scratch);
  const root = scratch.root;
  await clone.git(["config", "user.name", "Ognjen Test"]);
  await clone.git(["config", "user.email", "ognjen@example.test"]);

  const template = await readFile(
    path.resolve(import.meta.dirname, "../../../../.github/pull_request_template.md"),
    "utf8"
  );
  const files = {
    ...SHIP_REPO_FILES,
    ".github/pull_request_template.md": template,
    ...options.repoFiles
  };
  for (const [file, content] of Object.entries(files)) await clone.write(file, content);
  await clone.commit("add repo files");
  await clone.git(["push", "--quiet", "origin", "main"]);

  const branch = "KAINE-7-feat-export-reports";
  const worktree = path.join(root, "worktrees", branch);
  await clone.git(["worktree", "add", "-b", branch, worktree, "origin/main"]);
  const baseSha = await clone.git(["rev-parse", "origin/main"]);
  const wt = (relative: string) => path.join(worktree, relative);
  const writeWorktree = async (edits: Readonly<Record<string, string>>): Promise<void> => {
    for (const [file, content] of Object.entries(edits)) {
      await mkdir(path.dirname(wt(file)), { recursive: true });
      await writeFile(wt(file), content);
    }
  };
  await writeWorktree(options.edits ?? { "src/feature.ts": "export const feature = 1;\n" });

  // Hooks live in the shared git dir, so every worktree runs them.
  for (const name of ["pre-commit", "commit-msg", "pre-push"] as const) {
    const file = path.join(clone.dir, ".git", "hooks", name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, hookScript(root, name));
    await chmod(file, 0o755);
  }
  const receive = path.join(origin.dir, "hooks", "pre-receive");
  await mkdir(path.dirname(receive), { recursive: true });
  await writeFile(receive, hookScript(root, "pre-receive"));
  await chmod(receive, 0o755);

  const stateRoot = path.join(root, "state");
  const store = createIssueStore(stateRoot);
  const artifactsDir = store.artifactsDir(ISSUE);
  const snapshot = snapshotOf({ number: ISSUE });
  const auth = authorize(snapshot, {
    owner: OWNER,
    override: false,
    now: new Date("2026-10-07T08:30:00Z")
  });
  if (!auth.ok) throw new Error(auth.reason);
  await store.write(
    issueStateSchema.parse({
      schemaVersion: 1,
      issueNumber: ISSUE,
      stage: "pr-review",
      status: "waiting",
      resumeStage: null,
      branch,
      worktreePath: worktree,
      sessions: {},
      loops: { check: 0, review: 0 },
      lastCheckFingerprint: null,
      history: [
        ...(options.planNotApproved
          ? []
          : [{ at: "2026-10-07T08:40:00.000Z", stage: "plan-gate", event: "plan-approved" }])
      ],
      authorization: auth.snapshot,
      baseSha,
      createdAt: "2026-10-07T08:00:00.000Z",
      updatedAt: "2026-10-07T08:50:00.000Z"
    })
  );

  const calls: ExecRequest[] = [];
  const checkReplies: ShipEnv["checkReplies"] = [];
  const commitlintReplies: ShipEnv["commitlintReplies"] = [];
  const exec: Exec = async (request) => {
    calls.push(request);
    if (request.argv[0] === "git") return hermeticExec(request);
    const reply =
      request.argv[1] === "check"
        ? checkReplies.shift()
        : request.argv[1] === "exec" && request.argv[2] === "commitlint"
          ? commitlintReplies.shift()
          : undefined;
    return {
      code: reply?.code ?? 0,
      stdout: reply?.stdout ?? "",
      stderr: reply !== undefined && reply.code !== 0 ? (reply.stdout ?? "failed") : "",
      timedOut: false,
      truncated: false
    };
  };

  const github = fakeGitHub({ snapshot, ...options.github });
  const events: ShipEvent[] = [];
  const config = deskConfigSchema.parse({ ...options.config });
  const deps: ShipDeps = {
    exec,
    git: createGitPort(exec),
    github,
    clock: { now: () => new Date("2026-10-07T09:00:00Z") },
    config,
    store,
    onEvent: (event) => events.push(event)
  };

  let planNow: Partial<PlannerOutput> = {};
  const refreshArtifacts = async (): Promise<void> => {
    const diff = await diffAgainstBase(hermeticExec, worktree, baseSha);
    await writeArtifactJson(
      artifactsDir,
      ARTIFACTS.plan,
      planOutput({ ...options.plan, ...planNow })
    );
    if (!options.noReview) {
      await writeArtifactJson(artifactsDir, ARTIFACTS.review, {
        review: reviewOutput(),
        rejected: [],
        diffHash: diff.diffHash
      });
    }
    await writeArtifactJson(
      artifactsDir,
      CHECK_REPORT_FILE,
      checkReportOf({ kind: "loop", diffHash: diff.diffHash })
    );
    if (!options.noBaseline) await recordRefsBaseline(deps.git, worktree, artifactsDir);
  };
  await refreshArtifacts();
  // The setup ran git through the same exec. Only the ship run's calls count.
  calls.length = 0;

  const markers = (hook: HookName): string => path.join(root, `fail-${hook}`);
  return {
    scratch,
    clone,
    origin,
    worktree,
    branch,
    baseSha,
    store,
    artifactsDir,
    github,
    deps,
    calls,
    checkReplies,
    commitlintReplies,
    events,
    hookLog: async () =>
      (await readFile(path.join(root, "hooks.log"), "utf8").catch(() => ""))
        .split("\n")
        .filter((line) => line !== ""),
    failHook: async (hook, fail) => {
      if (fail) await writeFile(markers(hook), "");
      else await rm(markers(hook), { force: true });
    },
    rewrite: async (edits) => {
      await writeWorktree(edits);
      await refreshArtifacts();
    },
    refreshArtifacts,
    setPlan: async (over) => {
      planNow = over;
      await refreshArtifacts();
    },
    resetCalls: () => {
      calls.length = 0;
    },
    ship: (over = {}, depsOver = {}) =>
      shipIssue({ ...deps, ...depsOver }, { issue: ISSUE, confirm: true, ...over }),
    commitCount: async () =>
      Number(await clone.git(["rev-list", "--count", `${baseSha}..HEAD`], worktree)),
    cleanup: () => scratch.cleanup()
  };
};

/** Run `body` with a fresh environment and always clean it up. */
export const withShipEnv = async (
  options: ShipEnvOptions,
  body: (env: ShipEnv) => Promise<void>
): Promise<void> => {
  const env = await createShipEnv(options);
  try {
    await body(env);
  } finally {
    await env.cleanup();
  }
};

/**
 * One test with its own repository. The tests of a file run one after another:
 * every git call is a process, and a full suite of these side by side starves
 * the other real-git tests of the workspace.
 */
export const shipTest = (
  name: string,
  options: ShipEnvOptions,
  body: (env: ShipEnv) => Promise<void>
): void => {
  it(name, () => withShipEnv(options, body));
};

/**
 * The git commands of the run, without the ones that work on a temporary index.
 * `diffAgainstBase` runs `git add -A` against a copy of the index selected with
 * `GIT_INDEX_FILE`; it never touches the real index.
 */
export const gitArgv = (env: ShipEnv): string[][] =>
  env.calls
    .filter((call) => call.argv[0] === "git" && call.env?.GIT_INDEX_FILE === undefined)
    .map((call) => call.argv.slice(1));

/** The rules that hold for every git and gh call of every ship run. */
export const expectSafeCalls = (env: ShipEnv): void => {
  const forbiddenFlags = [
    "--no-verify",
    "-n",
    "--force",
    "-f",
    "--force-with-lease",
    "--force-if-includes",
    "--mirror",
    "--delete",
    "-d",
    "--all",
    "-a",
    "-A",
    "."
  ];
  for (const argv of gitArgv(env)) {
    const [command] = argv;
    if (command === "commit") expect(argv).toEqual(["commit", "--file", expect.any(String)]);
    if (command === "push") expect(argv).toEqual(["push", "-u", "origin", env.branch]);
    if (command === "add") {
      expect(argv).toEqual(["add", "--pathspec-from-file=-", "--pathspec-file-nul"]);
    }
    if (command === "commit" || command === "push" || command === "rebase") {
      for (const flag of forbiddenFlags) expect(argv).not.toContain(flag);
      expect(argv.some((word) => word.startsWith("+"))).toBe(false);
    }
  }
  expect(env.calls.some((call) => call.argv[0] === "gh")).toBe(false);
  expect(
    Object.keys(env.github).filter((name) => /merge|review|ready|approve|auto/i.test(name))
  ).toEqual([]);
  for (const request of env.github.createdPullRequests) {
    expect(request.draft).toBe(true);
    expect(request.base).toBe("main");
  }
};

/** Files the commit at `ref` (default HEAD of the worktree) holds. */
export const filesInCommit = async (env: ShipEnv, ref = "HEAD"): Promise<string[]> =>
  (await env.clone.git(["show", "--name-only", "--format=", ref], env.worktree))
    .split("\n")
    .filter((line) => line !== "")
    .sort();

export const fileExists = (file: string): Promise<boolean> =>
  stat(file).then(
    () => true,
    () => false
  );

export const worktreeStatus = (env: ShipEnv): Promise<string> =>
  env.clone.git(["status", "--porcelain", "--untracked-files=all"], env.worktree);

export const refusalKinds = (result: ShipResult): string[] =>
  result.status === "refused" ? result.failures.map((failure) => failure.kind).sort() : [];

/** How many times `pnpm <script>` ran. */
export const pnpmRuns = (env: ShipEnv, script: string): number =>
  env.calls.filter((call) => call.argv[0] === "pnpm" && call.argv[1] === script).length;
