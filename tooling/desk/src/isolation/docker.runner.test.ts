import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createDockerAgentRunner } from "./docker.runner";
import type { AgentProcess, AgentProcessRequest } from "../agents/agent.process";
import type { AgentEvent } from "../agents/agent.runner";
import { diffAgainstBase } from "../git";
import { baseRequest, fixtureLines, requestFor } from "../testing/agent.testing";
import { jsonReply, type FakeDocker } from "../testing/docker.fake";
import { createDockerEnv, patchAfter, type DockerEnv } from "../testing/docker.testing";
import { hermeticExec } from "../testing/git.repo";

let env: DockerEnv | null = null;
afterEach(async () => {
  await env?.cleanup();
  env = null;
});

const valueAfter = (args: readonly string[], flag: string): string | undefined => {
  const index = args.indexOf(flag);
  return index < 0 ? undefined : args[index + 1];
};
const valuesAfter = (args: readonly string[], flag: string): string[] =>
  args.flatMap((arg, index) => (arg === flag ? [args[index + 1] ?? ""] : []));

interface Script {
  readonly lines?: readonly string[];
  readonly result?: Partial<Awaited<ReturnType<AgentProcess>>>;
  /** The killed `docker run` client left its container behind. */
  readonly leave?: boolean;
  /** Runs while the container "runs": read the staged files here. */
  readonly during?: (request: AgentProcessRequest) => Promise<void>;
}

/** A fake for the process that streams `docker run`. It records what the real one would receive. */
const scriptedProcess = (docker: FakeDocker, script: Script = {}) => {
  const requests: AgentProcessRequest[] = [];
  const process: AgentProcess = async (request) => {
    requests.push(request);
    const args = request.argv;
    request.onSpawn?.(4242);
    await script.during?.(request);
    if (script.leave === true) {
      const name = valueAfter(args, "--name") ?? "";
      docker.containers.set(
        name,
        Object.fromEntries(
          valuesAfter(args, "--label").map((entry) => [
            entry.split("=")[0] ?? "",
            entry.split("=").slice(1).join("=")
          ])
        )
      );
    }
    for (const line of script.lines ?? []) request.onLine(line);
    return {
      code: 0,
      timedOut: false,
      aborted: false,
      stderrTail: "",
      ...script.result
    };
  };
  return { process, requests };
};

const stagingOf = (request: AgentProcessRequest): string => {
  const mount = valuesAfter(request.argv, "--mount").find((entry) => entry.startsWith("type=bind"));
  const source = /src=([^,]+)/.exec(mount ?? "")?.[1];
  if (source === undefined) throw new Error("no staging mount");
  return source;
};

const prepare = async (): Promise<{ e: DockerEnv; artifactsDir: string; receiptsPath: string }> => {
  const e = await createDockerEnv();
  env = e;
  e.answerSync();
  e.docker.handlers.set("desk-workspace.mjs diff", () =>
    jsonReply({ status: "ok", diffHash: "0".repeat(64), bytes: 0, patch: "", nameStatus: null })
  );
  e.docker.handlers.set("cat", () => ({
    stdout: '{"tool":"Bash","command":"pnpm generate","ts":"2026-10-08T00:00:00.000Z"}\n'
  }));
  e.docker.handlers.set("desk-entry.mjs auth-sync", () => jsonReply({ synced: [] }));
  const artifactsDir = path.join(e.scratch.root, "artifacts");
  await mkdir(artifactsDir, { recursive: true });
  await writeFile(path.join(artifactsDir, "ticket.md"), "# Ticket\n");
  return { e, artifactsDir, receiptsPath: path.join(artifactsDir, "receipts-builder.jsonl") };
};

const runnerFor = (
  e: DockerEnv,
  artifactsDir: string,
  process: AgentProcess,
  extra: { forwardEnv?: readonly string[] } = {}
) =>
  createDockerAgentRunner(
    { context: e.context, process, forwardEnv: extra.forwardEnv ?? [] },
    { target: e.target, artifactsDir }
  );

