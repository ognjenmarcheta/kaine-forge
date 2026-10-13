import { describe, expect, it } from "vitest";

import {
  CONTAINER_KINDS,
  ContainerPolicyError,
  agentContainer,
  authSyncContainer,
  checkContainer,
  dockerRunArgs,
  fetchContainer,
  loginContainer,
  probeContainer,
  proxyContainer,
  readStateContainer,
  workspaceContainer,
  type ContainerKind,
  type ContainerSpec
} from "./docker.args";
import { containerName, resourceLabels } from "./docker.names";

const scope = { repoKey: "kaine-forge-1a2b3c", issue: 7 };
const RUN = "0a1b2c3d";
const IMAGE = "kaine-desk-worker:abcdef123456";
const resources = { memory: "6g", cpus: 4, pidsLimit: 1024 };
const base = (kind: string) => ({
  image: IMAGE,
  name: containerName(scope, kind, RUN),
  labels: resourceLabels(scope, kind, RUN),
  resources
});

const WS = "kaine-desk-kaine-forge-1a2b3c-7-ws";
const STATE = "kaine-desk-kaine-forge-1a2b3c-7-state";
const STORE = "kaine-desk-kaine-forge-1a2b3c-7-store";
const SOCK = "kaine-desk-kaine-forge-1a2b3c-7-0a1b2c3d-sock";
const AUTH = "kaine-desk-auth-claude";
const STAGING = "/Users/dev/repo/.git/kaine-desk/issues/7/docker/agent-x";

/** One spec for every container kind. */
const specs: Readonly<Record<ContainerKind, ContainerSpec>> = {
  agent: agentContainer({
    ...base("agent"),
    provider: "claude",
    workspaceVolume: WS,
    stateVolume: STATE,
    authVolume: AUTH,
    socketVolume: SOCK,
    stagingDir: STAGING,
    argv: ["claude", "-p", "do it"],
    env: { KAINE_DESK_RECEIPTS: "/state/receipts-builder.jsonl" },
    forwardEnv: []
  }),
  check: checkContainer({
    ...base("check"),
    workspaceVolume: WS,
    argv: ["pnpm", "check:affected"],
    env: { NO_COLOR: "1" }
  }),
  fetch: fetchContainer({
    ...base("fetch"),
    workspaceVolume: WS,
    storeVolume: STORE,
    socketVolume: SOCK
  }),
  install: workspaceContainer({
    ...base("install"),
    kind: "install",
    operation: "install",
    workspaceVolume: WS,
    stateVolume: STATE,
    storeVolume: STORE
  }),
  import: workspaceContainer({
    ...base("import"),
    kind: "import",
    operation: "sync",
    workspaceVolume: WS,
    stateVolume: STATE,
    stagingDir: STAGING
  }),
  export: workspaceContainer({
    ...base("export"),
    kind: "export",
    operation: "diff",
    workspaceVolume: WS,
    stateVolume: STATE
  }),
  login: loginContainer({
    ...base("login"),
    provider: "claude",
    authVolume: AUTH,
    socketVolume: SOCK
  }),
  probe: probeContainer({
    ...base("probe"),
    hostPaths: ["/Users/dev"],
    proxy: { socketVolume: SOCK, allowed: [], denied: ["example.com"] }
  }),
  proxy: proxyContainer({ ...base("proxy"), mode: "providers", socketVolume: SOCK }),
  "auth-sync": authSyncContainer({
    ...base("auth-sync"),
    provider: "claude",
    authVolume: AUTH,
    stateVolume: STATE
  })
};

const after = (args: readonly string[], flag: string): string | undefined => {
  const index = args.indexOf(flag);
  return index < 0 ? undefined : args[index + 1];
};
const all = (args: readonly string[], flag: string): string[] =>
  args.flatMap((arg, index) => (arg === flag ? [args[index + 1] ?? ""] : []));

