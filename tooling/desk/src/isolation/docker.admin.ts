import type { Provider } from "../contracts";
import { dockerRunArgs, loginContainer } from "./docker.args";
import type { DockerClient } from "./docker.cli";
import { containerBase, type DockerContext } from "./docker.context";
import {
  buildImage,
  inspectImage,
  readImageContext,
  type BuildOptions,
  type BuildResult,
  type ImageState
} from "./docker.image";
import {
  DESK_LABEL,
  LABEL_ISSUE,
  LABEL_KIND,
  allFilters,
  authVolume,
  issueFilters,
  resourceLabels,
  type ResourceScope
} from "./docker.names";
import { withProxy } from "./docker.proxy";
import type { Exec } from "../ports";

/** Commands that act on the machine, not on one run: build, login, status, prune. */

export const buildWorkerImage = async (
  exec: Exec,
  repoRoot: string,
  options: BuildOptions = {}
): Promise<BuildResult> => buildImage(exec, await readImageContext(repoRoot), options);

export interface DockerStatus {
  readonly daemon: { readonly ok: boolean; readonly detail: string };
  readonly image: ImageState | null;
  readonly containers: readonly {
    readonly name: string;
    readonly status: string;
    readonly issue: string;
  }[];
  readonly volumes: readonly {
    readonly name: string;
    readonly kind: string;
    readonly issue: string;
  }[];
  readonly images: readonly { readonly name: string; readonly size: string }[];
}

const rows = (text: string): string[][] =>
  text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => line.split("\t"));

export const dockerStatus = async (
  docker: DockerClient,
  exec: Exec,
  imageTag: string
): Promise<DockerStatus> => {
  const daemon = await docker.reachable();
  if (!daemon.ok) {
    return {
      daemon: { ok: false, detail: daemon.detail },
      image: null,
      containers: [],
      volumes: [],
      images: []
    };
  }
  const filters = ["--filter", `label=${DESK_LABEL}=1`];
  const containers = await docker.ok([
    "ps",
    "-a",
    ...filters,
    "--format",
    `{{.Names}}\t{{.Status}}\t{{.Label "${LABEL_ISSUE}"}}`
  ]);
  const volumes = await docker.ok([
    "volume",
    "ls",
    ...filters,
    "--format",
    `{{.Name}}\t{{.Label "${LABEL_KIND}"}}\t{{.Label "${LABEL_ISSUE}"}}`
  ]);
  const images = await docker.ok([
    "image",
    "ls",
    ...filters,
    "--format",
    "{{.Repository}}:{{.Tag}}\t{{.Size}}"
  ]);
  return {
    daemon: { ok: true, detail: "reachable" },
    image: await inspectImage(exec, imageTag),
    containers: rows(containers.stdout).map(([name, status, issue]) => ({
      name: name ?? "",
      status: status ?? "",
      issue: issue ?? ""
    })),
    volumes: rows(volumes.stdout).map(([name, kind, issue]) => ({
      name: name ?? "",
      kind: kind ?? "",
      issue: issue ?? ""
    })),
    images: rows(images.stdout).map(([name, size]) => ({ name: name ?? "", size: size ?? "" }))
  };
};

export type PruneTarget =
  | { readonly kind: "issue"; readonly scope: ResourceScope }
  /** Every desk container and volume. The logins stay unless `auth` is true. */
  | { readonly kind: "all"; readonly auth: boolean };

export interface PruneResult {
  readonly containers: readonly string[];
  readonly volumes: readonly string[];
}

const VOLUME_KINDS = ["ws", "state", "store", "sock"] as const;

/** Remove desk resources by label. Containers first, then volumes. Each removal is verified. */
export const pruneDocker = async (
  docker: DockerClient,
  target: PruneTarget
): Promise<PruneResult> => {
  if (target.kind === "issue") {
    const filters = issueFilters(target.scope);
    const containers = await docker.removeContainers(filters);
    const volumes = await docker.removeVolumes(filters);
    return { containers, volumes };
  }
  const containers = await docker.removeContainers(allFilters());
  const volumes: string[] = [];
  for (const kind of target.auth ? [...VOLUME_KINDS, "auth"] : VOLUME_KINDS) {
    volumes.push(...(await docker.removeVolumes([...allFilters(), `label=${LABEL_KIND}=${kind}`])));
  }
  return { containers, volumes };
};

export const loginArgv = (context: DockerContext, provider: Provider, socket: string): string[] => [
  "docker",
  ...dockerRunArgs(
    loginContainer({
      ...containerBase(context, "login", context.newId(), context.limits.agent),
      provider,
      authVolume: authVolume(provider),
      socketVolume: socket
    })
  )
];

/**
 * Log in to a provider inside a container. The provider's own login flow runs on
 * a terminal, through the providers proxy. The credentials land in the auth
 * volume. The desk never sees them.
 */
export const dockerLogin = async (
  context: DockerContext,
  provider: Provider,
  interactive: (argv: readonly string[]) => Promise<number>
): Promise<number> => {
  await context.docker.ensureVolume(authVolume(provider), resourceLabels(null, "auth"));
  return withProxy(context, "providers", (socket) =>
    interactive(loginArgv(context, provider, socket))
  );
};

export const authVolumePresent = async (
  docker: DockerClient,
  provider: Provider
): Promise<boolean> =>
  (await docker.listVolumes([...allFilters(), `label=${LABEL_KIND}=auth`])).includes(
    authVolume(provider)
  );
