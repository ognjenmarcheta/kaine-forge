import { randomBytes } from "node:crypto";
import path from "node:path";

import type { AgentProcess } from "../agents/agent.process";
import type { AgentRunOutcome, AgentRunRequest, AgentRunner } from "../agents/agent.runner";
import type { CheckExecutor } from "../check";
import { runChecks } from "../check";
import type { DeskConfig, Provider } from "../contracts";
import type { Exec, ExecRequest, ExecResult } from "../ports";
import { checkContainer, dockerRunArgs, type Resources } from "./docker.args";
import { createDockerClient, type DockerClient } from "./docker.cli";
import { containerBase, type DockerContext } from "./docker.context";
import { inspectImage, readImageContext } from "./docker.image";
import {
  allFilters,
  issueFilters,
  repoKeyFor,
  runFilter,
  type ResourceScope
} from "./docker.names";
import { createDockerAgentRunner } from "./docker.runner";
import {
  containerDiff,
  syncIn,
  syncOut,
  workspaceVolumes,
  type WorkspaceTarget
} from "./docker.workspace";
import type { IsolatedCheckRequest, IsolatedStage, IsolationPort } from "./isolation.port";

/**
 * Docker mode. The builder and the check steps run in containers. The host
 * worktree stays canonical: work goes in as a bundle and a patch, and comes out
 * as a guarded patch (see `docker.workspace.ts`). Planner and reviewer run no
 * repository code and stay on the host.
 */

export interface DockerIsolationDeps {
  /** Runs docker and git. Its output cap must exceed the largest patch (about 1.4 times, base64). */
  readonly exec: Exec;
  /** Streams `docker run` for an agent. */
  readonly process: AgentProcess;
  readonly hostRunnerFor: (provider: Provider) => AgentRunner;
  readonly repoRoot: string;
  readonly stateRoot: string;
  readonly config: Pick<DeskConfig, "docker">;
  /** The base branch on `origin`. Default `main`. */
  readonly baseBranch?: string;
  /** Test seams. */
  readonly imageTag?: string;
  readonly newId?: () => string;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly binaries?: Partial<Record<Provider, string>>;
}

export interface DockerIsolation extends IsolationPort {
  readonly docker: DockerClient;
  readonly scopeOf: (issue: number) => ResourceScope;
  readonly contextFor: (issue: number) => Promise<DockerContext>;
  /** A context for steps that belong to no issue: login and the doctor probes. */
  readonly machineContext: () => Promise<DockerContext>;
  readonly imageTag: () => Promise<string>;
}

const HELPER: Resources = { memory: "2g", cpus: 2, pidsLimit: 512 };
const PROXY: Resources = { memory: "128m", cpus: 1, pidsLimit: 64 };

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : "unknown error";

export const randomRunId = (): string => randomBytes(4).toString("hex");

