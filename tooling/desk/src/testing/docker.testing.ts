import path from "node:path";

import { diffAgainstBase } from "../git";
import { createFakeDocker, jsonReply, type FakeDocker } from "./docker.fake";
import { createScratch, hermeticExec, type TestRepo, type TestScratch } from "./git.repo";
import { createDockerClient } from "../isolation/docker.cli";
import type { DockerContext } from "../isolation/docker.context";

/** A host repository, a fake Docker daemon and a context that joins them. */
export interface DockerEnv {
  readonly scratch: TestScratch;
  readonly repo: TestRepo;
  readonly baseSha: string;
  readonly docker: FakeDocker;
  readonly context: DockerContext;
  readonly target: { readonly worktree: string; readonly baseSha: string };
  /** Make the fake `sync` helper answer `ready` with the host's real diff hash. */
  readonly answerSync: (over?: {
    readonly installedKey?: string | null;
    readonly lockKey?: string;
  }) => void;
  readonly cleanup: () => Promise<void>;
}

export const LOCK_KEY = "a".repeat(64);

export const createDockerEnv = async (): Promise<DockerEnv> => {
  const scratch = await createScratch();
  const repo = await scratch.repo("host");
  const baseSha = await repo.git(["rev-parse", "HEAD"]);
  const docker = createFakeDocker(hermeticExec);
  let counter = 0;
  const context: DockerContext = {
    docker: createDockerClient(docker.exec, { sleep: () => Promise.resolve(), verifyTries: 3 }),
    exec: docker.exec,
    image: "kaine-desk-worker:test",
    owner: { repoKey: "repo-1a2b3c", issue: 7 },
    newId: () => {
      counter += 1;
      return counter.toString(16).padStart(8, "0");
    },
    sleep: () => Promise.resolve(),
    stagingRoot: path.join(scratch.root, "staging"),
    baseBranch: "main",
    limits: {
      agent: { memory: "6g", cpus: 4, pidsLimit: 1024 },
      check: { memory: "6g", cpus: 4, pidsLimit: 2048 },
      helper: { memory: "2g", cpus: 2, pidsLimit: 512 },
      proxy: { memory: "128m", cpus: 1, pidsLimit: 64 }
    },
    maxPatchBytes: 1024 * 1024
  };
  const target = { worktree: repo.dir, baseSha };
  return {
    scratch,
    repo,
    baseSha,
    docker,
    context,
    target,
    answerSync: (over = {}) => {
      docker.handlers.set("desk-workspace.mjs sync", async () => {
        const host = await diffAgainstBase(hermeticExec, repo.dir, baseSha);
        return jsonReply({
          status: "ready",
          diffHash: host.diffHash,
          checkpointTree: "b".repeat(40),
          lockKey: over.lockKey ?? LOCK_KEY,
          installedKey:
            over.installedKey === undefined ? (over.lockKey ?? LOCK_KEY) : over.installedKey
        });
      });
    },
    cleanup: () => scratch.cleanup()
  };
};

/** The patch that `change` makes in the repository, as the export helper would print it. */
export const patchAfter = async (env: DockerEnv, change: () => Promise<void>): Promise<string> => {
  await change();
  const patch = (await diffAgainstBase(hermeticExec, env.repo.dir, env.baseSha)).patch;
  await env.repo.git(["reset", "--quiet", "--hard"]);
  await env.repo.git(["clean", "--quiet", "-fd"]);
  return patch;
};