describe("dockerRunArgs: hardening on every kind of container", () => {
  it("covers every container kind", () => {
    expect(Object.keys(specs).sort()).toEqual([...CONTAINER_KINDS].sort());
  });

  describe.each(CONTAINER_KINDS)("%s", (kind) => {
    const spec = specs[kind];
    const args = dockerRunArgs(spec);

    it("has a read-only root, no capabilities, no new privileges, and a non-root user", () => {
      expect(args[0]).toBe("run");
      expect(args).toContain("--read-only");
      expect(after(args, "--cap-drop")).toBe("ALL");
      expect(after(args, "--security-opt")).toBe("no-new-privileges");
      expect(after(args, "--user")).toBe("1000:1000");
      expect(args).toContain("--init");
      expect(args).toContain("--rm");
    });

    it("limits pids, memory (without swap) and CPUs", () => {
      expect(after(args, "--pids-limit")).toBe(String(spec.resources.pidsLimit));
      expect(after(args, "--memory")).toBe(spec.resources.memory);
      expect(after(args, "--memory-swap")).toBe(spec.resources.memory);
      expect(after(args, "--cpus")).toBe(String(spec.resources.cpus));
    });

    it("mounts tmpfs for /tmp and the home folder", () => {
      const tmpfs = all(args, "--tmpfs");
      expect(tmpfs.some((entry) => entry.startsWith("/tmp:"))).toBe(true);
      expect(tmpfs.some((entry) => entry.startsWith("/home/desk:"))).toBe(true);
    });

    it("is named and labelled for cleanup", () => {
      expect(after(args, "--name")).toMatch(/^kaine-desk-/);
      expect(all(args, "--label")).toContain("kaine-desk=1");
      expect(all(args, "--label")).toContain(`kaine-desk.kind=${kind}`);
      expect(all(args, "--label")).toContain("kaine-desk.repo=kaine-forge-1a2b3c");
      expect(all(args, "--label")).toContain("kaine-desk.issue=7");
    });

    it("sets an entrypoint and ends with the image and its command", () => {
      expect(after(args, "--entrypoint")).toBe(spec.entrypoint);
      const imageAt = args.indexOf(IMAGE);
      expect(imageAt).toBeGreaterThan(args.indexOf("--entrypoint"));
      expect(args.slice(imageAt + 1)).toEqual([...spec.command]);
    });

    it("never uses a forbidden flag, mount, or variable", () => {
      const text = args.join(" ");
      for (const flag of [
        "--privileged",
        "--pid",
        "--ipc",
        "--uts",
        "--userns",
        "--cap-add",
        "--device",
        "--volumes-from",
        "--volume",
        "-v",
        "--publish",
        "-p",
        "--add-host",
        "--security-opt=seccomp=unconfined"
      ]) {
        // Only the docker flags count. The command after the image belongs to the program.
        const options = args.slice(0, args.indexOf(IMAGE));
        expect(
          options.some((arg) => arg === flag || arg.startsWith(`${flag}=`)),
          flag
        ).toBe(false);
      }
      expect(text).not.toContain("--network host");
      expect(text).not.toContain("docker.sock");
      expect(text).not.toMatch(/GH_TOKEN|GITHUB_TOKEN|AWS_|SSH_AUTH_SOCK|DOCKER_HOST/);
    });

    it("mounts only desk volumes and one read-only folder of artifacts", () => {
      for (const mount of all(args, "--mount")) {
        if (mount.startsWith("type=volume")) {
          expect(mount).toMatch(
            /src=kaine-desk-[a-z0-9.-]+,dst=\/(?:workspace|state|store|socket|auth)/
          );
        } else {
          expect(mount).toBe(`type=bind,src=${STAGING},dst=/desk/in,readonly`);
        }
      }
    });
  });

  it("uses --network none for every kind except the proxy", () => {
    for (const kind of CONTAINER_KINDS) {
      const network = after(dockerRunArgs(specs[kind]), "--network");
      expect(network, kind).toBe(kind === "proxy" ? "bridge" : "none");
    }
  });
});

