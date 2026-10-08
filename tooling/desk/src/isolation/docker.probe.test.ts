import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { DENIED_HOSTS, PROBE_IDS, runIsolationProbes, runProbe } from "./docker.probe";
import { jsonReply } from "../testing/docker.fake";
import { createDockerEnv, type DockerEnv } from "../testing/docker.testing";

let env: DockerEnv | null = null;
afterEach(async () => {
  await env?.cleanup();
  env = null;
});
const open = async (): Promise<DockerEnv> => {
  env = await createDockerEnv();
  return env;
};

const report = (failing: string[] = []) =>
  jsonReply({
    ok: failing.length === 0,
    checks: PROBE_IDS.map((id) => ({ id, ok: !failing.includes(id), detail: id }))
  });

describe("the probe script", () => {
  it("reports every probe id that the host knows", async () => {
    const script = await readFile(
      fileURLToPath(new URL("../../docker/desk-probe.mjs", import.meta.url)),
      "utf8"
    );
    for (const id of PROBE_IDS) expect(script, id).toContain(`"${id}"`);
    const recorded = [...script.matchAll(/record\(\s*"([a-z-]+)"/g)].map((match) => match[1]);
    expect(recorded.sort()).toEqual([...PROBE_IDS].sort());
  });
});

describe("runProbe", () => {
  it("runs the probe in a hardened container and parses the report", async () => {
    const e = await open();
    e.docker.handlers.set("desk-probe.mjs", () => report());
    const result = await runProbe(e.context, { hostPaths: ["/Users/dev", e.repo.dir] });
    expect(result.ok).toBe(true);
    expect(result.checks.map((entry) => entry.id)).toEqual([...PROBE_IDS]);
    const run = e.docker.runs[0];
    expect(run?.argv).toContain("--read-only");
    expect(run?.argv[run.argv.indexOf("--network") + 1]).toBe("none");
    expect(JSON.parse(run?.command.at(-1) ?? "{}")).toEqual({
      hostPaths: ["/Users/dev", e.repo.dir],
      proxy: null
    });
  });

  it("still parses the report when the script exits 2 because a probe failed", async () => {
    const e = await open();
    e.docker.handlers.set("desk-probe.mjs", () => ({ ...report(["no-egress"]), code: 2 }));
    const result = await runProbe(e.context, { hostPaths: [] });
    expect(result.ok).toBe(false);
    expect(result.checks.find((entry) => entry.id === "no-egress")?.ok).toBe(false);
  });

  it("throws when the container did not run at all", async () => {
    const e = await open();
    e.docker.handlers.set("desk-probe.mjs", () => ({ code: 125, stderr: "image not found" }));
    await expect(runProbe(e.context, { hostPaths: [] })).rejects.toThrow(
      /did not run.*image not found/
    );
  });

  it("throws on a report in the wrong shape", async () => {
    const e = await open();
    e.docker.handlers.set("desk-probe.mjs", () => jsonReply({ ok: true }));
    await expect(runProbe(e.context, { hostPaths: [] })).rejects.toThrow(/unexpected/);
  });
});

describe("runIsolationProbes", () => {
  it("tests the providers policy for refusals only, so the doctor never contacts a provider", async () => {
    const e = await open();
    e.docker.handlers.set("desk-probe.mjs", () => report());
    await runIsolationProbes(e.context, ["/Users/dev"]);
    const proxy = e.docker.runs.find((run) => run.script === "desk-proxy.mjs");
    expect(proxy?.command.at(-1)).toBe("providers");
    const probe = e.docker.runs.find((run) => run.script === "desk-probe.mjs");
    const options = JSON.parse(probe?.command.at(-1) ?? "{}") as {
      proxy: { allowed: string[]; denied: string[] };
    };
    expect(options.proxy.allowed).toEqual([]);
    expect(options.proxy.denied).toEqual([...DENIED_HOSTS]);
    expect(probe?.mounts.some((mount) => mount.includes("dst=/socket,readonly"))).toBe(true);
    // The proxy and its socket volume are removed afterwards.
    expect([...e.docker.containers.keys()]).toEqual([]);
    expect([...e.docker.volumes.keys()]).toEqual([]);
  });
});
