import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AgentProcess } from "../agents/agent.process";
import type {
  AgentFailure,
  AgentRunOutcome,
  AgentRunPartial,
  AgentRunRequest,
  AgentRunner
} from "../agents/agent.runner";
import { createClaudeRunner } from "../agents/claude.runner";
import { createCodexRunner } from "../agents/codex.runner";
import { buildRunSettings } from "../agents/permissions";
import type { Provider } from "../contracts";
import { agentContainer, dockerRunArgs, authSyncContainer, INPUT, WORKSPACE } from "./docker.args";
import { containerBase, type DockerContext } from "./docker.context";
import { allFilters, authVolume, resourceLabels, runFilter } from "./docker.names";
import { withProxy } from "./docker.proxy";
import {
  makeStaging,
  readStateFile,
  syncIn,
  syncOut,
  workspaceVolumes,
  type WorkspaceTarget
} from "./docker.workspace";

/**
 * An `AgentRunner` that runs the provider CLI in a container. It reuses the
 * Claude and Codex runners unchanged: they build the arguments and parse the
 * stream. This module only supplies a different `AgentProcess` (`docker run`
 * with the hardening flags) and moves the work in and out of the issue volume.
 *
 * One run does this, in order:
 * 1. import the worktree into the volume (and install dependencies if needed);
 * 2. start the providers proxy, run the agent container with `--network none`;
 * 3. remove the container by label and verify it is gone;
 * 4. export the patch and apply it to the host worktree, guarded;
 * 5. copy the receipts back and return a refreshed login to the auth volume.
 *
 * Every step after the import runs even if the agent failed, so the host sees
 * what the agent left, exactly as in host mode.
 */

export interface DockerRunnerDeps {
  readonly context: DockerContext;
  /** Streams `docker run`. The real one is `createAgentProcess()`. */
  readonly process: AgentProcess;
  /** Variable names the config forwards into the container (API keys). Empty by default. */
  readonly forwardEnv: readonly string[];
  /** Program names inside the image. Tests replace them with a scripted agent. */
  readonly binaries?: Partial<Record<Provider, string>> | undefined;
}

export interface DockerStage {
  readonly target: WorkspaceTarget;
  readonly artifactsDir: string;
}

const RECEIPT_HOOK = "/opt/desk/receipt.mjs";
const LOGIN_PATTERN = /log.?in|credential|unauthori[sz]ed|authenticat/i;
const loginHint = (provider: Provider): string =>
  ` Run 'pnpm desk docker login --provider ${provider}' if the login is missing or expired.`;

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : "unknown error";

const failure = (
  message: string,
  partial: AgentRunPartial = { trace: [], sessionId: null, denials: [] }
): { ok: false; failure: AgentFailure; partial: AgentRunPartial } => ({
  ok: false,
  failure: { kind: "process-error", message, exitCode: null, stderrTail: "" },
  partial
});

