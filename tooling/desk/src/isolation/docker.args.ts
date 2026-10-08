import { FORWARDABLE_ENV, type Provider } from "../contracts";
import { NAME_PREFIX } from "./docker.names";

/**
 * Argument lists for `docker run`, one builder per kind of container. Every
 * list goes through `dockerRunArgs`, which adds the hardening flags and refuses
 * a spec that breaks the rules. A builder cannot forget a flag.
 *
 * Rules (the tests assert each one for every kind):
 * - `--read-only` root filesystem, with tmpfs for `/tmp` and the home folder;
 * - `--cap-drop ALL`, `no-new-privileges`, a non-root user, `--init`, `--rm`;
 * - pids, memory (without swap) and CPU limits;
 * - `--network none`, except the one proxy container;
 * - mounts are named desk volumes, or a read-only folder of artifacts;
 * - environment: only what the spec names, no GitHub or cloud variable, and an
 *   API key only when the user lists it in the config.
 */

export const CONTAINER_KINDS = [
  "agent",
  "check",
  "fetch",
  "install",
  "import",
  "export",
  "login",
  "probe",
  "proxy",
  "auth-sync"
] as const;
export type ContainerKind = (typeof CONTAINER_KINDS)[number];

export const CONTAINER_USER = "1000:1000";
export const WORKSPACE = "/workspace";
export const STATE = "/state";
export const STORE = "/store";
export const SOCKET = "/socket";
export const AUTH = "/auth";
export const INPUT = "/desk/in";
export const DESK_BIN = "/opt/desk";

export interface Resources {
  /** For example `6g`. Swap is off: the memory limit is also the memory-swap limit. */
  readonly memory: string;
  readonly cpus: number;
  readonly pidsLimit: number;
}

export type ContainerMount =
  | {
      readonly type: "volume";
      readonly source: string;
      readonly target: string;
      readonly readOnly: boolean;
    }
  /** A folder of files the desk wrote. It is always read-only. */
  | { readonly type: "bind"; readonly source: string; readonly target: string };

export interface ContainerSpec {
  readonly kind: ContainerKind;
  readonly name: string;
  readonly image: string;
  readonly labels: Readonly<Record<string, string>>;
  readonly network: "none" | "bridge";
  readonly resources: Resources;
  readonly mounts: readonly ContainerMount[];
  /** Programs run from `/tmp` and the home folder (pnpm, esbuild). Off for small helpers. */
  readonly execTmpfs: boolean;
  readonly env: Readonly<Record<string, string>>;
  /** Names of host variables to pass by name. The value never appears in the argument list. */
  readonly forwardEnv?: readonly string[];
  readonly workdir?: string;
  readonly entrypoint: string;
  readonly command: readonly string[];
  readonly stdin?: "pipe" | "tty";
  readonly detach?: boolean;
}

export class ContainerPolicyError extends Error {
  override readonly name = "ContainerPolicyError";
}

const FORBIDDEN_ENV =
  /^(GH_|GITHUB_|GITLAB_|AWS_|AZURE_|GOOGLE_|GCP_|GCLOUD_|NPM_TOKEN|NODE_AUTH_TOKEN|SSH_|DOCKER_|DATABASE_URL|BETTER_AUTH)/i;

const VOLUME_TARGETS: ReadonlySet<string> = new Set([WORKSPACE, STATE, STORE, SOCKET, AUTH]);
const MEMORY = /^[1-9]\d*[mMgG]$/;

const fail = (message: string): never => {
  throw new ContainerPolicyError(message);
};

