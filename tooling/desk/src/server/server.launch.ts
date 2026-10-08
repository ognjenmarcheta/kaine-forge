import { spawn } from "node:child_process";

import { createClaudeRunner } from "../agents/claude.runner";
import { createCodexRunner } from "../agents/codex.runner";
import { loadDeskConfig } from "../config/config.load";
import type { IssueState, Provider } from "../contracts";
import type { ServerRunner } from "./server.actions";
import { createEventBus, type PipelineEventListener } from "./server.events";
import { createDeskServer, type DeskServer, type DeskServerDeps } from "./server.http";
import { runDoctor, type DoctorReport } from "../doctor/doctor.checks";
import { recoverInterrupted } from "../engine/pipeline.recovery";
import { createPipelineRunner } from "../engine/pipeline.runner";
import { diffAgainstBase, createGitPort } from "../git";
import { createGitHubPort } from "../github/github.port";
import { createNotifier } from "../notify";
import { createExec, systemClock } from "../ports";
import { ensureUiBuilt } from "./server.ui";
import { createIssueStore, type IssueStore } from "../store/store.issue";
import { configPath, resolveRepoLocation } from "../store/store.root";

export { DEFAULT_UI_DIR } from "./server.ui";

/** What the server needs from the desk. The CLI can pass its own. */
export interface DeskRuntime {
  readonly runner: ServerRunner;
  readonly store: IssueStore;
  readonly health: () => Promise<DoctorReport>;
  readonly currentDiffHash?: ((state: IssueState) => Promise<string | null>) | undefined;
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

    await recoverInterrupted(store, { clock: systemClock, log });
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
        ship: runner.ship
      },
      health: () =>
        runDoctor({
          exec,
          github,
          cwd: location.repoRoot,
          nodeVersion: process.version,
          loadConfig: () => loadDeskConfig(configPath(location.repoRoot))
        }),
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
      currentDiffHash: runtime.currentDiffHash,
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
