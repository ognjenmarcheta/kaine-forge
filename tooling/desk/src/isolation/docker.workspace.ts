import { cp, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import {
  dockerRunArgs,
  fetchContainer,
  readStateContainer,
  workspaceContainer
} from "./docker.args";
import { containerBase, parseReply, runContainer, type DockerContext } from "./docker.context";
import { issueVolume, resourceLabels } from "./docker.names";
import { applyPatch, guardPatch } from "./docker.patch";
import { withProxy } from "./docker.proxy";
import { DIFF_FLAGS, diffAgainstBase, parseNameStatus, type DiffResult } from "../git/git.diff";
import { runGit } from "../git/git.real";

/**
 * Moving work between the host worktree and the issue volume. The worktree is
 * never mounted.
 *
 * In: the base commit as a `git bundle` (only when the volume lacks it), the
 * work in progress as `git diff --binary`, and the agent files (skills) as a
 * read-only folder. A helper container makes `/workspace` equal to base plus
 * patch and reports the diff hash. The host compares it with its own diff hash.
 * Out: the patch since that checkpoint, size-capped, checked by `guardPatch`,
 * applied by `git apply`, and compared by hash again.
 */

export class TransferError extends Error {
  override readonly name = "TransferError";
}

const AGENT_FILES = [".claude/skills", ".claude/agents", ".agents", ".codex/config.toml"] as const;

const syncReplySchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("needs-bundle") }),
  z.object({
    status: z.literal("ready"),
    diffHash: z.string().regex(/^[0-9a-f]{64}$/),
    checkpointTree: z.string(),
    lockKey: z.string(),
    installedKey: z.string().nullable()
  })
]);
const diffReplySchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    diffHash: z.string().regex(/^[0-9a-f]{64}$/),
    bytes: z.number().int().nonnegative(),
    patch: z.string(),
    nameStatus: z.string().nullable()
  }),
  z.object({
    status: z.literal("too-large"),
    diffHash: z.string(),
    bytes: z.number().int().nonnegative()
  })
]);

export interface WorkspaceTarget {
  /** The host worktree. */
  readonly worktree: string;
  readonly baseSha: string;
}

export interface SyncedWorkspace {
  /** Diff hash of base plus the work in progress, equal on both sides. */
  readonly checkpointHash: string;
  /** The volume had no workspace before this call. */
  readonly fresh: boolean;
}

const requireScope = (context: DockerContext) => {
  if (context.owner === null) throw new TransferError("A workspace belongs to one issue.");
  return context.owner;
};

export const workspaceVolumes = (context: DockerContext) => {
  const scope = requireScope(context);
  return {
    workspace: issueVolume(scope, "ws"),
    state: issueVolume(scope, "state"),
    store: issueVolume(scope, "store")
  };
};

/** Create the three per-issue volumes. Returns true when the workspace volume is new. */
export const ensureIssueVolumes = async (context: DockerContext): Promise<boolean> => {
  const volumes = workspaceVolumes(context);
  const created = await context.docker.ensureVolume(
    volumes.workspace,
    resourceLabels(context.owner, "ws")
  );
  await context.docker.ensureVolume(volumes.state, resourceLabels(context.owner, "state"));
  await context.docker.ensureVolume(volumes.store, resourceLabels(context.owner, "store"));
  return created;
};

const exists = async (target: string): Promise<boolean> => {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
};

/** A fresh staging folder under the desk state, never inside the worktree. */
export const makeStaging = async (context: DockerContext, prefix: string): Promise<string> => {
  await mkdir(context.stagingRoot, { recursive: true });
  return mkdtemp(path.join(context.stagingRoot, `${prefix}-`));
};

const copyAgentFiles = async (worktree: string, destination: string): Promise<void> => {
  for (const relative of AGENT_FILES) {
    const source = path.join(worktree, relative);
    if (!(await exists(source))) continue;
    const target = path.join(destination, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target, { recursive: true, dereference: false });
  }
};