export const createDockerIsolation = (deps: DockerIsolationDeps): DockerIsolation => {
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const docker = createDockerClient(deps.exec, { sleep });
  const repoKey = repoKeyFor(deps.repoRoot);
  const newId = deps.newId ?? randomRunId;
  const { docker: settings } = deps.config;
  let tag: Promise<string> | null = null;

  const imageTag = (): Promise<string> => {
    tag ??=
      deps.imageTag !== undefined
        ? Promise.resolve(deps.imageTag)
        : readImageContext(deps.repoRoot).then((context) => context.tag);
    return tag;
  };
  const scopeOf = (issue: number): ResourceScope => ({ repoKey, issue });

  const buildContext = async (
    owner: ResourceScope | null,
    stagingRoot: string
  ): Promise<DockerContext> => ({
    docker,
    exec: deps.exec,
    image: await imageTag(),
    owner,
    newId,
    sleep,
    stagingRoot,
    baseBranch: deps.baseBranch ?? "main",
    limits: { agent: settings.agent, check: settings.check, helper: HELPER, proxy: PROXY },
    maxPatchBytes: settings.maxPatchBytes
  });
  const contextFor: DockerIsolation["contextFor"] = (issue) =>
    buildContext(scopeOf(issue), path.join(deps.stateRoot, "issues", String(issue), "docker"));
  const machineContext: DockerIsolation["machineContext"] = () =>
    buildContext(null, path.join(deps.stateRoot, "docker-machine"));

  /** The image must be on the machine. A missing image is an instruction, not a pull. */
  const requireImage = async (): Promise<string | null> => {
    const state = await inspectImage(deps.exec, await imageTag());
    if (state.status === "current") return null;
    if (state.status === "unreachable") {
      return `Docker is not reachable: ${state.detail}. Start Docker, then continue.`;
    }
    return `The worker image ${state.tag} is ${state.status === "stale" ? "out of date" : "missing"}. Run 'pnpm desk docker build', then continue.`;
  };

  const runnerFor: IsolationPort["runnerFor"] = (stage: IsolatedStage) => {
    if (stage.role !== "builder") return deps.hostRunnerFor(stage.provider);
    return {
      run: async <T>(request: AgentRunRequest<T>): Promise<AgentRunOutcome<T>> => {
        const missing = await requireImage();
        if (missing !== null) {
          return {
            ok: false,
            failure: { kind: "process-error", message: missing, exitCode: null, stderrTail: "" },
            partial: { trace: [], sessionId: null, denials: [] }
          };
        }
        const context = await contextFor(stage.issue);
        return createDockerAgentRunner(
          {
            context,
            process: deps.process,
            forwardEnv: settings.forwardEnv,
            binaries: deps.binaries
          },
          {
            target: { worktree: stage.worktree, baseSha: stage.baseSha },
            artifactsDir: stage.artifactsDir
          }
        ).run(request);
      }
    };
  };

  /** One check step in its own container. A killed client leaves nothing: the container is removed by label. */
  const stepInContainer =
    (context: DockerContext): Exec =>
    async (step: ExecRequest): Promise<ExecResult> => {
      const runId = context.newId();
      const spec = checkContainer({
        ...containerBase(context, "check", runId, context.limits.check),
        workspaceVolume: workspaceVolumes(context).workspace,
        argv: step.argv,
        env: step.env ?? {}
      });
      const result = await context.exec({
        argv: ["docker", ...dockerRunArgs(spec)],
        ...(step.timeoutMs === undefined ? {} : { timeoutMs: step.timeoutMs })
      });
      try {
        await context.docker.removeContainers([...allFilters(), runFilter(runId)]);
      } catch (error) {
        return {
          ...result,
          code: result.code === 0 ? 1 : result.code,
          stderr: `${result.stderr}\nContainer cleanup is unverified: ${describe(error)}`.trim()
        };
      }
      return result;
    };

  const runChecksInDocker: IsolationPort["runChecks"] = async (request: IsolatedCheckRequest) => {
    const missing = await requireImage();
    if (missing !== null) throw new Error(missing);
    const context = await contextFor(request.issue);
    const target: WorkspaceTarget = { worktree: request.worktree, baseSha: request.baseSha };
    const synced = await syncIn(context, target);
    const executor: CheckExecutor = {
      exec: stepInContainer(context),
      diff: () => containerDiff(context, target),
      roots: ["/workspace", "/tmp", "/home/desk"]
    };
    let report;
    try {
      report = await runChecks({ ...request, executor });
    } catch (error) {
      // Bring back what the steps changed, then report the original failure.
      await syncOut(context, target, synced).catch(() => undefined);
      throw error;
    }
    const out = await syncOut(context, target, synced);
    if (out.diffHash !== report.diffHash) {
      throw new Error(
        "The check report and the container workspace disagree about the diff. Run the checks again."
      );
    }
    return report;
  };

  const removeContainers: IsolationPort["removeContainers"] = async (issue) => {
    try {
      const filters = issueFilters(scopeOf(issue));
      const removed = await docker.removeContainers(filters);
      // The socket volume of a killed run is useless. The workspace and state volumes stay.
      await docker.removeVolumes([...filters, "label=kaine-desk.kind=sock"]);
      return removed.length === 0
        ? null
        : `Removed ${removed.length} Docker container(s) that a stopped run left: ${removed.join(", ")}.`;
    } catch (error) {
      return `Could not check for leftover Docker containers: ${describe(error)}`;
    }
  };

  const removeIssue: IsolationPort["removeIssue"] = async (issue) => {
    const filters = issueFilters(scopeOf(issue));
    const containers = await docker.removeContainers(filters);
    const volumes = await docker.removeVolumes(filters);
    return containers.length + volumes.length === 0
      ? null
      : `Removed ${containers.length} container(s) and ${volumes.length} volume(s) of the issue.`;
  };

  const preflight: IsolationPort["preflight"] = async () => {
    const daemon = await docker.reachable();
    if (!daemon.ok) return `Docker is not reachable: ${daemon.detail}`;
    return requireImage();
  };

  return {
    mode: "docker",
    docker,
    preflight,
    scopeOf,
    contextFor,
    machineContext,
    imageTag,
    runnerFor,
    runChecks: runChecksInDocker,
    removeContainers,
    removeIssue
  };
};