const kinds = (e: DockerEnv): string[] =>
  e.docker.runs.map((run) => run.labels["kaine-desk.kind"] ?? "");

describe("createDockerAgentRunner with Claude", () => {
  it("wraps the Claude arguments in a hardened docker run and unwraps the stream", async () => {
    const { e, artifactsDir, receiptsPath } = await prepare();
    let stagedSettings = "";
    const { process, requests } = scriptedProcess(e.docker, {
      lines: fixtureLines("claude-structured.jsonl"),
      during: async (request) => {
        stagedSettings = await readFile(path.join(stagingOf(request), "settings.json"), "utf8");
      }
    });
    const events: AgentEvent[] = [];
    const outcome = await runnerFor(e, artifactsDir, process).run(
      baseRequest({
        role: "builder",
        cwd: e.repo.dir,
        prompt: "Build it.",
        settingsPath: path.join(artifactsDir, "run-settings-builder.json"),
        mcpConfigPath: path.join(e.repo.dir, ".mcp.json"),
        receiptsPath,
        permissions: { allow: ["Read", "Edit"], disallow: ["WebFetch"] },
        onEvent: (event) => events.push(event)
      })
    );

    // The stream is parsed exactly as in host mode.
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.structured).toEqual({ word: "PINEAPPLE-42", overrideSeen: true });
    expect(events.some((event) => event.type === "tool_call" && event.tool === "Skill")).toBe(true);

    // One `docker run` for the agent, hardened, with the Claude CLI inside.
    expect(requests).toHaveLength(1);
    const argv = requests[0]?.argv ?? [];
    expect(argv.slice(0, 2)).toEqual(["docker", "run"]);
    expect(valueAfter(argv, "--network")).toBe("none");
    expect(valueAfter(argv, "--cap-drop")).toBe("ALL");
    expect(argv).toContain("--read-only");
    expect(valueAfter(argv, "--workdir")).toBe("/workspace");
    const afterImage = argv.slice(argv.indexOf("kaine-desk-worker:test") + 1);
    expect(afterImage.slice(0, 5)).toEqual([
      "/opt/desk/desk-entry.mjs",
      "agent",
      "claude",
      "--",
      "claude"
    ]);
    expect(valueAfter(afterImage, "--settings")).toBe("/desk/in/settings.json");
    expect(afterImage).not.toContain("--mcp-config");
    expect(afterImage).toContain("--strict-mcp-config");
    expect(valuesAfter(afterImage, "--allowedTools")).toEqual(["Read", "Edit"]);

    // No host path leaks into the arguments, except the read-only staging folder.
    const text = argv.join(" ");
    expect(text).not.toContain(e.repo.dir);
    expect(text).not.toContain(artifactsDir);
    expect(valuesAfter(argv, "--env")).toContain(
      "KAINE_DESK_RECEIPTS=/state/receipts-builder.jsonl"
    );

    // The hooks in the staged settings use container paths.
    const settings = JSON.parse(stagedSettings) as {
      hooks: {
        PreToolUse: { hooks: { command: string }[] }[];
        PostToolUse: { hooks: { command: string }[] }[];
      };
    };
    expect(settings.hooks.PreToolUse[0]?.hooks[0]?.command).toBe(
      'node "/workspace/.ai/hooks/pre-tool-use.mjs" --agent claude'
    );
    expect(settings.hooks.PostToolUse[0]?.hooks[0]?.command).toBe(
      'node "/opt/desk/receipt.mjs" "/state/receipts-builder.jsonl"'
    );

    // Order: import, proxy up, agent, then everything is brought back.
    expect(kinds(e)).toEqual(["import", "proxy", "export", "export", "auth-sync"]);
    // Receipts came back to the host path.
    expect(await readFile(receiptsPath, "utf8")).toContain('"command":"pnpm generate"');
    // Nothing is left: no container, no socket volume, no staging folder.
    expect([...e.docker.containers.keys()]).toEqual([]);
    expect([...e.docker.volumes.keys()].some((name) => name.endsWith("-sock"))).toBe(false);
  });

  it("asks for a new session on a new volume, and resumes on a known one", async () => {
    const { e, artifactsDir } = await prepare();
    const first = scriptedProcess(e.docker, { lines: fixtureLines("claude-structured.jsonl") });
    await runnerFor(e, artifactsDir, first.process).run(
      baseRequest({ role: "builder", cwd: e.repo.dir, resumeSessionId: "old-session" })
    );
    const firstArgs = first.requests[0]?.argv ?? [];
    expect(firstArgs).not.toContain("--resume");
    expect(firstArgs).toContain("--session-id");

    const second = scriptedProcess(e.docker, { lines: fixtureLines("claude-structured.jsonl") });
    await runnerFor(e, artifactsDir, second.process).run(
      baseRequest({ role: "builder", cwd: e.repo.dir, resumeSessionId: "old-session" })
    );
    expect(valueAfter(second.requests[0]?.argv ?? [], "--resume")).toBe("old-session");
  });

  it("forwards a configured API key by name and never as a value", async () => {
    const { e, artifactsDir } = await prepare();
    const { process, requests } = scriptedProcess(e.docker, {
      lines: fixtureLines("claude-structured.jsonl")
    });
    await runnerFor(e, artifactsDir, process, { forwardEnv: ["ANTHROPIC_API_KEY"] }).run(
      baseRequest({ role: "builder", cwd: e.repo.dir })
    );
    const argv = requests[0]?.argv ?? [];
    expect(valuesAfter(argv, "--env")).toContain("ANTHROPIC_API_KEY");
    expect(argv.join(" ")).not.toContain("ANTHROPIC_API_KEY=");
  });

  it("copies a large ticket into the staging folder and points the prompt at it", async () => {
    const { e, artifactsDir } = await prepare();
    let staged = "";
    const { process, requests } = scriptedProcess(e.docker, {
      lines: fixtureLines("claude-structured.jsonl"),
      during: async (request) => {
        staged = await readFile(path.join(stagingOf(request), "artifacts", "ticket.md"), "utf8");
      }
    });
    await runnerFor(e, artifactsDir, process).run(
      baseRequest({
        role: "builder",
        cwd: e.repo.dir,
        prompt: `Read the ticket at ${artifactsDir}/ticket.md now.`
      })
    );
    expect(staged).toBe("# Ticket\n");
    expect(requests[0]?.argv[requests[0].argv.indexOf("-p") + 1]).toBe(
      "Read the ticket at /desk/in/artifacts/ticket.md now."
    );
  });

  it("removes a container that a killed client left behind and verifies it", async () => {
    const { e, artifactsDir } = await prepare();
    const { process } = scriptedProcess(e.docker, {
      lines: fixtureLines("claude-structured.jsonl"),
      leave: true
    });
    const outcome = await runnerFor(e, artifactsDir, process).run(
      baseRequest({ role: "builder", cwd: e.repo.dir })
    );
    expect(outcome.ok).toBe(true);
    expect([...e.docker.containers.keys()]).toEqual([]);
    // The removal went by label, so only desk containers were named.
    const removal = e.docker.calls.filter((call) => call.startsWith("rm --force"));
    expect(removal.length).toBeGreaterThan(0);
    for (const call of removal) expect(call).toMatch(/kaine-desk-/);
  });

  it("fails the run when the container cannot be removed, even if the agent succeeded", async () => {
    const { e, artifactsDir } = await prepare();
    const { process, requests } = scriptedProcess(e.docker, {
      lines: fixtureLines("claude-structured.jsonl"),
      leave: true
    });
    // Make the agent container stubborn once the process names it.
    const wrapped: AgentProcess = async (request) => {
      e.docker.stubborn.add(valueAfter(request.argv, "--name") ?? "");
      return process(request);
    };
    const outcome = await runnerFor(e, artifactsDir, wrapped).run(
      baseRequest({ role: "builder", cwd: e.repo.dir })
    );
    expect(requests).toHaveLength(1);
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? "" : JSON.stringify(outcome.failure)).toContain(
      "Container cleanup is unverified"
    );
  });

  it("still brings the work back when the agent times out", async () => {
    const { e, artifactsDir } = await prepare();
    const { process } = scriptedProcess(e.docker, { result: { code: null, timedOut: true } });
    const outcome = await runnerFor(e, artifactsDir, process).run(
      baseRequest({ role: "builder", cwd: e.repo.dir, timeoutMs: 1000 })
    );
    expect(outcome).toMatchObject({ ok: false, failure: { kind: "timeout", timeoutMs: 1000 } });
    expect(kinds(e)).toContain("export");
  });

  it("applies the container's patch to the host worktree", async () => {
    const { e, artifactsDir } = await prepare();
    const patch = await patchAfter(e, () =>
      e.repo.write("src/feature.ts", "export const f = 1;\n")
    );
    await e.repo.write("src/feature.ts", "export const f = 1;\n");
    const hash = (await diffAgainstBase(hermeticExec, e.repo.dir, e.baseSha)).diffHash;
    await e.repo.git(["clean", "--quiet", "-fd"]);
    e.docker.handlers.set("desk-workspace.mjs diff", () =>
      jsonReply({
        status: "ok",
        diffHash: hash,
        bytes: patch.length,
        patch: Buffer.from(patch).toString("base64"),
        nameStatus: null
      })
    );
    const { process } = scriptedProcess(e.docker, {
      lines: fixtureLines("claude-structured.jsonl")
    });
    const outcome = await runnerFor(e, artifactsDir, process).run(
      baseRequest({ role: "builder", cwd: e.repo.dir })
    );
    expect(outcome.ok).toBe(true);
    expect(await readFile(path.join(e.repo.dir, "src/feature.ts"), "utf8")).toBe(
      "export const f = 1;\n"
    );
  });

  it("turns a refused patch into a failed run, with the reason", async () => {
    const { e, artifactsDir } = await prepare();
    const patch = await patchAfter(e, () => e.repo.write(".husky/pre-commit", "evil\n"));
    e.docker.handlers.set("desk-workspace.mjs diff", () =>
      jsonReply({
        status: "ok",
        diffHash: "f".repeat(64),
        bytes: patch.length,
        patch: Buffer.from(patch).toString("base64"),
        nameStatus: null
      })
    );
    const events: AgentEvent[] = [];
    const { process } = scriptedProcess(e.docker, {
      lines: fixtureLines("claude-structured.jsonl")
    });
    const outcome = await runnerFor(e, artifactsDir, process).run(
      baseRequest({ role: "builder", cwd: e.repo.dir, onEvent: (event) => events.push(event) })
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? "" : JSON.stringify(outcome.failure)).toContain("Protected path");
    expect(events.some((event) => event.type === "error")).toBe(true);
    await expect(readFile(path.join(e.repo.dir, ".husky/pre-commit"), "utf8")).rejects.toThrow();
  });

  it("reports a failed import without starting an agent", async () => {
    const { e, artifactsDir } = await prepare();
    e.docker.handlers.set("desk-workspace.mjs sync", () => ({ code: 1, stderr: "disk full" }));
    const { process, requests } = scriptedProcess(e.docker);
    const outcome = await runnerFor(e, artifactsDir, process).run(
      baseRequest({ role: "builder", cwd: e.repo.dir })
    );
    expect(requests).toHaveLength(0);
    expect(outcome).toMatchObject({ ok: false, failure: { kind: "process-error" } });
    expect(outcome.ok ? "" : JSON.stringify(outcome.failure)).toContain("disk full");
  });

  it("tells the engineer to log in when the provider rejects the login", async () => {
    const { e, artifactsDir } = await prepare();
    const result = JSON.stringify({
      type: "result",
      subtype: "error_during_execution",
      is_error: true,
      result: "Not logged in. Please run /login",
      session_id: "s"
    });
    const { process } = scriptedProcess(e.docker, { lines: [result] });
    const outcome = await runnerFor(e, artifactsDir, process).run(
      baseRequest({ role: "builder", cwd: e.repo.dir })
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? "" : JSON.stringify(outcome.failure)).toContain(
      "pnpm desk docker login --provider claude"
    );
  });

  it("returns an abort as an abort", async () => {
    const { e, artifactsDir } = await prepare();
    const { process } = scriptedProcess(e.docker, { result: { code: null, aborted: true } });
    const outcome = await runnerFor(e, artifactsDir, process).run(
      baseRequest({ role: "builder", cwd: e.repo.dir })
    );
    expect(outcome).toMatchObject({ ok: false, failure: { kind: "aborted" } });
  });
});