export const createDockerAgentRunner = (
  deps: DockerRunnerDeps,
  stage: DockerStage
): AgentRunner => ({
  run: async <T>(request: AgentRunRequest<T>): Promise<AgentRunOutcome<T>> => {
    const { context } = deps;
    const provider = request.provider;
    const receipts = `/state/receipts-${request.role}.jsonl`;

    // 1. Import. A failure here means the agent never started.
    let synced;
    try {
      synced = await syncIn(context, stage.target, [receipts]);
    } catch (error) {
      return failure(`The Docker import failed: ${describe(error)}`);
    }

    const staging = await makeStaging(context, "agent");
    let outcome: AgentRunOutcome<T>;
    const cleanup: { error: string | null } = { error: null };
    try {
      const ticket = path.join(stage.artifactsDir, "ticket.md");
      await mkdir(path.join(staging, "artifacts"), { recursive: true });
      await copyFile(ticket, path.join(staging, "artifacts", "ticket.md")).catch(() => undefined);
      if (provider === "claude" && request.settingsPath !== undefined) {
        // The hooks run inside the container, so their paths are container paths.
        await writeFile(
          path.join(staging, "settings.json"),
          `${JSON.stringify(
            buildRunSettings({
              worktree: WORKSPACE,
              receiptsPath: receipts,
              receiptHookPath: RECEIPT_HOOK
            }),
            null,
            2
          )}\n`,
          "utf8"
        );
      }

      const mapped: AgentRunRequest<T> = {
        ...request,
        cwd: WORKSPACE,
        // A large ticket is passed as a file path. The container reads its copy.
        prompt: request.prompt.split(stage.artifactsDir).join(`${INPUT}/artifacts`),
        settingsPath:
          provider === "claude" && request.settingsPath !== undefined
            ? `${INPUT}/settings.json`
            : undefined,
        // MCP servers need a network or a host tool. None runs in a container.
        mcpConfigPath: undefined,
        receiptsPath: receipts,
        // A new volume has no session store, so an old session id cannot resume.
        resumeSessionId: synced.fresh ? undefined : request.resumeSessionId,
        // The container is the sandbox for Codex. Claude keeps its allowlist.
        allowCodexBuilder: provider === "codex" ? true : request.allowCodexBuilder,
        containerSandbox: provider === "codex"
      };

      outcome = await withProxy(context, "providers", async (socket) => {
        const volumes = workspaceVolumes(context);
        await context.docker.ensureVolume(authVolume(provider), resourceLabels(null, "auth"));
        const runId = context.newId();
        const base = containerBase(context, "agent", runId, context.limits.agent);

        const dockerProcess: AgentProcess = async (processRequest) => {
          const spec = agentContainer({
            ...base,
            provider,
            workspaceVolume: volumes.workspace,
            stateVolume: volumes.state,
            authVolume: authVolume(provider),
            socketVolume: socket,
            stagingDir: staging,
            argv: processRequest.argv,
            env: processRequest.env ?? {},
            forwardEnv: deps.forwardEnv
          });
          const result = await deps.process({
            ...processRequest,
            argv: ["docker", ...dockerRunArgs(spec)],
            cwd: staging,
            // The Docker client needs no variable from the request: they are container flags now.
            env: {}
          });
          // A killed `docker run` client can leave its container. Remove it and verify.
          try {
            await context.docker.removeContainers([...allFilters(), runFilter(runId)]);
          } catch (error) {
            cleanup.error = describe(error);
          }
          return result;
        };

        const binary = deps.binaries?.[provider] ?? provider;
        const runner =
          provider === "claude"
            ? createClaudeRunner({ process: dockerProcess, binary })
            : createCodexRunner({
                process: dockerProcess,
                binary,
                insideContainer: true,
                makeTempDir: () => Promise.resolve(staging),
                argPaths: () => ({
                  schemaPath: `${INPUT}/output-schema.json`,
                  outputPath: "/tmp/desk-last-message.txt"
                })
              });
        return runner.run(mapped);
      });
    } catch (error) {
      outcome = failure(`The Docker run failed: ${describe(error)}`);
    } finally {
      await rm(staging, { recursive: true, force: true });
    }

    // 4 and 5. Always bring the work back, whatever the agent did.
    const problems: string[] = [];
    if (cleanup.error !== null) problems.push(`Container cleanup is unverified: ${cleanup.error}`);
    try {
      await syncOut(context, stage.target, synced);
    } catch (error) {
      problems.push(describe(error));
    }
    try {
      const text = await readStateFile(context, receipts);
      if (text !== null && request.receiptsPath !== undefined) {
        await mkdir(path.dirname(request.receiptsPath), { recursive: true });
        await writeFile(request.receiptsPath, text, "utf8");
      }
    } catch (error) {
      problems.push(`The receipts could not be read: ${describe(error)}`);
    }
    try {
      const volumes = workspaceVolumes(context);
      await context.docker.ok(
        dockerRunArgs(
          authSyncContainer({
            ...containerBase(context, "auth-sync", context.newId(), context.limits.helper),
            provider,
            authVolume: authVolume(provider),
            stateVolume: volumes.state
          })
        ),
        { timeoutMs: 60_000 }
      );
    } catch (error) {
      // A refresh that is not saved only means a later run refreshes again. It is a warning.
      request.onEvent?.({
        type: "error",
        message: `The login refresh could not be saved: ${describe(error)}`
      });
    }
    for (const problem of problems) request.onEvent?.({ type: "error", message: problem });

    if (outcome.ok) {
      if (problems.length === 0) return outcome;
      return failure(`The agent finished, but the Docker transfer failed. ${problems.join(" ")}`, {
        trace: outcome.result.trace,
        sessionId: outcome.result.sessionId,
        denials: outcome.result.denials
      });
    }
    if (outcome.failure.kind !== "process-error") return outcome;
    const hint = LOGIN_PATTERN.test(outcome.failure.message) ? loginHint(provider) : "";
    const detail = problems.length > 0 ? ` ${problems.join(" ")}` : "";
    if (hint === "" && detail === "") return outcome;
    return {
      ok: false,
      failure: { ...outcome.failure, message: `${outcome.failure.message}${hint}${detail}` },
      partial: outcome.partial
    };
  }
});
