import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { createFakeGit, type FakeGit } from "./git.fake";
import {
  createOriginAndClone,
  createScratch,
  hermeticExec,
  type TestRepo,
  type TestScratch
} from "./git.repo";
import { fakeGitHub, snapshotOf, type FakeGitHub } from "./github.fake";
import { jsonValueSchema } from "../agents/agent.json-value";
import { createReplayRunner } from "../agents/agent.replay";
import type {
  AgentDenial,
  AgentEvent,
  AgentFailure,
  AgentRunOutcome,
  AgentRunRequest,
  AgentRunner
} from "../agents/agent.runner";
import {
  REVIEW_SECTIONS,
  deskConfigSchema,
  type BuilderOutput,
  type DeskConfig,
  type PlannerOutput,
  type Provider,
  type ReviewerOutput
} from "../contracts";
import { createPipelineRunner, type PipelineRunner } from "../engine/pipeline.runner";
import { createScheduler } from "../engine/pipeline.scheduler";
import type { PipelineDeps, PipelineEvent, PipelineNotification } from "../engine/pipeline.types";
import type { DeskRole } from "../engine/worktree.bootstrap";
import { createGitPort } from "../git";
import type { IsolationPort } from "../isolation/isolation.port";
import type { Exec, ExecRequest, ExecResult } from "../ports";
import { createIssueStore, type IssueStore } from "../store/store.issue";

/**
 * Helpers for the pipeline tests: a real git origin and clone in a temporary
 * directory, a scripted `pnpm`, and a scripted agent runner whose steps can
 * change the worktree, so the engine invariants are tested against real git.
 * Nothing here starts a real agent or touches the network.
 */

export const ISSUE = 7;

// --- scripted agent --------------------------------------------------------

export interface ScriptedStep {
  readonly role: DeskRole;
  readonly provider?: Provider;
  /** The structured result. */
  readonly output?: unknown;
  /** The structured result, computed from the request (for example from its prompt). */
  readonly outputFor?: (request: RecordedRun) => unknown;
  /** Runs before the result is returned, in the worktree. It may edit files or move HEAD. */
  readonly effect?: (request: RecordedRun) => Promise<void> | void;
  readonly failure?: AgentFailure;
  /** Default: one `Skill` call for each skill of the request, so skill evidence is present. */
  readonly trace?: readonly AgentEvent[];
  readonly denials?: readonly AgentDenial[];
  readonly sessionId?: string;
  /** The pid the step reports through `onSpawn`, as a real runner does after it starts a process. */
  readonly pid?: number;
  /** The step waits for this promise before it answers. For concurrency tests. */
  readonly hold?: Promise<void>;
}

export type RecordedRun = Omit<AgentRunRequest<never>, "parse">;

export interface ScriptedRunner extends AgentRunner {
  readonly requests: RecordedRun[];
  readonly remaining: () => number;
  /** Highest number of runs that were in progress at the same time. */
  readonly maxActive: () => number;
  readonly active: () => number;
}

export const skillCalls = (skills: readonly string[]): AgentEvent[] =>
  skills.map((skill, index) => ({
    type: "tool_call",
    id: `skill-${index}`,
    tool: "Skill",
    paths: [],
    skill
  }));

export const bashCall = (id: string, command: string): AgentEvent => ({
  type: "tool_call",
  id,
  tool: "Bash",
  command,
  paths: []
});

export const createScriptedRunner = (steps: readonly ScriptedStep[]): ScriptedRunner => {
  const pending = [...steps];
  const requests: RecordedRun[] = [];
  let active = 0;
  let maxActive = 0;

  return {
    requests,
    remaining: () => pending.length,
    maxActive: () => maxActive,
    active: () => active,
    run: async <T>(request: AgentRunRequest<T>): Promise<AgentRunOutcome<T>> => {
      const { parse, ...recorded } = request;
      requests.push(recorded);
      const index = pending.findIndex(
        (step) =>
          step.role === request.role &&
          (step.provider === undefined || step.provider === request.provider)
      );
      const step = index < 0 ? undefined : pending.splice(index, 1)[0];
      active += 1;
      maxActive = Math.max(maxActive, active);
      try {
        if (step === undefined) {
          return {
            ok: false,
            failure: {
              kind: "process-error",
              message: `The scripted runner has no step for a ${request.provider} ${request.role} run.`,
              exitCode: null,
              stderrTail: ""
            },
            partial: { trace: [], sessionId: null, denials: [] }
          };
        }
        if (step.pid !== undefined) request.onSpawn?.(step.pid);
        await step.effect?.(recorded);
        if (step.hold !== undefined) {
          // A real runner stops its process on abort. The scripted one stops waiting.
          const signal = request.signal;
          await Promise.race([
            step.hold,
            new Promise<void>((resolve) => {
              if (signal?.aborted === true) resolve();
              else signal?.addEventListener("abort", () => resolve(), { once: true });
            })
          ]);
        }
        if (request.signal?.aborted === true) {
          return {
            ok: false,
            failure: { kind: "aborted" },
            partial: { trace: [], sessionId: null, denials: [] }
          };
        }
        const output = step.outputFor === undefined ? step.output : step.outputFor(recorded);
        return await createReplayRunner([
          {
            ...(step.failure === undefined ? {} : { failure: step.failure }),
            ...(output === undefined ? {} : { structured: jsonValueSchema.parse(output) }),
            ...(step.sessionId === undefined ? {} : { sessionId: step.sessionId }),
            trace: step.trace ?? skillCalls(request.skills),
            ...(step.denials === undefined ? {} : { denials: step.denials })
          }
        ]).run({ ...request, parse });
      } finally {
        active -= 1;
      }
    }
  };
};

