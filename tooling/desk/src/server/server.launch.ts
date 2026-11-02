import { spawn } from "node:child_process";
import path from "node:path";

import { createAgentProcess } from "../agents/agent.process";
import { createHostRunners } from "../agents/agent.runners";
import { loadDeskConfig } from "../config/config.load";
import {
  flowForLabels,
  type HealthFix,
  type IssueState,
  type LessonReport,
  type Provider,
  type ScorecardView
} from "../contracts";
import type { ServerRunner } from "./server.actions";
import { readDefinitionViews, type DefinitionViews } from "./server.definitions";
import { createEventBus, type PipelineEventListener } from "./server.events";
import {
  createDeskServer,
  type DeskServer,
  type DeskServerDeps,
  type HealthFixOutcome
} from "./server.http";
import { ensureUiBuilt } from "./server.ui";
import {
  missingWorkspaceBuilds,
  runDoctor,
  workspaceBuildArgv,
  type DoctorReport
} from "../doctor/doctor.checks";
import { repoFingerprint } from "../engine/harness.fingerprint";
import { recoverInterrupted } from "../engine/pipeline.recovery";
import { createPipelineRunner } from "../engine/pipeline.runner";
import { worktreeDirFor } from "../engine/pipeline.stage.setup";
import { diffAgainstBase, createGitPort, tryGit } from "../git";
import { createGhClient } from "../github/github.gh";
import { AGENT_LABELS, LABEL_DEFINITIONS } from "../github/github.labels";
import { fetchOpenWork, type OpenWork } from "../github/github.lists";
import { createGitHubPort } from "../github/github.port";
import { buildWorkerImage } from "../isolation/docker.admin";
import { dockerDoctorChecks } from "../isolation/docker.doctor";
import { createDockerIsolation } from "../isolation/isolation.docker";
import { containerCleanupFor } from "../isolation/isolation.select";
import { createJobManager, createJobStore, type JobManager } from "../jobs";
import { createNotifier } from "../notify";
import { createExec, systemClock } from "../ports";
import { createDefinitionWrites, type DefinitionWrites } from "../registry/registry.write";
import { readScorecard } from "../scorecard";
import { createLessonDesk, type LessonActions } from "../stats/stats.lesson-desk";
import { readRunRecords, type RunRecords } from "../stats/stats.runs";
import { createIssueStore, type IssueStore } from "../store/store.issue";
import { configPath, resolveRepoLocation } from "../store/store.root";

export { DEFAULT_UI_DIR } from "./server.ui";

/** What the server needs from the desk. The CLI can pass its own. */
export interface DeskRuntime {
  readonly runner: ServerRunner;
  readonly store: IssueStore;
  readonly health: () => Promise<DoctorReport>;
  /** Open issues and pull requests of the repository, read with `gh`. */
  readonly openWork?: (() => Promise<OpenWork>) | undefined;
  /** Repairs the Health page offers, such as building the Docker image. */
  readonly healthFixes?: Partial<Record<HealthFix, () => Promise<HealthFixOutcome>>> | undefined;
  readonly currentDiffHash?: ((state: IssueState) => Promise<string | null>) | undefined;
  /** `runs.jsonl` of the desk state. */
  readonly readRuns?: (() => Promise<RunRecords>) | undefined;
  /** `maxPrRounds` of the config. */
  readonly prRoundLimit?: number | undefined;
  /** The monorepo health scorecard of the checkout, or of another checkout (a job worktree). */
  readonly scorecard?: ((checkout?: string) => Promise<ScorecardView>) | undefined;
  /** Desk jobs: scorecard runs started from the desk. */
  readonly jobs?: JobManager | undefined;
  /** `lessons.jsonl` of the desk state, aggregated against the repository's instructions now. */
  readonly lessons?: (() => Promise<LessonReport>) | undefined;
  /** Promote, unpromote, and open an issue for a lesson. */
  readonly lessonActions?: LessonActions | undefined;
  /** The registry's agents and flows of the checkout, resolved with the config. */
  readonly readDefinitions?: (() => Promise<DefinitionViews>) | undefined;
  /** Save, clone, promote and delete the checkout's agents and flows. */
  readonly definitionWrites?: DefinitionWrites | undefined;
  /** The flow `start` picks for an issue's labels: `flowLabels`, else `defaultFlow`. */
  readonly flowFor?: ((labels: readonly string[]) => string) | undefined;
  /** The built UI, when the runtime knows where it is. */
  readonly uiDir?: string | null | undefined;
  /** Wait for background work (notify commands, log writes) before the process exits. */
  readonly dispose?: (() => Promise<void>) | undefined;
}

