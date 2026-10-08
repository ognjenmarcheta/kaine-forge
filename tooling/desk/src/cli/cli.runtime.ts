import { stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadDeskConfig } from "../config/config.load";
import type { DeskConfig } from "../contracts";
import type { CliDeps, CliIo } from "./cli.types";
import { recoverInterrupted } from "../engine/pipeline.recovery";
import { createPipelineRunner, type PipelineRunner } from "../engine/pipeline.runner";
import type { PipelineDeps, PipelineEvent } from "../engine/pipeline.types";
import { createDockerIsolation, type DockerIsolation } from "../isolation/isolation.docker";
import { containerCleanupFor } from "../isolation/isolation.select";
import { formatLogRecord, isLiveWorthy, toLogRecord } from "../log/log.record";
import { createLogSink } from "../log/log.writer";
import { createNotifier } from "../notify/notify.command";
import { createIssueStore, type IssueStore } from "../store/store.issue";
import { configPath, resolveRepoLocation, type RepoLocation } from "../store/store.root";

/** The Docker isolation of this repository, or `undefined` when Docker is not wired in. */
export const dockerIsolationFor = (
  deps: CliDeps,
  location: Pick<RepoLocation, "repoRoot" | "stateRoot">,
  config: DeskConfig
): DockerIsolation | undefined =>
  deps.docker === undefined
    ? undefined
    : createDockerIsolation({
        exec: deps.docker.exec,
        process: deps.docker.process,
        hostRunnerFor: deps.runnerFor,
        repoRoot: location.repoRoot,
        stateRoot: location.stateRoot,
        config,
        ...(deps.docker.imageTag === undefined ? {} : { imageTag: deps.docker.imageTag }),
        ...(deps.docker.newId === undefined ? {} : { newId: deps.docker.newId }),
        ...(deps.docker.sleep === undefined ? {} : { sleep: deps.docker.sleep }),
        ...(deps.docker.binaries === undefined ? {} : { binaries: deps.docker.binaries })
      });

export interface Runtime {
  readonly location: RepoLocation;
  readonly config: DeskConfig;
  readonly store: IssueStore;
  readonly runner: PipelineRunner;
  /** Wait for the log writes and the notify commands. Call it before the process exits. */
  readonly settle: () => Promise<void>;
}

export interface RuntimeOptions {
  /** Print no progress: the command prints one JSON document. */
  readonly json: boolean;
  /** Write `agent.log.jsonl`. Off for `remove`, which deletes the issue directory. */
  readonly persistLog: boolean;
  /** `--no-writeback` on this call. A marker file from an earlier call counts too. */
  readonly noWriteback: boolean;
  /** The issue the command works on, for the marker file. */
  readonly issue: number;
  /** Retry or recover interrupted issues first. Every command that drives an issue does. */
  readonly recover: boolean;
}

export type OpenRuntimeResult =
  | { readonly ok: true; readonly runtime: Runtime }
  | { readonly ok: false; readonly message: string };

const MARKER = "no-writeback";

const writebackMarker = (store: IssueStore, issue: number): string =>
  path.join(store.issueDir(issue), MARKER);

const exists = async (file: string): Promise<boolean> => {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
};

/**
 * `--no-writeback` and `--snapshot-file` make the desk write nothing to GitHub
 * for the issue. The marker keeps that for the later calls (`approve`, ...),
 * which would otherwise write labels to a real issue with the same number.
 */
export const markNoWriteback = async (store: IssueStore, issue: number): Promise<void> => {
  if ((await store.read(issue)).status === "missing") return;
  await writeFile(writebackMarker(store, issue), "Do not write labels or comments to GitHub.\n");
};

/**
 * Load the config, build the pipeline runner with live output, the persistent
 * log and the notifier, and recover interrupted issues. A bad config comes
 * back as a message, not an exception.
 */
export const openRuntime = async (
  deps: CliDeps,
  io: CliIo,
  options: RuntimeOptions
): Promise<OpenRuntimeResult> => {
  const location = await resolveRepoLocation(deps.exec, deps.cwd);
  const loaded = await loadDeskConfig(configPath(location.repoRoot));
  if (!loaded.ok) {
    return { ok: false, message: `Config error (${loaded.reason}): ${loaded.detail}` };
  }
  const { config } = loaded;
  const store = createIssueStore(location.stateRoot);
  const sink = options.persistLog
    ? createLogSink({ store, clock: deps.clock, maxBytes: deps.logMaxBytes })
    : null;

  const onEvent = (event: PipelineEvent): void => {
    const now = deps.clock.now();
    const record = sink === null ? toLogRecord(event, now) : sink.write(event, now);
    if (record === null || options.json || !isLiveWorthy(record)) return;
    const line = `${formatLogRecord(record)}\n`;
    // Stage moves go to stdout. Agent activity and notes go to stderr.
    if (record.kind === "history") io.out(line);
    else io.err(line);
  };

  const warn = (message: string): void => {
    if (!options.json) io.err(`${message}\n`);
  };
  const notifier = createNotifier({
    exec: deps.exec,
    command: config.notifyCommand,
    cwd: location.repoRoot,
    log: warn
  });

  const noWriteback = options.noWriteback || (await exists(writebackMarker(store, options.issue)));
  const docker = dockerIsolationFor(deps, location, config);
  const pipelineDeps: PipelineDeps = {
    exec: deps.exec,
    git: deps.git,
    github: deps.createGitHub(location.repoRoot),
    runnerFor: deps.runnerFor,
    docker,
    store,
    clock: deps.clock,
    config,
    location: { repoRoot: location.repoRoot, stateRoot: location.stateRoot },
    notify: notifier.notify,
    onEvent,
    noWriteback,
    ...deps.pipeline
  };

  if (options.recover) {
    await recoverInterrupted(store, {
      clock: deps.clock,
      lease: deps.pipeline?.lease,
      cleanupIsolation: containerCleanupFor({ config, docker }),
      log: (message) => onEvent({ type: "log", issue: 0, message })
    });
  }

  return {
    ok: true,
    runtime: {
      location,
      config,
      store,
      runner: createPipelineRunner(pipelineDeps),
      settle: async () => {
        await sink?.flush();
        await notifier.settled();
        const failure = sink?.failure() ?? null;
        if (failure !== null) warn(`The agent log could not be written: ${failure}`);
      }
    }
  };
};