// --- canned agent outputs --------------------------------------------------

export const FEATURE_FILE = "src/feature.ts";
export const FEATURE_TEST = "src/feature.test.ts";

export const planOutput = (over: Partial<PlannerOutput> = {}): PlannerOutput => ({
  summary: "Add a CSV export for reports",
  files: [{ path: FEATURE_FILE, action: "create", purpose: "The export function" }],
  tests: [{ path: FEATURE_TEST, action: "create", reason: "Cover the export" }],
  acceptanceCriteria: [
    { criterion: "Export button downloads a CSV", change: `${FEATURE_FILE} builds the CSV` }
  ],
  risks: [],
  openQuestions: [],
  changeset: { required: false, packages: [], bump: "patch" },
  pr: { type: "feat", slug: "export-reports" },
  plainLanguage: "We add a way to export a report as a CSV file.",
  ...over
});

export const builderOutput = (over: Partial<BuilderOutput> = {}): BuilderOutput => ({
  summary: "Added the export",
  filesChanged: [FEATURE_FILE],
  notes: [],
  blockers: [],
  claimedChecks: [],
  plainLanguage: "The export now exists.",
  ...over
});

export const reviewOutput = (over: Partial<ReviewerOutput> = {}): ReviewerOutput => ({
  verdict: "approve",
  findings: [],
  acceptanceStatus: [
    { criterion: "Export button downloads a CSV", status: "met", evidence: `${FEATURE_FILE}:1` }
  ],
  reviewSections: REVIEW_SECTIONS.map((heading) => ({ heading, verdict: "pass", notes: "" })),
  prDraft: { title: "feat: export reports as CSV", body: "Adds the export." },
  plainLanguage: "The change is safe to merge.",
  ...over
});

/** The file a builder step writes. Three lines, so findings can point at line 1 to 3. */
export const FEATURE_SOURCE = [
  "export const toCsv = (rows: string[][]): string =>",
  '  rows.map((row) => row.join(",")).join("\\n");',
  ""
].join("\n");

export const writeFeature = async (run: RecordedRun, content = FEATURE_SOURCE): Promise<void> => {
  await mkdir(path.join(run.cwd, "src"), { recursive: true });
  await writeFile(path.join(run.cwd, FEATURE_FILE), content);
  await writeFile(path.join(run.cwd, FEATURE_TEST), "// test\n");
};

// --- scripted pnpm ---------------------------------------------------------

export interface PnpmReply {
  readonly code?: number | null;
  readonly stdout?: string;
  readonly stderr?: string;
}

const READY = JSON.stringify({ installation: "ready", problems: [] });

export interface FakePnpm {
  readonly exec: Exec;
  readonly calls: ExecRequest[];
  /** Replies for successive `pnpm check:affected` runs. After the list, checks pass. */
  readonly checkReplies: PnpmReply[];
  /** Set to make a setup script fail (`install`, `env:ensure`, `ai:install`). */
  readonly scriptReplies: Map<string, PnpmReply>;
}

/** `git` goes to `gitExec` (real or fake), `pnpm` is scripted. Every call is recorded. */
export const createFakePnpm = (gitExec: Exec): FakePnpm => {
  const calls: ExecRequest[] = [];
  const checkReplies: PnpmReply[] = [];
  const scriptReplies = new Map<string, PnpmReply>();
  const exec: Exec = async (request) => {
    calls.push(request);
    if (request.argv[0] === "git") return gitExec(request);
    const script = request.argv[1] ?? "";
    const reply: PnpmReply =
      script === "check:affected"
        ? (checkReplies.shift() ?? {})
        : (scriptReplies.get(script) ?? (script === "ai:doctor" ? { stdout: READY } : {}));
    const result: ExecResult = {
      code: reply.code === undefined ? 0 : reply.code,
      stdout: reply.stdout ?? "",
      stderr: reply.stderr ?? "",
      timedOut: false,
      truncated: false
    };
    return result;
  };
  return { exec, calls, checkReplies, scriptReplies };
};

// --- the environment -------------------------------------------------------