const validate = (spec: ContainerSpec): void => {
  if (!spec.name.startsWith(NAME_PREFIX))
    fail(`Container name '${spec.name}' lacks the desk prefix.`);
  if (spec.labels["kaine-desk"] !== "1") fail("A desk container needs the label kaine-desk=1.");
  if (spec.network === "bridge" && spec.kind !== "proxy") {
    fail(`Only the proxy container may have a network. '${spec.kind}' must use --network none.`);
  }
  if (!MEMORY.test(spec.resources.memory)) fail(`Invalid memory limit '${spec.resources.memory}'.`);
  if (!(spec.resources.cpus > 0) || !Number.isFinite(spec.resources.cpus))
    fail("Invalid CPU limit.");
  if (!Number.isInteger(spec.resources.pidsLimit) || spec.resources.pidsLimit < 16) {
    fail("Invalid pids limit.");
  }
  if (spec.entrypoint === "" || spec.entrypoint.startsWith("-")) fail("Invalid entrypoint.");
  for (const mount of spec.mounts) {
    if (/[,"\n]/.test(mount.source) || /[,"\n]/.test(mount.target)) {
      fail("A mount path may not contain a comma, a quote, or a newline.");
    }
    if (mount.type === "volume") {
      if (!mount.source.startsWith(NAME_PREFIX))
        fail(`Volume '${mount.source}' lacks the desk prefix.`);
      if (!VOLUME_TARGETS.has(mount.target)) fail(`Unknown volume target '${mount.target}'.`);
    } else {
      if (
        !mount.source.startsWith("/") ||
        mount.source === "/" ||
        /docker\.sock/.test(mount.source)
      ) {
        fail(`Refusing the bind mount '${mount.source}'.`);
      }
      if (mount.target !== INPUT) fail(`A bind mount may only target ${INPUT}.`);
    }
  }
  for (const name of Object.keys(spec.env)) {
    if (FORBIDDEN_ENV.test(name)) fail(`Refusing the environment variable '${name}'.`);
  }
  for (const name of spec.forwardEnv ?? []) {
    if (!FORWARDABLE_ENV.some((allowed) => allowed === name)) {
      fail(`'${name}' may not be forwarded into a container.`);
    }
  }
};

export const dockerRunArgs = (spec: ContainerSpec): string[] => {
  validate(spec);
  const exec = spec.execTmpfs ? "exec" : "noexec";
  const { memory, cpus, pidsLimit } = spec.resources;
  return [
    "run",
    "--rm",
    "--init",
    "--name",
    spec.name,
    ...(spec.detach === true ? ["--detach"] : []),
    ...(spec.stdin === "pipe" ? ["--interactive"] : []),
    ...(spec.stdin === "tty" ? ["--interactive", "--tty"] : []),
    ...Object.entries(spec.labels).flatMap(([key, value]) => ["--label", `${key}=${value}`]),
    "--read-only",
    "--network",
    spec.network,
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--pids-limit",
    String(pidsLimit),
    "--memory",
    memory,
    "--memory-swap",
    memory,
    "--cpus",
    String(cpus),
    "--user",
    CONTAINER_USER,
    "--tmpfs",
    `/tmp:rw,nosuid,nodev,${exec},size=1g,mode=1777`,
    "--tmpfs",
    `/home/desk:rw,nosuid,nodev,${exec},size=512m,uid=1000,gid=1000,mode=0700`,
    ...spec.mounts.flatMap((mount) => [
      "--mount",
      mount.type === "volume"
        ? `type=volume,src=${mount.source},dst=${mount.target}${mount.readOnly ? ",readonly" : ""}`
        : `type=bind,src=${mount.source},dst=${mount.target},readonly`
    ]),
    ...Object.entries(spec.env).flatMap(([key, value]) => ["--env", `${key}=${value}`]),
    ...(spec.forwardEnv ?? []).flatMap((name) => ["--env", name]),
    ...(spec.workdir === undefined ? [] : ["--workdir", spec.workdir]),
    "--entrypoint",
    spec.entrypoint,
    spec.image,
    ...spec.command
  ];
};

// --- builders -----------------------------------------------------------------

export interface ContainerBase {
  readonly image: string;
  readonly name: string;
  readonly labels: Readonly<Record<string, string>>;
  readonly resources: Resources;
}

const vol = (source: string, target: string, readOnly: boolean): ContainerMount => ({
  type: "volume",
  source,
  target,
  readOnly
});

const NODE = "node";
const script = (name: string): string => `${DESK_BIN}/${name}`;

