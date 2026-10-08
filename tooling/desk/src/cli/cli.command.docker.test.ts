import { writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { DockerCliDeps } from "./cli.types";
import type { AgentProcess } from "../agents/agent.process";
import { createCliEnv, type CliEnv } from "../testing/cli.testing";
import { jsonReply, createFakeDocker, type FakeDocker } from "../testing/docker.fake";
import { ok, type FakeRoute } from "../testing/exec.fake";

let env: CliEnv | null = null;
afterEach(async () => {
  await env?.cleanup();
  env = null;
});

const neverProcess: AgentProcess = () => Promise.reject(new Error("no agent in this test"));

interface Opened {
  readonly e: CliEnv;
  readonly docker: FakeDocker;
  readonly interactive: string[][];
  readonly exitCode: { value: number };
}

const open = async (
  options: {
    withDocker?: boolean;
    routes?: readonly FakeRoute[];
    config?: Record<string, unknown>;
  } = {}
): Promise<Opened> => {
  const docker = createFakeDocker(() =>
    Promise.resolve({
      code: 127,
      stdout: "",
      stderr: "no such command",
      timedOut: false,
      truncated: false
    })
  );
  const interactive: string[][] = [];
  const exitCode = { value: 0 };
  let counter = 0;
  const dockerDeps: DockerCliDeps = {
    exec: docker.exec,
    process: neverProcess,
    interactive: (argv) => {
      interactive.push([...argv]);
      return Promise.resolve(exitCode.value);
    },
    imageTag: "kaine-desk-worker:test",
    newId: () => {
      counter += 1;
      return (counter + 0xdd00).toString(16).padStart(8, "0");
    },
    sleep: () => Promise.resolve()
  };
  const e = await createCliEnv({
    ...(options.routes === undefined ? {} : { routes: options.routes }),
    deps: options.withDocker === false ? {} : { docker: dockerDeps }
  });
  env = e;
  await writeFile(path.join(e.repo, "package.json"), '{"packageManager":"pnpm@10.29.3"}\n');
  if (options.config !== undefined) await e.writeConfig(options.config);
  return { e, docker, interactive, exitCode };
};

const lines = (text: string): string[] => text.trim().split("\n");

describe("docker command routing", () => {
  it.each([
    [[]],
    [["frobnicate"]],
    [["build", "extra"]],
    [["status", "extra"]],
    [["login"]],
    [["login", "--provider", "gemini"]]
  ])("exits 2 with usage for %j", async (args) => {
    const { e } = await open();
    const result = await e.run("docker", ...args);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Usage: pnpm desk docker");
  });

  it("exits 1 when Docker support is not wired in", async () => {
    const { e } = await open({ withDocker: false });
    const result = await e.run("docker", "status");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("not available");
  });

  it("is listed in the help", async () => {
    const { e } = await open();
    expect((await e.run("--help")).stdout).toContain("docker build|login|doctor|status|prune");
  });
});

describe("docker build", () => {
  it("builds the image for the current inputs and prints its tag", async () => {
    const { e, docker } = await open();
    const result = await e.run("docker", "build");
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/Built kaine-desk-worker:[0-9a-f]{12}/);
    const argv = ["docker", ...(docker.builds[0] ?? [])];
    expect(argv.slice(0, 2)).toEqual(["docker", "build"]);
    expect(argv).not.toContain("--no-cache");
  });

  it("passes --no-cache and exits 1 when the build fails", async () => {
    const { e, docker } = await open();
    docker.buildReply = { code: 1, stderr: "step 4/9 failed" };
    const result = await e.run("docker", "build", "--no-cache");
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("step 4/9 failed");
    expect(docker.builds[0]).toContain("--no-cache");
  });
});

