import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { AgentProcess } from "../agents/agent.process";
import { createReplayRunner } from "../agents/agent.replay";
import { checkReportSchema } from "../check";
import { deskConfigSchema } from "../contracts";
import { diffAgainstBase } from "../git";
import { createDockerIsolation, type DockerIsolation } from "./isolation.docker";
import { baseRequest } from "../testing/agent.testing";
import { jsonReply, type FakeRun } from "../testing/docker.fake";
import { createDockerEnv, type DockerEnv } from "../testing/docker.testing";
import { hermeticExec } from "../testing/git.repo";

let env: DockerEnv | null = null;
afterEach(async () => {
  await env?.cleanup();
  env = null;
});

const neverProcess: AgentProcess = () => Promise.reject(new Error("no agent process in this test"));

const open = async (config: Record<string, unknown> = {}) => {
  const e = await createDockerEnv();
  env = e;
  let counter = 0;
  const hostRunner = createReplayRunner([]);
  const isolation: DockerIsolation = createDockerIsolation({
    exec: e.docker.exec,
    process: neverProcess,
    hostRunnerFor: () => hostRunner,
    repoRoot: e.repo.dir,
    stateRoot: path.join(e.scratch.root, "state"),
    config: deskConfigSchema.parse(config),
    imageTag: "kaine-desk-worker:test",
    newId: () => {
      counter += 1;
      return (counter + 0xabc00).toString(16).padStart(8, "0");
    },
    sleep: () => Promise.resolve()
  });
  return { e, isolation, hostRunner };
};

const stage = (e: DockerEnv, role: "planner" | "builder" | "reviewer") => ({
  role,
  provider: "claude" as const,
  issue: 7,
  worktree: e.repo.dir,
  baseSha: e.baseSha,
  artifactsDir: path.join(e.scratch.root, "artifacts")
});

describe("runnerFor", () => {
  it("keeps the planner and the reviewer on the host, which run no repository code", async () => {
    const { e, isolation, hostRunner } = await open();
    expect(isolation.runnerFor(stage(e, "planner"))).toBe(hostRunner);
    expect(isolation.runnerFor(stage(e, "reviewer"))).toBe(hostRunner);
    expect(isolation.runnerFor(stage(e, "builder"))).not.toBe(hostRunner);
  });

  it("tells the engineer to build the image when it is missing, and starts nothing", async () => {
    const { e, isolation } = await open();
    e.docker.imagePresent = false;
    const outcome = await isolation
      .runnerFor(stage(e, "builder"))
      .run(baseRequest({ role: "builder" }));
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? "" : JSON.stringify(outcome.failure)).toContain("pnpm desk docker build");
    expect(e.docker.runs).toHaveLength(0);
  });
});

describe("preflight", () => {
  it("passes with a daemon and a current image", async () => {
    const { isolation } = await open();
    expect(await isolation.preflight()).toBeNull();
  });

  it("names the problem when the daemon is down or the image is missing", async () => {
    const { e, isolation } = await open();
    e.docker.imagePresent = false;
    expect(await isolation.preflight()).toContain("pnpm desk docker build");
    e.docker.daemonUp = false;
    expect(await isolation.preflight()).toContain("Docker is not reachable");
  });
});

