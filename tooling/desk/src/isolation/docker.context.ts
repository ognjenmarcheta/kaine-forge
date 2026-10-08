import { z } from "zod";

import type { Exec, ExecResult } from "../ports";
import type { ContainerBase, Resources } from "./docker.args";
import type { RunOptions, DockerClient } from "./docker.cli";
import { allFilters, containerName, resourceLabels, runFilter, type Owner } from "./docker.names";

/**
 * What every Docker step needs: the client, the image, whose resources they
 * are, and where to stage files. One context belongs to one issue.
 */
export interface DockerContext {
  readonly docker: DockerClient;
  /** Runs host commands (git) and Docker. Its output cap must exceed the largest patch. */
  readonly exec: Exec;
  readonly image: string;
  readonly owner: Owner;
  readonly newId: () => string;
  readonly sleep: (ms: number) => Promise<void>;
  /** A folder on the host for files that a container reads. Not the worktree. */
  readonly stagingRoot: string;
  readonly baseBranch: string;
  readonly limits: {
    readonly agent: Resources;
    readonly check: Resources;
    readonly helper: Resources;
    readonly proxy: Resources;
  };
  readonly maxPatchBytes: number;
}

export const containerBase = (
  context: DockerContext,
  kind: string,
  runId: string,
  resources: Resources
): ContainerBase => ({
  image: context.image,
  name: containerName(context.owner, kind, runId),
  labels: resourceLabels(context.owner, kind, runId),
  resources
});

/** The last non-empty line of stdout, parsed by `schema`. Helper scripts print one JSON line. */
export const parseReply = <T>(stdout: string, schema: z.ZodType<T>, what: string): T => {
  const line = stdout
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")
    .at(-1);
  let json: unknown;
  try {
    json = JSON.parse(line ?? "");
  } catch {
    throw new Error(`${what} printed no JSON result.`);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new Error(`${what} printed an unexpected result.`);
  return parsed.data;
};

/**
 * `docker run` that must succeed. A timed-out call kills the Docker client but not always its
 * container, so a failed run removes the containers of its run label before it rethrows.
 */
export const runContainer = async (
  context: DockerContext,
  runId: string,
  args: readonly string[],
  options?: RunOptions
): Promise<ExecResult> => {
  try {
    return await context.docker.ok(args, options);
  } catch (error) {
    await context.docker
      .removeContainers([...allFilters(), runFilter(runId)])
      .catch(() => undefined);
    throw error;
  }
};