describe("docker status", () => {
  it("lists the desk containers, volumes and images", async () => {
    const { e, docker } = await open();
    docker.containers.set("kaine-desk-x-7-agent-1", { "kaine-desk": "1" });
    docker.volumes.set("kaine-desk-x-7-ws", { "kaine-desk": "1", "kaine-desk.kind": "ws" });
    const result = await e.run("docker", "status");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Image: kaine-desk-worker:test (current)");
    expect(result.stdout).toContain("kaine-desk-x-7-agent-1");
    expect(result.stdout).toContain("Volumes:");
  });

  it("prints JSON, and exits 1 when the daemon is down", async () => {
    const { e, docker } = await open();
    const json = JSON.parse((await e.run("docker", "status", "--json")).stdout);
    expect(json.daemon.ok).toBe(true);
    expect(json.image.status).toBe("current");
    docker.daemonUp = false;
    const down = await e.run("docker", "status");
    expect(down.code).toBe(1);
    expect(down.stdout).toContain("Docker is not reachable");
  });
});

describe("docker prune", () => {
  const seed = async (opened: Opened) => {
    const { docker } = opened;
    const mine = (issue: string, kind: string) => ({
      "kaine-desk": "1",
      "kaine-desk.repo": "REPO",
      "kaine-desk.issue": issue,
      "kaine-desk.kind": kind
    });
    docker.containers.set("kaine-desk-a-7-agent-1", mine("7", "agent"));
    docker.volumes.set("kaine-desk-a-7-ws", mine("7", "ws"));
    docker.volumes.set("kaine-desk-a-8-ws", mine("8", "ws"));
    docker.volumes.set("kaine-desk-auth-claude", { "kaine-desk": "1", "kaine-desk.kind": "auth" });
    docker.volumes.set("pgdata", {});
    docker.containers.set("postgres", {});
  };

  it.each([
    [["prune"]],
    [["prune", "--all"]],
    [["prune", "--yes"]],
    [["prune", "--issue", "7", "--all", "--yes"]],
    [["prune", "--issue", "7", "--auth"]],
    [["prune", "--issue", "x"]]
  ])("refuses %j with a usage error and removes nothing", async (args) => {
    const opened = await open();
    await seed(opened);
    const before = [opened.docker.containers.size, opened.docker.volumes.size];
    const result = await opened.e.run("docker", ...args);
    expect(result.code).toBe(2);
    expect([opened.docker.containers.size, opened.docker.volumes.size]).toEqual(before);
  });

  it("removes everything with a desk label on --all --yes, keeps the logins, and never touches other tools", async () => {
    const opened = await open();
    await seed(opened);
    const result = await opened.e.run("docker", "prune", "--all", "--yes");
    expect(result.code).toBe(0);
    expect([...opened.docker.containers.keys()]).toEqual(["postgres"]);
    expect([...opened.docker.volumes.keys()].sort()).toEqual(["kaine-desk-auth-claude", "pgdata"]);
    expect(result.stdout).toContain("Removed 1 container(s) and 2 volume(s).");
  });

  it("removes the logins too only with --auth", async () => {
    const opened = await open();
    await seed(opened);
    await opened.e.run("docker", "prune", "--all", "--yes", "--auth");
    expect([...opened.docker.volumes.keys()]).toEqual(["pgdata"]);
  });

  it("removes only the resources of one issue of this repository", async () => {
    const opened = await open();
    await seed(opened);
    await opened.e.run("docker", "prune", "--issue", "99");
    // The seed's repo label does not match this repository, so nothing of it may go.
    expect([...opened.docker.volumes.keys()]).toContain("kaine-desk-a-7-ws");
    const calls = opened.docker.calls.filter(
      (call) => call.startsWith("ps") || call.startsWith("volume ls")
    );
    const filtered = calls.at(-1) ?? "";
    expect(filtered).toContain("label=kaine-desk=1");
    expect(filtered).toContain("label=kaine-desk.issue=99");
    expect(filtered).toMatch(/label=kaine-desk\.repo=[a-z0-9-]+-[0-9a-f]{6}/);
  });
});