const createBundle = async (context: DockerContext, target: WorkspaceTarget, file: string) => {
  const head = (await runGit(context.exec, target.worktree, ["rev-parse", "HEAD"])).stdout.trim();
  if (head !== target.baseSha) {
    throw new TransferError(
      `HEAD is ${head.slice(0, 12)}, not the base ${target.baseSha.slice(0, 12)}. The container needs the base commit.`
    );
  }
  await runGit(context.exec, target.worktree, ["bundle", "create", "--quiet", file, "HEAD"], {
    timeoutMs: 300_000
  });
};

const helperPayload = (context: DockerContext, target: WorkspaceTarget) => ({
  baseSha: target.baseSha,
  baseBranch: context.baseBranch,
  flags: [...DIFF_FLAGS]
});

/**
 * Make the volume equal to the host worktree: base plus work in progress. A
 * dependency install runs first when the lockfile changed since the last one.
 * `removeFiles` lists files in `/state` to delete (old receipts).
 */
export const syncIn = async (
  context: DockerContext,
  target: WorkspaceTarget,
  removeFiles: readonly string[] = []
): Promise<SyncedWorkspace> => {
  const fresh = await ensureIssueVolumes(context);
  const volumes = workspaceVolumes(context);
  const host = await diffAgainstBase(context.exec, target.worktree, target.baseSha);

  const staging = await makeStaging(context, "in");
  try {
    await writeFile(path.join(staging, "wip.patch"), host.patch, "utf8");
    await copyAgentFiles(target.worktree, path.join(staging, "agent-files"));

    const sync = async () => {
      const runId = context.newId();
      const result = await runContainer(
        context,
        runId,
        dockerRunArgs(
          workspaceContainer({
            ...containerBase(context, "import", runId, context.limits.helper),
            kind: "import",
            operation: "sync",
            workspaceVolume: volumes.workspace,
            stateVolume: volumes.state,
            stagingDir: staging
          })
        ),
        {
          input: JSON.stringify({ ...helperPayload(context, target), removeFiles }),
          timeoutMs: 600_000
        }
      );
      return parseReply(result.stdout, syncReplySchema, "The import helper");
    };

    let reply = await sync();
    if (reply.status === "needs-bundle") {
      await createBundle(context, target, path.join(staging, "base.bundle"));
      reply = await sync();
    }
    if (reply.status !== "ready") {
      throw new TransferError("The container did not accept the base commit bundle.");
    }
    if (reply.diffHash !== host.diffHash) {
      throw new TransferError(
        "The container workspace differs from the worktree after the import (diff hash mismatch). A tracked file that is not valid UTF-8 can cause this."
      );
    }
    if (reply.installedKey !== reply.lockKey) await installDependencies(context);
    return { checkpointHash: reply.diffHash, fresh };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
};

/**
 * Fill the pnpm store through the registry-only proxy, then install offline in a
 * container with no network. The host `node_modules` is never copied: its native
 * binaries are for macOS.
 */
export const installDependencies = async (context: DockerContext): Promise<void> => {
  const volumes = workspaceVolumes(context);
  await withProxy(context, "dependencies", async (socket) => {
    const runId = context.newId();
    await runContainer(
      context,
      runId,
      dockerRunArgs(
        fetchContainer({
          ...containerBase(context, "fetch", runId, context.limits.check),
          workspaceVolume: volumes.workspace,
          storeVolume: volumes.store,
          socketVolume: socket
        })
      ),
      { timeoutMs: 30 * 60_000 }
    );
  });
  const runId = context.newId();
  await runContainer(
    context,
    runId,
    dockerRunArgs(
      workspaceContainer({
        ...containerBase(context, "install", runId, context.limits.check),
        kind: "install",
        operation: "install",
        workspaceVolume: volumes.workspace,
        stateVolume: volumes.state,
        storeVolume: volumes.store
      })
    ),
    { input: "{}", timeoutMs: 30 * 60_000 }
  );
};

export interface PatchOut {
  readonly changed: boolean;
  /** Diff hash of the container workspace against the base. */
  readonly diffHash: string;
  readonly files: readonly string[];
}

/**
 * Bring the container's changes back: the patch since the checkpoint, checked
 * and applied to the host worktree. Afterwards the host diff hash must equal the
 * container's, or the transfer is reported as failed. The worktree must still be
 * as `syncIn` left it, so a change made on the host during the run is not lost.
 */
export const syncOut = async (
  context: DockerContext,
  target: WorkspaceTarget,
  synced: SyncedWorkspace
): Promise<PatchOut> => {
  const volumes = workspaceVolumes(context);
  const runId = context.newId();
  const result = await runContainer(
    context,
    runId,
    dockerRunArgs(
      workspaceContainer({
        ...containerBase(context, "export", runId, context.limits.helper),
        kind: "export",
        operation: "diff",
        workspaceVolume: volumes.workspace,
        stateVolume: volumes.state
      })
    ),
    {
      input: JSON.stringify({
        ...helperPayload(context, target),
        since: "checkpoint",
        maxBytes: context.maxPatchBytes
      }),
      timeoutMs: 600_000
    }
  );
  const reply = parseReply(result.stdout, diffReplySchema, "The export helper");
  if (reply.status === "too-large") {
    throw new TransferError(
      `The container patch is ${reply.bytes} bytes. The limit is ${context.maxPatchBytes} bytes. Nothing was applied.`
    );
  }
  const patch = Buffer.from(reply.patch, "base64").toString("utf8");
  if (patch === "") return { changed: false, diffHash: reply.diffHash, files: [] };

  const verdict = await guardPatch(context.exec, target.worktree, patch, {
    maxBytes: context.maxPatchBytes
  });
  if (!verdict.ok) {
    throw new TransferError(
      `The patch from the container was refused. Nothing was applied.\n${verdict.reasons.map((reason) => `- ${reason}`).join("\n")}`
    );
  }
  const before = await diffAgainstBase(context.exec, target.worktree, target.baseSha);
  if (before.diffHash !== synced.checkpointHash) {
    throw new TransferError(
      "The worktree changed while the container ran. Nothing was applied. The container work is kept in the volume."
    );
  }
  await applyPatch(context.exec, target.worktree, patch);
  const after: DiffResult = await diffAgainstBase(context.exec, target.worktree, target.baseSha);
  if (after.diffHash !== reply.diffHash) {
    throw new TransferError(
      "The worktree differs from the container after the patch (diff hash mismatch). The patch is applied; check `git status` in the worktree."
    );
  }
  return { changed: true, diffHash: reply.diffHash, files: verdict.files };
};

/** The diff of the container workspace against the base, for the check report. */
export const containerDiff = async (
  context: DockerContext,
  target: WorkspaceTarget
): Promise<DiffResult> => {
  const volumes = workspaceVolumes(context);
  const runId = context.newId();
  const result = await runContainer(
    context,
    runId,
    dockerRunArgs(
      workspaceContainer({
        ...containerBase(context, "export", runId, context.limits.helper),
        kind: "export",
        operation: "diff",
        workspaceVolume: volumes.workspace,
        stateVolume: volumes.state
      })
    ),
    {
      input: JSON.stringify({
        ...helperPayload(context, target),
        since: "base",
        nameStatus: true,
        maxBytes: context.maxPatchBytes * 2
      }),
      timeoutMs: 600_000
    }
  );
  const reply = parseReply(result.stdout, diffReplySchema, "The export helper");
  if (reply.status === "too-large" || reply.nameStatus === null) {
    throw new TransferError("The container diff is too large to hash.");
  }
  return {
    patch: Buffer.from(reply.patch, "base64").toString("utf8"),
    files: parseNameStatus(Buffer.from(reply.nameStatus, "base64").toString("utf8")),
    diffHash: reply.diffHash
  };
};

/** Read one file from the state volume. A missing file reads as `null`. */
export const readStateFile = async (
  context: DockerContext,
  file: string
): Promise<string | null> => {
  const volumes = workspaceVolumes(context);
  const runId = context.newId();
  const result = await context.docker.run(
    dockerRunArgs(
      readStateContainer({
        ...containerBase(context, "export", runId, context.limits.helper),
        stateVolume: volumes.state,
        file
      })
    ),
    { timeoutMs: 120_000 }
  );
  return result.code === 0 ? result.stdout : null;
};