/** Workspace helper: import (`sync`), export (`diff`) and the offline `install`. */
export interface WorkspaceContainerInput extends ContainerBase {
  readonly kind: "import" | "export" | "install";
  readonly operation: "sync" | "diff" | "install";
  readonly workspaceVolume: string;
  readonly stateVolume: string;
  /** `install` needs the filled store. */
  readonly storeVolume?: string;
  /** `import` reads the bundle, the patch and the agent files from here. */
  readonly stagingDir?: string;
}

export const workspaceContainer = (input: WorkspaceContainerInput): ContainerSpec => ({
  kind: input.kind,
  name: input.name,
  image: input.image,
  labels: input.labels,
  network: "none",
  resources: input.resources,
  mounts: [
    vol(input.workspaceVolume, WORKSPACE, false),
    vol(input.stateVolume, STATE, false),
    ...(input.storeVolume === undefined ? [] : [vol(input.storeVolume, STORE, false)]),
    ...(input.stagingDir === undefined
      ? []
      : [{ type: "bind" as const, source: input.stagingDir, target: INPUT }])
  ],
  execTmpfs: input.operation === "install",
  env: { HOME: "/home/desk" },
  workdir: WORKSPACE,
  entrypoint: NODE,
  command: [script("desk-workspace.mjs"), input.operation],
  stdin: "pipe"
});

/** Read one file from the state volume (receipts). */
export interface ReadStateContainerInput extends ContainerBase {
  readonly stateVolume: string;
  /** Absolute path inside `/state`. */
  readonly file: string;
}

export const readStateContainer = (input: ReadStateContainerInput): ContainerSpec => {
  if (!input.file.startsWith(`${STATE}/`) || input.file.includes("..")) {
    fail(`Refusing to read '${input.file}'.`);
  }
  return {
    kind: "export",
    name: input.name,
    image: input.image,
    labels: input.labels,
    network: "none",
    resources: input.resources,
    mounts: [vol(input.stateVolume, STATE, true)],
    execTmpfs: false,
    env: {},
    entrypoint: "cat",
    command: ["--", input.file]
  };
};

export interface AgentContainerInput extends ContainerBase {
  readonly provider: Provider;
  readonly workspaceVolume: string;
  readonly stateVolume: string;
  readonly authVolume: string;
  readonly socketVolume: string;
  readonly stagingDir: string;
  /** The provider CLI and its arguments, as the Claude or Codex runner built them. */
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly forwardEnv: readonly string[];
}

export const agentContainer = (input: AgentContainerInput): ContainerSpec => ({
  kind: "agent",
  name: input.name,
  image: input.image,
  labels: input.labels,
  network: "none",
  resources: input.resources,
  mounts: [
    vol(input.workspaceVolume, WORKSPACE, false),
    vol(input.stateVolume, STATE, false),
    vol(input.authVolume, AUTH, true),
    vol(input.socketVolume, SOCKET, true),
    { type: "bind", source: input.stagingDir, target: INPUT }
  ],
  execTmpfs: true,
  env: { HOME: "/home/desk", NO_COLOR: "1", ...input.env },
  forwardEnv: input.forwardEnv,
  workdir: WORKSPACE,
  entrypoint: NODE,
  command: [script("desk-entry.mjs"), "agent", input.provider, "--", ...input.argv]
});