describe("docker login", () => {
  it("starts the login container on a terminal behind the providers proxy and removes the proxy", async () => {
    const { e, docker, interactive } = await open();
    docker.handlers.set("desk-proxy.mjs", () => ({ code: 0 }));
    const result = await e.run("docker", "login", "--provider", "claude");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Logged in to claude");
    expect(interactive).toHaveLength(1);
    const argv = interactive[0] ?? [];
    expect(argv.slice(0, 2)).toEqual(["docker", "run"]);
    expect(argv).toContain("--tty");
    expect(argv).toContain("--interactive");
    expect(argv[argv.indexOf("--network") + 1]).toBe("none");
    expect(argv[argv.indexOf("--cap-drop") + 1]).toBe("ALL");
    expect(argv.slice(-3)).toEqual(["/opt/desk/desk-entry.mjs", "login", "claude"]);
    expect(argv.some((arg) => arg.includes("dst=/auth"))).toBe(true);
    // The auth volume is labelled; the proxy and its socket volume are gone.
    expect(docker.volumes.get("kaine-desk-auth-claude")).toEqual({
      "kaine-desk": "1",
      "kaine-desk.kind": "auth"
    });
    expect([...docker.containers.keys()]).toEqual([]);
    expect([...docker.volumes.keys()]).toEqual(["kaine-desk-auth-claude"]);
    // The proxy for the login is the providers proxy.
    expect(docker.runs.find((run) => run.script === "desk-proxy.mjs")?.command.at(-1)).toBe(
      "providers"
    );
  });

  it("reports a login that did not finish", async () => {
    const { e, interactive, exitCode, docker } = await open();
    docker.handlers.set("desk-proxy.mjs", () => ({ code: 0 }));
    exitCode.value = 130;
    const result = await e.run("docker", "login", "--provider", "codex");
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("did not finish (exit 130)");
    expect(interactive).toHaveLength(1);
  });

  it("does not start a login when the image is missing", async () => {
    const { e, docker, interactive } = await open();
    docker.imagePresent = false;
    const result = await e.run("docker", "login", "--provider", "claude");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("pnpm desk docker build");
    expect(interactive).toEqual([]);
  });
});