describe("createDockerAgentRunner with Codex", () => {
  const codexSchema = z.object({ word: z.string(), cwdHasPackageJson: z.boolean() }).strict();

  it("runs Codex without its own sandbox only because the container is the sandbox", async () => {
    const { e, artifactsDir } = await prepare();
    let schemaFile = "";
    const { process, requests } = scriptedProcess(e.docker, {
      lines: fixtureLines("codex-structured.jsonl"),
      during: async (request) => {
        schemaFile = await readFile(path.join(stagingOf(request), "output-schema.json"), "utf8");
      }
    });
    const outcome = await runnerFor(e, artifactsDir, process).run(
      requestFor(codexSchema, { role: "builder", provider: "codex", cwd: e.repo.dir })
    );
    expect(outcome.ok).toBe(true);
    const argv = requests[0]?.argv ?? [];
    const afterImage = argv.slice(argv.indexOf("kaine-desk-worker:test") + 1);
    expect(afterImage.slice(0, 5)).toEqual([
      "/opt/desk/desk-entry.mjs",
      "agent",
      "codex",
      "--",
      "codex"
    ]);
    expect(afterImage).toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(afterImage).not.toContain("-s");
    expect(valueAfter(afterImage, "-C")).toBe("/workspace");
    expect(valueAfter(afterImage, "--output-schema")).toBe("/desk/in/output-schema.json");
    expect(valueAfter(afterImage, "-o")).toBe("/tmp/desk-last-message.txt");
    expect(JSON.parse(schemaFile)).toMatchObject({ type: "object" });
    // The container itself is still hardened: the bypass flag lowers nothing outside Codex.
    expect(valueAfter(argv, "--network")).toBe("none");
    expect(valueAfter(argv, "--cap-drop")).toBe("ALL");
  });

  it("resumes a thread with the same bypass flag", async () => {
    const { e, artifactsDir } = await prepare();
    // A first run creates the volume, so the second run may resume.
    const first = scriptedProcess(e.docker, { lines: fixtureLines("codex-structured.jsonl") });
    await runnerFor(e, artifactsDir, first.process).run(
      requestFor(codexSchema, { role: "builder", provider: "codex", cwd: e.repo.dir })
    );
    const second = scriptedProcess(e.docker, { lines: fixtureLines("codex-structured.jsonl") });
    await runnerFor(e, artifactsDir, second.process).run(
      requestFor(codexSchema, {
        role: "builder",
        provider: "codex",
        cwd: e.repo.dir,
        resumeSessionId: "thread-1"
      })
    );
    const argv = second.requests[0]?.argv ?? [];
    const afterImage = argv.slice(argv.indexOf("kaine-desk-worker:test") + 1);
    expect(afterImage.slice(4, 7)).toEqual(["codex", "exec", "resume"]);
    expect(afterImage).toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(afterImage).toContain("thread-1");
  });

  it("refuses to run a planner or a reviewer without the Codex sandbox", async () => {
    const { e, artifactsDir } = await prepare();
    const { process, requests } = scriptedProcess(e.docker, {
      lines: fixtureLines("codex-structured.jsonl")
    });
    const outcome = await runnerFor(e, artifactsDir, process).run(
      requestFor(codexSchema, { role: "reviewer", provider: "codex", cwd: e.repo.dir })
    );
    expect(requests).toHaveLength(0);
    expect(outcome.ok ? "" : JSON.stringify(outcome.failure)).toContain("Only the builder");
  });
});