describe("agent container", () => {
  const args = dockerRunArgs(specs.agent);

  it("runs the provider CLI through the entry script with the login copied in", () => {
    expect(after(args, "--entrypoint")).toBe("node");
    expect(args.slice(args.indexOf(IMAGE) + 1)).toEqual([
      "/opt/desk/desk-entry.mjs",
      "agent",
      "claude",
      "--",
      "claude",
      "-p",
      "do it"
    ]);
    expect(after(args, "--workdir")).toBe("/workspace");
  });

  it("mounts the login and the proxy socket read-only and the workspace read-write", () => {
    const mounts = all(args, "--mount");
    expect(mounts).toContain(`type=volume,src=${AUTH},dst=/auth,readonly`);
    expect(mounts).toContain(`type=volume,src=${SOCK},dst=/socket,readonly`);
    expect(mounts).toContain(`type=volume,src=${WS},dst=/workspace`);
    expect(mounts).toContain(`type=volume,src=${STATE},dst=/state`);
    expect(mounts.filter((mount) => mount.includes("dst=/workspace"))).toHaveLength(1);
  });

  it("passes the environment as explicit variables and no secret", () => {
    const env = all(args, "--env");
    expect(env).toContain("HOME=/home/desk");
    expect(env).toContain("KAINE_DESK_RECEIPTS=/state/receipts-builder.jsonl");
    expect(env.some((entry) => /KEY|TOKEN|SECRET/i.test(entry))).toBe(false);
  });

  it("forwards a listed API key by name only, so its value is not in the arguments", () => {
    const withKey = dockerRunArgs({ ...specs.agent, forwardEnv: ["ANTHROPIC_API_KEY"] });
    expect(all(withKey, "--env")).toContain("ANTHROPIC_API_KEY");
    expect(withKey.join(" ")).not.toContain("ANTHROPIC_API_KEY=");
  });
});

describe("other containers", () => {
  it("runs a check step with the workspace only: no login, no socket, no store", () => {
    const args = dockerRunArgs(specs.check);
    expect(after(args, "--entrypoint")).toBe("pnpm");
    expect(args.slice(args.indexOf(IMAGE) + 1)).toEqual(["check:affected"]);
    expect(all(args, "--mount")).toEqual([`type=volume,src=${WS},dst=/workspace`]);
    expect(all(args, "--env")).toContain("NO_COLOR=1");
  });

  it("fills the store with a writable workspace for the virtual store and only the socket for the network", () => {
    const args = dockerRunArgs(specs.fetch);
    expect(after(args, "--network")).toBe("none");
    expect(all(args, "--mount")).toEqual([
      `type=volume,src=${WS},dst=/workspace`,
      `type=volume,src=${STORE},dst=/store`,
      `type=volume,src=${SOCK},dst=/socket,readonly`
    ]);
    expect(args.slice(args.indexOf(IMAGE) + 1)).toEqual(["/opt/desk/desk-fetch.mjs"]);
  });

  it("imports through a read-only staging folder and reads JSON on stdin", () => {
    const args = dockerRunArgs(specs.import);
    expect(args).toContain("--interactive");
    expect(all(args, "--mount")).toContain(`type=bind,src=${STAGING},dst=/desk/in,readonly`);
    expect(args.slice(args.indexOf(IMAGE) + 1)).toEqual(["/opt/desk/desk-workspace.mjs", "sync"]);
  });

  it("installs offline with the store mounted and no network", () => {
    const args = dockerRunArgs(specs.install);
    expect(after(args, "--network")).toBe("none");
    expect(all(args, "--mount")).toContain(`type=volume,src=${STORE},dst=/store`);
    expect(args.slice(args.indexOf(IMAGE) + 1)).toEqual([
      "/opt/desk/desk-workspace.mjs",
      "install"
    ]);
  });

  it("opens a terminal for the login and mounts the auth volume read-write", () => {
    const args = dockerRunArgs(specs.login);
    expect(args).toContain("--tty");
    expect(args).toContain("--interactive");
    expect(all(args, "--mount")).toContain(`type=volume,src=${AUTH},dst=/auth`);
    expect(args.slice(args.indexOf(IMAGE) + 1)).toEqual([
      "/opt/desk/desk-entry.mjs",
      "login",
      "claude"
    ]);
  });

  it("gives the proxy the network, a detached run, and a write mount for its socket", () => {
    const args = dockerRunArgs(specs.proxy);
    expect(args).toContain("--detach");
    expect(all(args, "--mount")).toEqual([`type=volume,src=${SOCK},dst=/socket`]);
    expect(args.slice(args.indexOf(IMAGE) + 1)).toEqual(["/opt/desk/desk-proxy.mjs", "providers"]);
  });

  it("passes the probe options as one JSON argument and mounts nothing without a proxy", () => {
    const args = dockerRunArgs(specs.probe);
    const json = args.at(-1) ?? "";
    expect(JSON.parse(json)).toEqual({
      hostPaths: ["/Users/dev"],
      proxy: { allowed: [], denied: ["example.com"] }
    });
    const plain = dockerRunArgs(probeContainer({ ...base("probe"), hostPaths: [], proxy: null }));
    expect(all(plain, "--mount")).toEqual([]);
  });

  it("reads one file from the state volume, read-only", () => {
    const spec = readStateContainer({
      ...base("export"),
      stateVolume: STATE,
      file: "/state/receipts-builder.jsonl"
    });
    const args = dockerRunArgs(spec);
    expect(after(args, "--entrypoint")).toBe("cat");
    expect(all(args, "--mount")).toEqual([`type=volume,src=${STATE},dst=/state,readonly`]);
    expect(args.slice(args.indexOf(IMAGE) + 1)).toEqual(["--", "/state/receipts-builder.jsonl"]);
  });

  it.each(["/etc/passwd", "/state/../etc/passwd", "state/x"])("refuses to read %s", (file) => {
    expect(() => readStateContainer({ ...base("export"), stateVolume: STATE, file })).toThrow(
      ContainerPolicyError
    );
  });

  it("copies a refreshed login with the state volume read-only", () => {
    const args = dockerRunArgs(specs["auth-sync"]);
    expect(all(args, "--mount")).toEqual([
      `type=volume,src=${AUTH},dst=/auth`,
      `type=volume,src=${STATE},dst=/state,readonly`
    ]);
  });
});