describe("docker doctor and doctor --probe", () => {
  const healthy: FakeRoute[] = [
    { argv: ["pnpm", "--version"], reply: ok("10.29.3\n") },
    { argv: ["git", "--version"], reply: ok("git version 2.50.1\n") },
    { argv: ["git", "worktree", "list"], reply: ok("worktree /repo\n") },
    { argv: ["gh", "--version"], reply: ok("gh version 2.96.0\n") },
    { argv: ["claude", "--version"], reply: ok("2.1.282\n") },
    {
      argv: ["claude", "--help"],
      reply: ok(
        "--agents --json-schema --output-format --permission-mode --permission-prompts --resume --session-id --setting-sources --settings --strict-mcp-config"
          .split(" ")
          .map((flag) => `  ${flag}`)
          .join("\n")
      )
    },
    { argv: ["codex", "--version"], reply: ok("codex-cli 0.147.0\n") },
    {
      argv: ["codex", "exec", "--help"],
      reply: ok(
        "  resume\n  -s, --sandbox\n  -C, --cd\n  --ignore-user-config\n  --output-schema\n  --json\n"
      )
    }
  ];

  const probeReply = (failing?: string) =>
    jsonReply({
      ok: failing === undefined,
      checks: ["network-interfaces", "no-egress", "proxy-allowlist"].map((id) => ({
        id,
        ok: id !== failing,
        detail: id === failing ? "broken" : "fine"
      }))
    });

  it("runs the probes in a hardened container behind the providers proxy and lists them", async () => {
    const { e, docker } = await open();
    docker.handlers.set("desk-probe.mjs", () => probeReply());
    const result = await e.run("docker", "doctor");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Docker daemon");
    expect(result.stdout).toContain("Isolation: no-egress");
    expect(result.stdout).toContain("Docker login (claude)");

    const probe = docker.runs.find((run) => run.script === "desk-probe.mjs");
    expect(probe?.argv).toContain("--read-only");
    expect(probe?.argv[(probe?.argv.indexOf("--network") ?? 0) + 1]).toBe("none");
    const options = JSON.parse(probe?.command.at(-1) ?? "{}") as {
      hostPaths: string[];
      proxy: { denied: string[] };
    };
    // The probe checks that the home folder and the repository are not visible in the container.
    expect(options.hostPaths).toContain(e.repo);
    expect(options.proxy.denied).toEqual(
      expect.arrayContaining(["example.com", "registry.npmjs.org"])
    );
  });

  it("exits 1 when a probe fails", async () => {
    const { e, docker } = await open();
    docker.handlers.set("desk-probe.mjs", () => probeReply("no-egress"));
    const result = await e.run("docker", "doctor");
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("FAIL");
    expect(result.stdout).toContain("broken");
  });

  it("prints JSON with --json", async () => {
    const { e, docker } = await open();
    docker.handlers.set("desk-probe.mjs", () => probeReply());
    const report = JSON.parse((await e.run("docker", "doctor", "--json")).stdout);
    expect(report.ok).toBe(true);
    expect(report.checks.map((entry: { id: string }) => entry.id)).toContain(
      "docker-probe-no-egress"
    );
  });

  it("treats a missing image as a warning with host isolation and an error with Docker isolation", async () => {
    const warn = await open();
    warn.docker.imagePresent = false;
    const asWarning = await warn.e.run("docker", "doctor");
    expect(asWarning.code).toBe(0);
    expect(asWarning.stdout).toMatch(/warn\s+Docker image/);
    await warn.e.cleanup();
    env = null;

    const strict = await open({ config: { isolation: "docker" } });
    strict.docker.imagePresent = false;
    const asError = await strict.e.run("docker", "doctor");
    expect(asError.code).toBe(1);
    expect(asError.stdout).toMatch(/FAIL\s+Docker image/);
  });

  it("adds Docker rows to desk doctor, and the probes only with --probe", async () => {
    const { e, docker } = await open({ routes: healthy });
    docker.handlers.set("desk-probe.mjs", () => probeReply());
    const plain = await e.run("doctor");
    expect(plain.code).toBe(0);
    expect(plain.stdout).toContain("Docker daemon");
    expect(plain.stdout).not.toContain("Isolation:");
    expect(docker.runs.some((run) => run.script === "desk-probe.mjs")).toBe(false);

    const probed = await e.run("doctor", "--probe");
    expect(probed.code).toBe(0);
    expect(probed.stdout).toContain("Isolation: no-egress");
  });

  it("warns, and does not fail, when the daemon is down and the config says host", async () => {
    const { e, docker } = await open({ routes: healthy });
    docker.daemonUp = false;
    const result = await e.run("doctor");
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/warn\s+Docker daemon/);
  });

  it("fails desk doctor when the config says docker and the daemon is down", async () => {
    const { e, docker } = await open({ routes: healthy, config: { isolation: "docker" } });
    docker.daemonUp = false;
    const result = await e.run("doctor");
    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/FAIL\s+Docker daemon/);
  });
});

describe("start --isolation", () => {
  it("rejects a value that is not host or docker", async () => {
    const { e } = await open();
    const result = await e.run("start", "7", "--isolation", "vm");
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("--isolation takes host or docker");
  });

  it("refuses a Docker start when the image is missing, with the build command", async () => {
    const { e, docker } = await open();
    docker.imagePresent = false;
    const result = await e.run("start", "7", "--isolation", "docker");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("pnpm desk docker build");
    expect(lines(result.stderr)[0]).toContain("refused");
  });
});
