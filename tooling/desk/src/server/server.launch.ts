import { spawn } from "node:child_process";

import { createAgentProcess } from "../agents/agent.process";
import { createClaudeRunner } from "../agents/claude.runner";
import { createCodexRunner } from "../agents/codex.runner";
import { loadDeskConfig } from "../config/config.load";
import type { HealthFix, IssueState, LessonReport, Provider } from "../contracts";
import type { ServerRunner } from "./server.actions";
import { createEventBus, type PipelineEventListener } from "./server.events";
import {
  createDeskServer,
  type DeskServer,
  type DeskServerDeps,
  type HealthFixOutcome
} from "./server.http";
import {
  missingWorkspaceBuilds,
  runDoctor,
  workspaceBuildArgv,
  type DoctorReport
} from "../doctor/doctor.checks";
import { repoFingerprint } from "../engine/harness.fingerprint";
import { recoverInterrupted } from "../engine/pipeline.recovery";
import { createPipelineRunner } from "../engine/pipeline.runner";
import { diffAgainstBase, createGitPort } from "../git";
import { createGhClient } from "../github/github.gh";
import { AGENT_LABELS, LABEL_DEFINITIONS } from "../github/github.labels";
import { fetchOpenWork, type OpenWork } from "../github/github.lists";
import { createGitHubPort } from "../github/github.port";
import { buildWorkerImage } from "../isolation/docker.admin";
import { dockerDoctorChecks } from "../isolation/docker.doctor";
import { createDockerIsolation } from "../isolation/isolation.docker";
import { createNotifier } from "../notify";
import { createExec, systemClock } from "../ports";
import { ensureUiBuilt } from "./server.ui";
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
  /** `lessons.jsonl` of the desk state, aggregated against the repository's instructions now. */
  readonly lessons?: (() => Promise<LessonReport>) | undefined;
  /** Promote, unpromote, and open an issue for a lesson. */
  readonly lessonActions?: LessonActions | undefined;
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
    const claude = createClaudeRunner();
    const codex = createCodexRunner();
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
      hostRunnerFor: (provider: Provider) => (provider === "claude" ? claude : codex),
      repoRoot: location.repoRoot,
      stateRoot: location.stateRoot,
      config
    });

    await recoverInterrupted(store, { clock: systemClock, log });
    const lessonDesk = createLessonDesk({
      stateRoot: location.stateRoot,
      clock: systemClock,
      github,
      owner: config.owner,
      currentRepo: () => repoFingerprint(location.repoRoot)
    });
    const runner = createPipelineRunner({
      exec,
      git: createGitPort(exec),
      github,
      runnerFor: (provider: Provider) => (provider === "claude" ? claude : codex),
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
        feedbackFromPr: runner.feedbackFromPr,
        draft: runner.draft,
        applyDraft: runner.applyDraft,
        pause: runner.pause,
        resume: runner.resume
      },
      readRuns: () => readRunRecords(location.stateRoot),
      prRoundLimit: config.maxPrRounds,
      lessons: lessonDesk.report,
      lessonActions: lessonDesk.actions,
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
      dispose: () => notifier.settled()
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
      lessons: runtime.lessons,
      lessonActions: runtime.lessonActions,
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