export interface CheckContainerInput extends ContainerBase {
  readonly workspaceVolume: string;
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

/** A check step: the workspace, no network, no login, no socket. */
export const checkContainer = (input: CheckContainerInput): ContainerSpec => {
  const [program, ...rest] = input.argv;
  if (program === undefined || program === "") fail("A check step needs a program.");
  return {
    kind: "check",
    name: input.name,
    image: input.image,
    labels: input.labels,
    network: "none",
    resources: input.resources,
    mounts: [vol(input.workspaceVolume, WORKSPACE, false)],
    execTmpfs: true,
    env: { HOME: "/home/desk", ...input.env },
    workdir: WORKSPACE,
    entrypoint: program ?? "",
    command: rest
  };
};

export interface FetchContainerInput extends ContainerBase {
  readonly workspaceVolume: string;
  readonly storeVolume: string;
  readonly socketVolume: string;
}

/**
 * Fills the pnpm store and the virtual store (`node_modules/.pnpm`) through the registry-only
 * proxy. `pnpm fetch` needs a writable workspace for the virtual store. It runs no repository
 * script (`--ignore-scripts --ignore-pnpmfile`), and its only way out is the proxy.
 */
export const fetchContainer = (input: FetchContainerInput): ContainerSpec => ({
  kind: "fetch",
  name: input.name,
  image: input.image,
  labels: input.labels,
  network: "none",
  resources: input.resources,
  mounts: [
    vol(input.workspaceVolume, WORKSPACE, false),
    vol(input.storeVolume, STORE, false),
    vol(input.socketVolume, SOCKET, true)
  ],
  execTmpfs: true,
  env: { HOME: "/home/desk" },
  workdir: WORKSPACE,
  entrypoint: NODE,
  command: [script("desk-fetch.mjs")]
});

export interface ProxyContainerInput extends ContainerBase {
  readonly mode: "providers" | "dependencies";
  readonly socketVolume: string;
}

/** The one container with a network. It tunnels CONNECT to the allowlisted hosts only. */
export const proxyContainer = (input: ProxyContainerInput): ContainerSpec => ({
  kind: "proxy",
  name: input.name,
  image: input.image,
  labels: input.labels,
  network: "bridge",
  resources: input.resources,
  mounts: [vol(input.socketVolume, SOCKET, false)],
  execTmpfs: false,
  env: {},
  entrypoint: NODE,
  command: [script("desk-proxy.mjs"), input.mode],
  detach: true
});

export interface LoginContainerInput extends ContainerBase {
  readonly provider: Provider;
  readonly authVolume: string;
  readonly socketVolume: string;
}

/** Interactive login into the auth volume. It needs a terminal. */
export const loginContainer = (input: LoginContainerInput): ContainerSpec => ({
  kind: "login",
  name: input.name,
  image: input.image,
  labels: input.labels,
  network: "none",
  resources: input.resources,
  mounts: [vol(input.authVolume, AUTH, false), vol(input.socketVolume, SOCKET, true)],
  execTmpfs: true,
  env: { HOME: "/home/desk", TERM: "xterm-256color" },
  workdir: WORKSPACE,
  entrypoint: NODE,
  command: [script("desk-entry.mjs"), "login", input.provider],
  stdin: "tty"
});

export interface AuthSyncContainerInput extends ContainerBase {
  readonly provider: Provider;
  readonly authVolume: string;
  readonly stateVolume: string;
}

/** Copies a refreshed token from a run back to the auth volume. No network. */
export const authSyncContainer = (input: AuthSyncContainerInput): ContainerSpec => ({
  kind: "auth-sync",
  name: input.name,
  image: input.image,
  labels: input.labels,
  network: "none",
  resources: input.resources,
  mounts: [vol(input.authVolume, AUTH, false), vol(input.stateVolume, STATE, true)],
  execTmpfs: false,
  env: { HOME: "/home/desk" },
  entrypoint: NODE,
  command: [script("desk-entry.mjs"), "auth-sync", input.provider]
});

export interface ProbeContainerInput extends ContainerBase {
  /** Paths on the host that must not exist in the container. */
  readonly hostPaths: readonly string[];
  /** Mount the proxy socket and test these hosts. */
  readonly proxy: {
    readonly socketVolume: string;
    readonly allowed: readonly string[];
    readonly denied: readonly string[];
  } | null;
}

export const probeContainer = (input: ProbeContainerInput): ContainerSpec => ({
  kind: "probe",
  name: input.name,
  image: input.image,
  labels: input.labels,
  network: "none",
  resources: input.resources,
  mounts: input.proxy === null ? [] : [vol(input.proxy.socketVolume, SOCKET, true)],
  execTmpfs: false,
  env: { HOME: "/home/desk" },
  entrypoint: NODE,
  command: [
    script("desk-probe.mjs"),
    JSON.stringify({
      hostPaths: input.hostPaths,
      proxy:
        input.proxy === null ? null : { allowed: input.proxy.allowed, denied: input.proxy.denied }
    })
  ]
});