/**
 * Builds the runtime. `onEvent` must be the pipeline's `onEvent`: the server
 * listens to it for live logs and quick updates.
 */
export type DeskRuntimeFactory = (onEvent: PipelineEventListener) => Promise<DeskRuntime>;

/**
 * The runtime of `pnpm desk serve` without any CLI help: real `gh`, `git`, and
 * agent runners, state from the git common directory, interrupted issues
 * marked `needs-you`. It does not import the CLI.
 */
export const createDefaultDeskRuntime =
  (cwd: string, print: (text: string) => void = () => undefined): DeskRuntimeFactory =>
  async (onEvent) => {
    const exec = createExec();
    const location = await resolveRepoLocation(exec, cwd);
    const loaded = await loadDeskConfig(configPath(location.repoRoot));
    if (!loaded.ok) throw new Error(`Config error (${loaded.reason}): ${loaded.detail}`);
    const { config } = loaded;

    const store = createIssueStore(location.stateRoot);
    const github = createGitHubPort({ exec, cwd: location.repoRoot });
    const runners = createHostRunners();
    const log = (message: string): void => onEvent({ type: "log", issue: 0, message });
    const notifier = createNotifier({
      exec,
      command: config.notifyCommand,
      cwd: location.repoRoot,
      log
    });

    // The Docker checks and the image build, as `desk doctor` and `desk docker build` run them.
    // The output cap is above the largest patch, as in the CLI.
    const dockerExec = createExec({ maxOutputBytes: 64 * 1024 * 1024 });
    const docker = createDockerIsolation({
      exec: dockerExec,
      process: createAgentProcess(),
      hostRunnerFor: (provider: Provider) => runners[provider],
      repoRoot: location.repoRoot,
      stateRoot: location.stateRoot,
      config
    });

    await recoverInterrupted(store, {
      clock: systemClock,
      cleanupIsolation: containerCleanupFor({ config, docker }),
      log
    });
    const lessonDesk = createLessonDesk({
      stateRoot: location.stateRoot,
      clock: systemClock,
      github,
      owner: config.owner,
      currentRepo: () => repoFingerprint(location.repoRoot)
    });
    const jobs = createJobManager({
      store: createJobStore(location.stateRoot),
      exec,
      git: createGitPort(exec),
      github,
      runner: runners.claude,
      clock: systemClock,
      repoRoot: location.repoRoot,
      // Beside the issue worktrees: the folder of `KAINE-<n>` is the folder of `KAINE-job-<n>`.
      worktreesDir: path.dirname(worktreeDirFor({ config, location }, 1)),
      base: config.baseBranch
    });
    await jobs.recover();
    const runner = createPipelineRunner({
      exec,
      git: createGitPort(exec),
      github,
      runnerFor: (provider: Provider) => runners[provider],
      docker,
      store,
      clock: systemClock,
      config,
      location: { repoRoot: location.repoRoot, stateRoot: location.stateRoot },
      notify: notifier.notify,
      onEvent
    });

    return {
      store,
      runner: {
        start: runner.start,
        approvePlan: runner.approvePlan,
        feedback: runner.feedback,
        continueFrom: runner.continueFrom,
        cancel: runner.cancel,
        remove: runner.remove,
        ship: runner.ship,
        refreshPr: runner.refreshPr,
        checkPr: runner.checkPr,
        feedbackFromPr: runner.feedbackFromPr,
        draft: runner.draft,
        applyDraft: runner.applyDraft,
        pause: runner.pause,
        resume: runner.resume
      },
      readRuns: () => readRunRecords(location.stateRoot),
      prRoundLimit: config.maxPrRounds,
      scorecard: async (checkout) => {
        const remote = await tryGit(exec, location.repoRoot, ["remote", "get-url", "origin"]);
        return readScorecard({
          repoRoot: checkout ?? location.repoRoot,
          remote: remote.ok ? remote.stdout.trim() : null
        });
      },
      jobs,
      lessons: lessonDesk.report,
      lessonActions: lessonDesk.actions,
      readDefinitions: () => readDefinitionViews({ repoRoot: location.repoRoot, config }),
      definitionWrites: createDefinitionWrites({ repoRoot: location.repoRoot }),
      flowFor: (labels) => flowForLabels(config, labels),
      openWork: () => fetchOpenWork(createGhClient({ exec, cwd: location.repoRoot })),
      health: () =>
        runDoctor({
          exec,
          github,
          cwd: location.repoRoot,
          location,
          nodeVersion: process.version,
          loadConfig: () => loadDeskConfig(configPath(location.repoRoot)),
          dockerChecks: async (required) =>
            dockerDoctorChecks({
              docker: docker.docker,
              exec: dockerExec,
              imageTag: await docker.imageTag(),
              required,
              probe: null
            })
        }),
      healthFixes: {
        "docker-build": async () => {
          const result = await buildWorkerImage(dockerExec, location.repoRoot);
          return result.ok
            ? { ok: true, detail: `Built ${result.tag}.` }
            : { ok: false, detail: result.reason };
        },
        "agent-labels": async () => {
          for (const definition of LABEL_DEFINITIONS) await github.createLabel(definition);
          return { ok: true, detail: `Created ${AGENT_LABELS.join(", ")}.` };
        },
        "workspace-builds": async () => {
          const missing = await missingWorkspaceBuilds(exec, location.repoRoot);
          if (missing === null) return { ok: false, detail: "pnpm could not list workspaces." };
          if (missing.length === 0) return { ok: true, detail: "Every package is built." };
          const result = await exec({
            argv: workspaceBuildArgv(missing),
            cwd: location.repoRoot,
            timeoutMs: 15 * 60_000
          });
          return result.code === 0
            ? { ok: true, detail: `Built ${missing.join(", ")}.` }
            : { ok: false, detail: result.stderr.trim().split("\n").slice(-5).join("\n") };
        }
      },
      currentDiffHash: async (state) => {
        if (state.worktreePath === null || state.baseSha === null || state.baseSha === undefined) {
          return null;
        }
        return (await diffAgainstBase(exec, state.worktreePath, state.baseSha)).diffHash;
      },
      uiDir: await ensureUiBuilt({ exec, repoRoot: location.repoRoot, print }),
      dispose: async () => {
        await notifier.settled();
        await jobs.close();
      }
    };
  };