describe("policy errors", () => {
  const agent = specs.agent;
  const attempt = (change: Partial<ContainerSpec>) => () => dockerRunArgs({ ...agent, ...change });

  it.each([
    ["a network on a container that is not the proxy", { network: "bridge" as const }],
    ["a name without the desk prefix", { name: "postgres-db" }],
    ["labels without kaine-desk=1", { labels: { "kaine-desk.kind": "agent" } }],
    ["a bad memory size", { resources: { ...resources, memory: "lots" } }],
    ["a zero CPU limit", { resources: { ...resources, cpus: 0 } }],
    ["a tiny pids limit", { resources: { ...resources, pidsLimit: 2 } }],
    ["a forbidden variable GH_TOKEN", { env: { GH_TOKEN: "x" } }],
    ["a forbidden variable AWS_SECRET_ACCESS_KEY", { env: { AWS_SECRET_ACCESS_KEY: "x" } }],
    ["a forbidden variable SSH_AUTH_SOCK", { env: { SSH_AUTH_SOCK: "/x" } }],
    ["a forwarded GitHub token", { forwardEnv: ["GITHUB_TOKEN"] }],
    ["a forwarded variable that is not a provider key", { forwardEnv: ["HOME"] }],
    ["an entrypoint that looks like a flag", { entrypoint: "--privileged" }],
    [
      "a volume of another tool",
      {
        mounts: [
          { type: "volume" as const, source: "pgdata", target: "/workspace", readOnly: false }
        ]
      }
    ],
    [
      "a volume target outside the list",
      {
        mounts: [
          { type: "volume" as const, source: "kaine-desk-x", target: "/etc", readOnly: false }
        ]
      }
    ],
    [
      "a bind mount of the Docker socket",
      { mounts: [{ type: "bind" as const, source: "/var/run/docker.sock", target: "/desk/in" }] }
    ],
    [
      "a bind mount of the root",
      { mounts: [{ type: "bind" as const, source: "/", target: "/desk/in" }] }
    ],
    [
      "a bind mount that targets the workspace",
      { mounts: [{ type: "bind" as const, source: "/tmp/x", target: "/workspace" }] }
    ],
    [
      "a relative bind source",
      { mounts: [{ type: "bind" as const, source: "relative/path", target: "/desk/in" }] }
    ],
    [
      "a mount path with a comma, which would add a mount option",
      { mounts: [{ type: "bind" as const, source: "/tmp/a,b", target: "/desk/in" }] }
    ]
  ])("refuses %s", (_name, change) => {
    expect(attempt(change)).toThrow(ContainerPolicyError);
  });

  it("refuses an empty check command", () => {
    expect(() =>
      checkContainer({ ...base("check"), workspaceVolume: WS, argv: [], env: {} })
    ).toThrow(ContainerPolicyError);
  });
});