describe("runChecks in containers", () => {
  const artifacts = (e: DockerEnv) => path.join(e.scratch.root, "artifacts");

  /** The container workspace stays equal to the host unless `drift` says a step changed it. */
  const arrange = async (
    e: DockerEnv,
    options: { drift?: boolean; failStep?: string; outHash?: string } = {}
  ) => {
    await mkdir(artifacts(e), { recursive: true });
    e.answerSync();
    const clean = (await diffAgainstBase(hermeticExec, e.repo.dir, e.baseSha)).diffHash;
    const changed = "c".repeat(64);
    let baseDiffs = 0;
    e.docker.handlers.set("desk-workspace.mjs diff", (run: FakeRun) => {
      const input = JSON.parse(run.input ?? "{}") as { since: string };
      if (input.since === "checkpoint") {
        return jsonReply({
          status: "ok",
          diffHash: options.outHash ?? (options.drift === true ? changed : clean),
          bytes: 0,
          patch: "",
          nameStatus: null
        });
      }
      baseDiffs += 1;
      // The first read is before `pnpm generate`. Drift shows from the second read on.
      const hash = options.drift === true && baseDiffs >= 2 ? changed : clean;
      return jsonReply({
        status: "ok",
        diffHash: hash,
        bytes: 0,
        patch: "",
        nameStatus: Buffer.from("").toString("base64")
      });
    });
    e.docker.handlers.set("pnpm", (run: FakeRun) =>
      run.command.join(" ") === options.failStep
        ? { code: 1, stderr: "src/a.ts(1,1): error TS2322: boom" }
        : { code: 0, stdout: "ok\n" }
    );
  };

  const request = (e: DockerEnv) => ({
    issue: 7,
    worktree: e.repo.dir,
    kind: "loop" as const,
    config: deskConfigSchema.parse({}),
    exec: e.docker.exec,
    baseSha: e.baseSha,
    artifactsDir: artifacts(e)
  });

  it("runs generate and the loop checks in hardened containers and writes the same report", async () => {
    const { e, isolation } = await open();
    await arrange(e);

    const report = await isolation.runChecks(request(e));

    expect(report.passed).toBe(true);
    expect(report.steps.map((step) => step.argv.join(" "))).toEqual([
      "pnpm generate",
      "pnpm check:affected"
    ]);
    expect(
      checkReportSchema.parse(
        JSON.parse(await readFile(path.join(artifacts(e), "check-report.json"), "utf8"))
      )
    ).toEqual(report);

    const checks = e.docker.runs.filter((run) => run.labels["kaine-desk.kind"] === "check");
    expect(checks.map((run) => run.command.join(" "))).toEqual(["generate", "check:affected"]);
    for (const run of checks) {
      expect(run.entrypoint).toBe("pnpm");
      expect(run.argv[run.argv.indexOf("--network") + 1]).toBe("none");
      expect(run.argv).toContain("--read-only");
      expect(run.mounts).toEqual([
        "type=volume,src=kaine-desk-" + run.labels["kaine-desk.repo"] + "-7-ws,dst=/workspace"
      ]);
      const env_ = run.argv.flatMap((arg, index) => (arg === "--env" ? [run.argv[index + 1]] : []));
      expect(env_).toContain("NO_COLOR=1");
      expect(env_).toContain("FORCE_COLOR=0");
    }
    // Every check container was removed by label after its step.
    expect([...e.docker.containers.keys()]).toEqual([]);
  });

  it("fails the round with the same fingerprint logic when a step fails", async () => {
    const { e, isolation } = await open();
    await arrange(e, { failStep: "check:affected" });
    const report = await isolation.runChecks(request(e));
    expect(report.passed).toBe(false);
    expect(report.fingerprint).toMatch(/\S/);
    expect(report.steps.at(-1)?.tail).toContain("TS2322");
    // The fingerprint does not depend on container paths.
    const again = await isolation.runChecks(request(e));
    expect(again.fingerprint).toBe(report.fingerprint);
  });

  it("reports generated drift when the container workspace changes during pnpm generate", async () => {
    const { e, isolation } = await open();
    await arrange(e, { drift: true });
    const report = await isolation.runChecks(request(e));
    expect(report.passed).toBe(false);
    expect(report.generatedDrift).toBe(true);
    // The loop checks did not run after the drift.
    expect(
      e.docker.runs.filter((run) => run.script === "pnpm").map((run) => run.command.join(" "))
    ).toEqual(["generate"]);
  });

  it("refuses a report that disagrees with the container workspace", async () => {
    const { e, isolation } = await open();
    await arrange(e, { outHash: "9".repeat(64) });
    await expect(isolation.runChecks(request(e))).rejects.toThrow(/disagree/);
  });

  it("reports an unverified container removal as a failed step", async () => {
    const { e, isolation } = await open();
    await arrange(e);
    e.docker.handlers.set("pnpm", (run) => {
      e.docker.containers.set(run.name, run.labels);
      e.docker.stubborn.add(run.name);
      return { code: 0 };
    });
    const report = await isolation.runChecks(request(e));
    expect(report.passed).toBe(false);
    expect(report.steps[0]?.tail).toContain("Container cleanup is unverified");
  });

  it("stops with the build instruction when the image is missing", async () => {
    const { e, isolation } = await open();
    e.docker.imagePresent = false;
    await expect(isolation.runChecks(request(e))).rejects.toThrow(/pnpm desk docker build/);
  });
});