// --- opening the browser --------------------------------------------------

export interface OpenCommand {
  readonly command: string;
  readonly args: readonly string[];
}

/** The program that opens `url`. An argv, never a shell string: the URL cannot inject a command. */
export const browserOpenCommand = (url: string, platform: NodeJS.Platform): OpenCommand => {
  if (platform === "win32") {
    return { command: "rundll32", args: ["url.dll,FileProtocolHandler", url] };
  }
  return { command: platform === "darwin" ? "open" : "xdg-open", args: [url] };
};

const openInBrowser = (url: string, print: (text: string) => void): void => {
  const { command, args } = browserOpenCommand(url, process.platform);
  const child = spawn(command, [...args], { stdio: "ignore", detached: true, windowsHide: true });
  child.on("error", () => print("Could not open a browser. Open the launch URL yourself.\n"));
  child.unref();
};

// --- launch ---------------------------------------------------------------

export type ServerTuning = Pick<
  DeskServerDeps,
  | "heartbeatMs"
  | "pollMs"
  | "useFsWatch"
  | "actionSettleMs"
  | "healthTtlMs"
  | "maxBodyBytes"
  | "logCapacity"
>;

export interface LaunchOptions {
  /** Default 0: a random free port. */
  readonly port?: number | undefined;
  /** Open the launch URL in the default browser. */
  readonly open?: boolean | undefined;
  /** The built UI. Absent: the runtime's choice. `null`: serve the API only. */
  readonly uiDir?: string | null | undefined;
  /** Build the runtime. Absent: `createDefaultDeskRuntime(cwd)`. */
  readonly depsFactory?: DeskRuntimeFactory | undefined;
  readonly cwd?: string | undefined;
  /** Where the launch URL goes. Default: standard output. */
  readonly print?: ((text: string) => void) | undefined;
  /** Seam for tests. Default: the system browser. */
  readonly openBrowser?: ((url: string) => void) | undefined;
  readonly tuning?: ServerTuning | undefined;
}