export interface PipelineEnv {
  readonly kind: "fake" | "real";
  readonly scratch: TestScratch;
  /** The main checkout (a real repository only in `real` mode). */
  readonly repoRoot: string;
  readonly clone: TestRepo | null;
  readonly fake: FakeGit | null;
  readonly stateRoot: string;
  readonly worktreesDir: string;
  readonly store: IssueStore;
  readonly github: FakeGitHub;
  readonly pnpm: FakePnpm;
  readonly config: DeskConfig;
  readonly events: PipelineEvent[];
  readonly notifications: PipelineNotification[];
  readonly pipeline: PipelineRunner;
  readonly runner: ScriptedRunner;
  readonly deps: PipelineDeps;
  readonly worktree: () => string;
  /** Move HEAD in a worktree, as an agent that ran `git commit` would. */
  readonly commitIn: (worktree: string) => Promise<void>;
  /** Another runner over the same state and repository. For lease tests. */
  readonly secondRunner: (runner?: ScriptedRunner) => PipelineRunner;
  readonly cleanup: () => Promise<void>;
}

export interface EnvOptions {
  /** `fake` (default) keeps git in memory. `real` uses a temporary origin and clone. */
  readonly git?: "fake" | "real";
  readonly steps?: readonly ScriptedStep[];
  readonly config?: Record<string, unknown>;
  readonly github?: Parameters<typeof fakeGitHub>[0];
  readonly noWriteback?: boolean;
  readonly extraFiles?: Readonly<Record<string, string>>;
  /** The Docker isolation of the pipeline. Absent: host only. */
  readonly docker?: IsolationPort;
}

export const REPO_FILES: Readonly<Record<string, string>> = {
  ".ai/permissions.json": JSON.stringify({ rules: [] }),
  ".ai/agents/kaine-explorer.md": "Explore the repository. Read only.\n",
  ".ai/agents/kaine-implementer.md": "Implement the plan.\n",
  ".ai/review.md": "# Review\n",
  ".ai/hooks/pre-tool-use.mjs": "// stub\n"
};

export const createPipelineEnv = async (options: EnvOptions = {}): Promise<PipelineEnv> => {
  const kind = options.git ?? "fake";
  const scratch = await createScratch();
  const files = { ...REPO_FILES, ...options.extraFiles };

  let clone: TestRepo | null = null;
  let fake: FakeGit | null = null;
  let repoRoot: string;
  if (kind === "real") {
    ({ clone } = await createOriginAndClone(scratch));
    for (const [file, content] of Object.entries(files)) await clone.write(file, content);
    await clone.commit("add repo files");
    await clone.git(["push", "--quiet", "origin", "main"]);
    repoRoot = clone.dir;
  } else {
    repoRoot = path.join(scratch.root, "repo");
    await mkdir(repoRoot, { recursive: true });
    fake = createFakeGit({ repoRoot, files });
  }

  const stateRoot = path.join(scratch.root, "state");
  const worktreesDir = path.join(scratch.root, "worktrees");
  await mkdir(stateRoot, { recursive: true });
  const config = deskConfigSchema.parse({ worktreesDir, ...options.config });
  const store = createIssueStore(stateRoot);
  const github = fakeGitHub({ snapshot: snapshotOf({ number: ISSUE }), ...options.github });
  const pnpm = createFakePnpm(fake === null ? hermeticExec : fake.exec);
  const runner = createScriptedRunner(options.steps ?? []);
  const events: PipelineEvent[] = [];
  const notifications: PipelineNotification[] = [];

  const depsFor = (agentRunner: ScriptedRunner): PipelineDeps => ({
    exec: pnpm.exec,
    git: fake === null ? createGitPort(pnpm.exec) : fake.port,
    github,
    runnerFor: () => agentRunner,
    docker: options.docker,
    store,
    clock: { now: () => new Date("2026-10-07T09:00:00Z") },
    config,
    location: { repoRoot, stateRoot },
    scheduler: createScheduler(config.maxConcurrentAgents),
    onEvent: (event) => events.push(event),
    notify: (notification) => notifications.push(notification),
    noWriteback: options.noWriteback ?? false,
    lease: { processStart: () => Promise.resolve(null) }
  });
  const deps = depsFor(runner);

  return {
    kind,
    scratch,
    repoRoot,
    clone,
    fake,
    stateRoot,
    worktreesDir,
    store,
    github,
    pnpm,
    config,
    events,
    notifications,
    pipeline: createPipelineRunner(deps),
    runner,
    deps,
    worktree: () => path.join(worktreesDir, `KAINE-${ISSUE}`),
    commitIn: async (worktree) => {
      if (fake !== null) {
        fake.commit(worktree);
        return;
      }
      await clone?.git(["commit", "--quiet", "--allow-empty", "-m", "agent commit"], worktree);
    },
    secondRunner: (other = runner) => createPipelineRunner(depsFor(other)),
    cleanup: () => scratch.cleanup()
  };
};
