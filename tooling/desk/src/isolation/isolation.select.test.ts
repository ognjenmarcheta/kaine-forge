import { describe, expect, it } from "vitest";

import { createReplayRunner } from "../agents/agent.replay";
import { deskConfigSchema } from "../contracts";
import { createHostIsolation } from "./isolation.host";
import type { IsolationPort } from "./isolation.port";
import { containerCleanupFor, isolationOf, selectIsolation } from "./isolation.select";

const config = (isolation: "host" | "docker") => deskConfigSchema.parse({ isolation });
const runnerFor = () => createReplayRunner([]);
const docker: IsolationPort = {
  mode: "docker",
  preflight: () => Promise.resolve(null),
  runnerFor,
  runChecks: () => Promise.reject(new Error("unused")),
  removeContainers: () => Promise.resolve("removed"),
  removeIssue: () => Promise.resolve(null)
};

describe("isolationOf", () => {
  it("prefers the issue's own choice over the config", () => {
    expect(isolationOf(config("host"), { isolation: "docker" })).toBe("docker");
    expect(isolationOf(config("docker"), { isolation: "host" })).toBe("host");
    expect(isolationOf(config("docker"), {})).toBe("docker");
    expect(isolationOf(config("host"), {})).toBe("host");
  });
});

describe("selectIsolation", () => {
  it("gives the host port for a host issue, with no preflight problem and no Docker work", async () => {
    const selected = selectIsolation({ config: config("host"), runnerFor, docker }, {});
    expect(selected.ok).toBe(true);
    if (!selected.ok) return;
    expect(selected.port.mode).toBe("host");
    expect(await selected.port.preflight()).toBeNull();
    expect(await selected.port.removeContainers(7)).toBeNull();
    expect(await selected.port.removeIssue(7)).toBeNull();
  });

  it("gives the Docker port for a Docker issue", () => {
    const selected = selectIsolation(
      { config: config("host"), runnerFor, docker },
      { isolation: "docker" }
    );
    expect(selected).toEqual({ ok: true, port: docker });
  });

  it("explains a Docker issue in a process without Docker support", () => {
    const selected = selectIsolation({ config: config("docker"), runnerFor }, {});
    expect(selected).toMatchObject({ ok: false });
    expect(selected.ok ? "" : selected.reason).toContain("Docker isolation is requested");
  });
});

describe("the host port", () => {
  it("returns the runner of the provider for every role", () => {
    const runner = createReplayRunner([]);
    const port = createHostIsolation({ runnerFor: () => runner });
    for (const role of ["planner", "builder", "reviewer"] as const) {
      expect(
        port.runnerFor({
          role,
          provider: "claude",
          issue: 7,
          worktree: "/w",
          baseSha: "a".repeat(40),
          artifactsDir: "/a"
        })
      ).toBe(runner);
    }
  });
});

describe("containerCleanupFor", () => {
  it("cleans only Docker issues", async () => {
    const cleanup = containerCleanupFor({ config: config("host"), docker });
    expect(await cleanup({ issueNumber: 7 })).toBeNull();
    expect(await cleanup({ issueNumber: 7, isolation: "docker" })).toBe("removed");
    expect(
      await containerCleanupFor({ config: config("docker"), docker: undefined })({ issueNumber: 7 })
    ).toBeNull();
  });
});