export interface LaunchedDesk extends DeskServer {
  readonly runtime: DeskRuntime;
}

/**
 * Build the runtime, start the server, print the launch URL (the token is in
 * the fragment), and optionally open the browser. It returns when the server
 * listens. `close()` also disposes the runtime.
 */
export const launchDeskServer = async (options: LaunchOptions = {}): Promise<LaunchedDesk> => {
  const print = options.print ?? ((text: string) => void process.stdout.write(text));
  const factory =
    options.depsFactory ?? createDefaultDeskRuntime(options.cwd ?? process.cwd(), print);

  const bus = createEventBus();
  const runtime = await factory(bus.emit);

  let desk: DeskServer;
  try {
    desk = await createDeskServer({
      runner: runtime.runner,
      store: runtime.store,
      events: bus,
      health: runtime.health,
      healthFixes: runtime.healthFixes,
      openWork: runtime.openWork,
      currentDiffHash: runtime.currentDiffHash,
      readRuns: runtime.readRuns,
      prRoundLimit: runtime.prRoundLimit,
      scorecard: runtime.scorecard,
      jobs: runtime.jobs,
      lessons: runtime.lessons,
      lessonActions: runtime.lessonActions,
      readDefinitions: runtime.readDefinitions,
      definitionWrites: runtime.definitionWrites,
      flowFor: runtime.flowFor,
      uiDir: options.uiDir !== undefined ? options.uiDir : (runtime.uiDir ?? null),
      port: options.port,
      ...options.tuning
    });
  } catch (error) {
    await runtime.dispose?.();
    throw error;
  }

  const pageUrl = `${desk.url}/`;
  print(`Agent desk: ${pageUrl}\n`);
  print("Open this local URL in your browser.\n");
  print(`Vite dev link (one use): ${desk.launchUrl}\n`);
  if (options.open === true) {
    if (options.openBrowser === undefined) openInBrowser(pageUrl, print);
    else options.openBrowser(pageUrl);
  }

  return {
    ...desk,
    runtime,
    close: async () => {
      await desk.close();
      await runtime.dispose?.();
    }
  };
};

/**
 * `pnpm desk serve`: launch, wait for SIGINT, SIGTERM, or `signal`, then
 * close. Running actions are not cancelled: the next start marks them `needs-you`.
 */
export const serveDesk = async (
  options: LaunchOptions & { readonly signal?: AbortSignal | undefined } = {}
): Promise<void> => {
  const desk = await launchDeskServer(options);
  await new Promise<void>((resolve) => {
    const stop = (): void => {
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
      options.signal?.removeEventListener("abort", stop);
      resolve();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    if (options.signal?.aborted === true) stop();
    else options.signal?.addEventListener("abort", stop, { once: true });
  });
  await desk.close();
};
