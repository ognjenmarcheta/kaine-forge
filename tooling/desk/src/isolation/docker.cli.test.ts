import { describe, expect, it } from "vitest";

import type { ExecRequest } from "../ports";
import { DockerError, createDockerClient } from "./docker.cli";
import { fakeExec, fail, ok, type FakeRoute } from "../testing/exec.fake";

const noWait = { sleep: () => Promise.resolve(), verifyTries: 3 };
const FILTERS = ["label=kaine-desk=1", "label=kaine-desk.issue=7"];

/** `docker ps` answers from a list that `rm` empties, like a daemon would. */
const daemon = (initial: string[], options: { stuck?: boolean } = {}) => {
  let containers = [...initial];
  const routes: FakeRoute[] = [
    { argv: ["docker", "ps"], reply: () => ok(containers.join("\n")) },
    {
      argv: ["docker", "rm"],
      reply: () => {
        if (options.stuck !== true) containers = [];
        return ok("");
      }
    }
  ];
  return fakeExec(routes);
};

const argvOf = (calls: readonly ExecRequest[]): string[] =>
  calls.map((call) => call.argv.join(" "));

describe("removeContainers", () => {
  it("lists by label, removes by name, and verifies by listing again", async () => {
    const { exec, calls } = daemon(["kaine-desk-a-7-agent-1", "kaine-desk-a-7-proxy-1"]);
    const removed = await createDockerClient(exec, noWait).removeContainers(FILTERS);
    expect(removed).toEqual(["kaine-desk-a-7-agent-1", "kaine-desk-a-7-proxy-1"]);
    expect(argvOf(calls)).toEqual([
      "docker ps -a --filter label=kaine-desk=1 --filter label=kaine-desk.issue=7 --format {{.Names}}",
      "docker rm --force kaine-desk-a-7-agent-1 kaine-desk-a-7-proxy-1",
      "docker ps -a --filter label=kaine-desk=1 --filter label=kaine-desk.issue=7 --format {{.Names}}"
    ]);
  });

  it("removes nothing when nothing matches", async () => {
    const { exec, calls } = daemon([]);
    expect(await createDockerClient(exec, noWait).removeContainers(FILTERS)).toEqual([]);
    expect(argvOf(calls)).toHaveLength(1);
  });

  it("throws when the container is still listed after the removal", async () => {
    const { exec } = daemon(["kaine-desk-a-7-agent-1"], { stuck: true });
    await expect(createDockerClient(exec, noWait).removeContainers(FILTERS)).rejects.toThrow(
      /could not be verified/
    );
  });

  it("refuses a resource that carries the label but not the desk name prefix", async () => {
    const { exec, calls } = daemon(["postgres-db"]);
    await expect(createDockerClient(exec, noWait).removeContainers(FILTERS)).rejects.toThrow(
      /foreign name.*postgres-db/
    );
    expect(argvOf(calls).some((line) => line.startsWith("docker rm"))).toBe(false);
  });
});

describe("removeVolumes", () => {
  it("removes by name and verifies", async () => {
    let volumes = ["kaine-desk-a-7-ws", "kaine-desk-a-7-state"];
    const { exec, calls } = fakeExec([
      { argv: ["docker", "volume", "ls"], reply: () => ok(volumes.join("\n")) },
      {
        argv: ["docker", "volume", "rm"],
        reply: () => {
          volumes = [];
          return ok("");
        }
      }
    ]);
    expect(await createDockerClient(exec, noWait).removeVolumes(FILTERS)).toEqual([
      "kaine-desk-a-7-ws",
      "kaine-desk-a-7-state"
    ]);
    expect(argvOf(calls)).toContain("docker volume rm kaine-desk-a-7-ws kaine-desk-a-7-state");
  });

  it("throws DockerError when the daemon refuses to remove a volume", async () => {
    const { exec } = fakeExec([
      { argv: ["docker", "volume", "ls"], reply: ok("kaine-desk-a-7-ws") },
      { argv: ["docker", "volume", "rm"], reply: fail("volume is in use") }
    ]);
    await expect(createDockerClient(exec, noWait).removeVolumes(FILTERS)).rejects.toBeInstanceOf(
      DockerError
    );
  });
});

describe("ensureVolume and reachable", () => {
  it("creates a labelled volume once", async () => {
    let created = false;
    const { exec, calls } = fakeExec([
      {
        argv: ["docker", "volume", "inspect"],
        reply: () => (created ? ok("[]") : fail("no such volume"))
      },
      {
        argv: ["docker", "volume", "create"],
        reply: () => {
          created = true;
          return ok("kaine-desk-a-7-ws");
        }
      }
    ]);
    const client = createDockerClient(exec, noWait);
    const labels = { "kaine-desk": "1", "kaine-desk.kind": "ws" };
    expect(await client.ensureVolume("kaine-desk-a-7-ws", labels)).toBe(true);
    expect(await client.ensureVolume("kaine-desk-a-7-ws", labels)).toBe(false);
    expect(argvOf(calls)[1]).toBe(
      "docker volume create --label kaine-desk=1 --label kaine-desk.kind=ws kaine-desk-a-7-ws"
    );
  });

  it("reports whether the daemon answers", async () => {
    const up = fakeExec([{ argv: ["docker", "version"], reply: ok("29.2.1") }]);
    expect(await createDockerClient(up.exec, noWait).reachable()).toEqual({ ok: true });
    const down = fakeExec([{ argv: ["docker", "version"], reply: fail("Cannot connect") }]);
    expect(await createDockerClient(down.exec, noWait).reachable()).toEqual({
      ok: false,
      detail: "Cannot connect"
    });
  });
});