describe("cleanup", () => {
  it("removes the leftover containers of one issue, and only that issue", async () => {
    const { e, isolation } = await open();
    const mine = {
      "kaine-desk": "1",
      "kaine-desk.repo": isolation.scopeOf(7).repoKey,
      "kaine-desk.issue": "7"
    };
    e.docker.containers.set("kaine-desk-x-7-agent-1", mine);
    e.docker.containers.set("kaine-desk-x-8-agent-1", { ...mine, "kaine-desk.issue": "8" });
    const note = await isolation.removeContainers(7);
    expect(note).toContain("kaine-desk-x-7-agent-1");
    expect([...e.docker.containers.keys()]).toEqual(["kaine-desk-x-8-agent-1"]);
    expect(await isolation.removeContainers(7)).toBeNull();
  });

  it("also removes the socket volume of a killed run, and keeps the workspace volumes", async () => {
    const { e, isolation } = await open();
    const base = {
      "kaine-desk": "1",
      "kaine-desk.repo": isolation.scopeOf(7).repoKey,
      "kaine-desk.issue": "7"
    };
    e.docker.containers.set("kaine-desk-x-7-agent-1", { ...base, "kaine-desk.kind": "agent" });
    e.docker.volumes.set("kaine-desk-x-7-1-sock", { ...base, "kaine-desk.kind": "sock" });
    e.docker.volumes.set("kaine-desk-x-7-ws", { ...base, "kaine-desk.kind": "ws" });
    await isolation.removeContainers(7);
    expect([...e.docker.volumes.keys()]).toEqual(["kaine-desk-x-7-ws"]);
  });

  it("does not throw during recovery when Docker is down", async () => {
    const { e, isolation } = await open();
    e.docker.daemonUp = false;
    expect(await isolation.removeContainers(7)).toContain(
      "Could not check for leftover Docker containers"
    );
  });

  it("removes the containers and the volumes of an issue and nothing else", async () => {
    const { e, isolation } = await open();
    const labels = (issue: string) => ({
      "kaine-desk": "1",
      "kaine-desk.repo": isolation.scopeOf(7).repoKey,
      "kaine-desk.issue": issue
    });
    e.docker.containers.set("kaine-desk-x-7-agent-1", labels("7"));
    e.docker.volumes.set("kaine-desk-x-7-ws", labels("7"));
    e.docker.volumes.set("kaine-desk-x-8-ws", labels("8"));
    e.docker.volumes.set("pgdata", {});
    e.docker.volumes.set("kaine-desk-auth-claude", {
      "kaine-desk": "1",
      "kaine-desk.kind": "auth"
    });
    const note = await isolation.removeIssue(7);
    expect(note).toBe("Removed 1 container(s) and 1 volume(s) of the issue.");
    expect([...e.docker.volumes.keys()].sort()).toEqual([
      "kaine-desk-auth-claude",
      "kaine-desk-x-8-ws",
      "pgdata"
    ]);
  });

  it("throws when a removal cannot be verified", async () => {
    const { e, isolation } = await open();
    const labels = {
      "kaine-desk": "1",
      "kaine-desk.repo": isolation.scopeOf(7).repoKey,
      "kaine-desk.issue": "7"
    };
    e.docker.containers.set("kaine-desk-x-7-agent-1", labels);
    e.docker.stubborn.add("kaine-desk-x-7-agent-1");
    await expect(isolation.removeIssue(7)).rejects.toThrow(/could not be verified/);
  });
});
