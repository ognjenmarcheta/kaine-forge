import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { AgentProcess, AgentProcessRequest } from "./agent.process";
import type { AgentRunRequest, SandboxMode } from "./agent.runner";
import {
  CONTAINER_BYPASS_FLAG,
  CodexPolicyError,
  buildCodexArgs,
  codexSandboxFor,
  createCodexRunner,
  parseCodexStream,
  unwrapShellCommand
} from "./codex.runner";
import { baseRequest, fixtureLines } from "../testing/agent.testing";

const files = { schemaPath: "/run/schema.json", outputPath: "/run/last.txt" };
const codexRequest = (overrides: Partial<AgentRunRequest<never>> = {}) =>
  baseRequest({ provider: "codex", ...overrides });
const valueAfter = (args: readonly string[], flag: string): string | undefined => {
  const index = args.indexOf(flag);
  return index < 0 ? undefined : args[index + 1];
};
const configValues = (args: readonly string[]): string[] =>
  args.flatMap((arg, index) => (arg === "-c" ? [args[index + 1] ?? ""] : []));
const beforePrompt = (args: readonly string[]): string[] => args.slice(0, args.indexOf("--"));

describe("codexSandboxFor", () => {
  it.each(["planner", "reviewer", "intake"] as const)("always gives a %s read-only", (role) => {
    expect(codexSandboxFor(codexRequest({ role }))).toBe("read-only");
    for (const sandbox of ["workspace-write", "read-only"] as SandboxMode[]) {
      expect(
        codexSandboxFor(
          codexRequest({
            role,
            allowCodexBuilder: true,
            permissions: { allow: [], disallow: [], sandbox }
          })
        )
      ).toBe("read-only");
    }
  });

  it("rejects a builder without the explicit config opt-in", () => {
    expect(() => codexSandboxFor(codexRequest({ role: "builder" }))).toThrow(CodexPolicyError);
    expect(() =>
      codexSandboxFor(codexRequest({ role: "builder", allowCodexBuilder: false }))
    ).toThrow(CodexPolicyError);
  });

  it("gives an opted-in builder workspace-write and nothing wider", () => {
    expect(codexSandboxFor(codexRequest({ role: "builder", allowCodexBuilder: true }))).toBe(
      "workspace-write"
    );
  });
});

describe("buildCodexArgs", () => {
  it("builds a read-only planner run with the safety flags", () => {
    const args = buildCodexArgs(codexRequest({ role: "planner", prompt: "PLAN IT" }), files);
    expect(args.slice(0, 1)).toEqual(["exec"]);
    expect(valueAfter(args, "-C")).toBe("/work/repo");
    expect(valueAfter(args, "-s")).toBe("read-only");
    expect(configValues(args)).toContain('approval_policy="never"');
    expect(args).toContain("--ignore-user-config");
    expect(args).toContain("--json");
    expect(valueAfter(args, "--output-schema")).toBe(files.schemaPath);
    expect(valueAfter(args, "-o")).toBe(files.outputPath);
    expect(args.slice(-2)).toEqual(["--", "PLAN IT"]);
  });

  it("gives an opted-in builder workspace-write with the network off", () => {
    const args = buildCodexArgs(codexRequest({ role: "builder", allowCodexBuilder: true }), files);
    expect(valueAfter(args, "-s")).toBe("workspace-write");
    expect(configValues(args)).toContain("sandbox_workspace_write.network_access=false");
  });

  it("refuses a builder without the opt-in", () => {
    expect(() => buildCodexArgs(codexRequest({ role: "builder" }), files)).toThrow(/disabled/);
  });

  it.each([
    codexRequest({ role: "planner" }),
    codexRequest({ role: "reviewer", model: "gpt-5" }),
    codexRequest({ role: "intake", resumeSessionId: "thread-1" }),
    codexRequest({ role: "builder", allowCodexBuilder: true }),
    codexRequest({ role: "builder", allowCodexBuilder: true, resumeSessionId: "thread-1" }),
    codexRequest({
      role: "builder",
      allowCodexBuilder: true,
      permissions: { allow: [], disallow: [], sandbox: "workspace-write" }
    })
  ])("never emits a full-access or bypass flag (%#)", (request) => {
    const args = beforePrompt(buildCodexArgs(request, files));
    const text = args.join(" ");
    expect(text).not.toContain("danger-full-access");
    expect(text).not.toContain("--dangerously");
    expect(text).not.toContain("--full-auto");
    expect(text).not.toContain("--yolo");
    expect(args).toContain("--ignore-user-config");
    expect(configValues(args)).toContain('approval_policy="never"');
  });

  it("resumes a thread with the sandbox as config, since resume has no -s or -C", () => {
    const args = buildCodexArgs(
      codexRequest({ role: "reviewer", resumeSessionId: "thread-9" }),
      files
    );
    expect(args.slice(0, 2)).toEqual(["exec", "resume"]);
    expect(args).not.toContain("-s");
    expect(args).not.toContain("-C");
    expect(configValues(args)).toContain('sandbox_mode="read-only"');
    expect(args.slice(-3)).toEqual(["thread-9", "--", "Do the task."]);
  });

  it("resumes an opted-in builder as workspace-write only", () => {
    const args = buildCodexArgs(
      codexRequest({ role: "builder", allowCodexBuilder: true, resumeSessionId: "t" }),
      files
    );
    expect(configValues(args)).toContain('sandbox_mode="workspace-write"');
  });

  it("keeps prompt text out of the flag list, even when it looks like a flag", () => {
    const prompt = "--dangerously-bypass-approvals-and-sandbox -s danger-full-access";
    const args = buildCodexArgs(codexRequest({ role: "planner", prompt }), files);
    expect(args.slice(-2)).toEqual(["--", prompt]);
    expect(beforePrompt(args).join(" ")).not.toContain("danger");
  });

  it("puts the override block in front of the prompt, since Codex has no system-prompt flag", () => {
    const args = buildCodexArgs(
      codexRequest({ role: "planner", prompt: "TASK", systemAppend: "RULES" }),
      files
    );
    expect(args.at(-1)).toBe("RULES\n\nTASK");
  });

  it("rejects a model name that is not a plain identifier", () => {
    expect(() =>
      buildCodexArgs(codexRequest({ role: "planner", model: "--dangerously-bypass" }), files)
    ).toThrow(CodexPolicyError);
  });
});

describe("unwrapShellCommand", () => {
  it.each([
    ["/bin/zsh -lc 'touch four.txt'", "touch four.txt"],
    [
      `/bin/zsh -lc "sed -n '1,200p' .agents/skills/x/SKILL.md"`,
      "sed -n '1,200p' .agents/skills/x/SKILL.md"
    ],
    ["/bin/bash -c 'git status'", "git status"],
    ["git status", "git status"]
  ])("unwraps %s", (input, expected) => {
    expect(unwrapShellCommand(input)).toBe(expected);
  });
});

describe("parseCodexStream", () => {
  it("reads the thread, the skill read, the answer and usage", () => {
    const summary = parseCodexStream(fixtureLines("codex-skill-read.jsonl"));
    expect(summary.threadId).toBe("00000000-0000-4000-8000-000000000001");
    expect(summary.completed).toBe(true);
    expect(summary.usage.outputTokens).toBe(346);
    const call = summary.events.find((event) => event.type === "tool_call");
    expect(call).toMatchObject({
      tool: "Bash",
      command: "sed -n '1,200p' .agents/skills/probe-skill/SKILL.md"
    });
    expect(summary.events.filter((event) => event.type === "tool_call")).toHaveLength(1);
    expect(summary.events.find((event) => event.type === "tool_result")).toMatchObject({
      isError: false,
      exitCode: 0
    });
  });

  it("takes the last agent message as the answer", () => {
    const summary = parseCodexStream(fixtureLines("codex-structured.jsonl"));
    expect(JSON.parse(summary.lastMessage ?? "{}")).toEqual({
      word: "PINEAPPLE-42",
      cwdHasPackageJson: true
    });
  });

  it("shows no command for a sandbox-blocked attempt", () => {
    const summary = parseCodexStream(fixtureLines("codex-commit-denied.jsonl"));
    expect(summary.events.some((event) => event.type === "tool_call")).toBe(false);
    expect(summary.completed).toBe(true);
  });

  it("reads a resumed workspace-write command", () => {
    const summary = parseCodexStream(fixtureLines("codex-resume-workspace-write.jsonl"));
    expect(summary.events.find((event) => event.type === "tool_call")).toMatchObject({
      command: "touch four.txt"
    });
  });

  it("reads a failed turn", () => {
    const summary = parseCodexStream(fixtureLines("codex-turn-failed.jsonl"));
    expect(summary.completed).toBe(false);
    expect(summary.failure).toContain("not supported");
  });

  it("reads file changes and MCP calls", () => {
    const summary = parseCodexStream([
      '{"type":"item.completed","item":{"id":"i1","type":"file_change","changes":[{"path":"docs/a.md","kind":"add"}],"status":"completed"}}',
      '{"type":"item.completed","item":{"id":"i2","type":"mcp_tool_call","server":"serena","tool":"find_symbol","status":"completed"}}',
      '{"type":"item.completed","item":{"id":"i3","type":"reasoning","text":"thinking"}}',
      "garbage"
    ]);
    expect(summary.events.filter((event) => event.type === "tool_call")).toEqual([
      { type: "tool_call", id: "i1", tool: "FileChange", paths: ["docs/a.md"] },
      { type: "tool_call", id: "i2", tool: "mcp__serena__find_symbol", paths: [] }
    ]);
    expect(summary.ignoredLines).toBe(1);
  });
});

describe("createCodexRunner", () => {
  /** A fake `codex` that replays a fixture and writes the `-o` file like the real CLI. */
  const fakeProcess = (
    lines: readonly string[],
    options: {
      readonly lastMessage?: string;
      readonly code?: number | null;
      readonly timedOut?: boolean;
    } = {}
  ) => {
    const calls: AgentProcessRequest[] = [];
    const spawnProcess: AgentProcess = async (request) => {
      calls.push(request);
      const outputPath = request.argv[request.argv.indexOf("-o") + 1];
      const schemaPath = request.argv[request.argv.indexOf("--output-schema") + 1];
      if (schemaPath !== undefined) await readFile(schemaPath, "utf8");
      if (outputPath !== undefined && options.lastMessage !== undefined) {
        await writeFile(outputPath, options.lastMessage);
      }
      for (const line of lines) request.onLine(line);
      return {
        code: options.code === undefined ? 0 : options.code,
        timedOut: options.timedOut ?? false,
        aborted: false,
        stderrTail: ""
      };
    };
    return { calls, spawnProcess };
  };

  const withTemp = async (
    body: (makeTempDir: () => Promise<string>, dirs: string[]) => Promise<void>
  ) => {
    const dirs: string[] = [];
    const makeTempDir = async () => {
      const dir = await mkdtemp(path.join(tmpdir(), "desk-codex-test-"));
      dirs.push(dir);
      return dir;
    };
    try {
      await body(makeTempDir, dirs);
    } finally {
      await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
    }
  };

  it("returns the validated answer from the -o file and removes its temp files", async () => {
    await withTemp(async (makeTempDir, dirs) => {
      const fake = fakeProcess(fixtureLines("codex-structured.jsonl"), {
        lastMessage: '{"word":"PINEAPPLE-42","overrideSeen":false}'
      });
      const runner = createCodexRunner({ process: fake.spawnProcess, makeTempDir });
      const outcome = await runner.run(codexRequest({ role: "planner" }));
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.result.structured).toEqual({ word: "PINEAPPLE-42", overrideSeen: false });
      expect(outcome.result.sessionId).toBe("00000000-0000-4000-8000-000000000001");
      expect(outcome.result.costUsd).toBeUndefined();
      expect(fake.calls[0]?.argv[0]).toBe("codex");
      await expect(readFile(path.join(dirs[0] ?? "", "last-message.txt"))).rejects.toThrow();
    });
  });

  it("falls back to the last stream message when the -o file is missing", async () => {
    await withTemp(async (makeTempDir) => {
      const lines = fixtureLines("codex-structured.jsonl").map((line) =>
        line.replaceAll("cwdHasPackageJson", "overrideSeen")
      );
      const fake = fakeProcess(lines);
      const outcome = await createCodexRunner({ process: fake.spawnProcess, makeTempDir }).run(
        codexRequest({ role: "reviewer" })
      );
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.result.structured).toEqual({ word: "PINEAPPLE-42", overrideSeen: true });
    });
  });

  it("reports an answer that does not match the schema", async () => {
    await withTemp(async (makeTempDir) => {
      const fake = fakeProcess(fixtureLines("codex-structured.jsonl"), {
        lastMessage: '{"word":1}'
      });
      const outcome = await createCodexRunner({ process: fake.spawnProcess, makeTempDir }).run(
        codexRequest({ role: "reviewer" })
      );
      expect(outcome).toMatchObject({ ok: false, failure: { kind: "schema-mismatch" } });
    });
  });

  it("hands the spawn callback to the process", async () => {
    await withTemp(async (makeTempDir) => {
      const fake = fakeProcess(fixtureLines("codex-structured.jsonl"));
      const onSpawn = () => undefined;
      await createCodexRunner({ process: fake.spawnProcess, makeTempDir }).run(
        codexRequest({ role: "reviewer", onSpawn })
      );
      expect(fake.calls[0]?.onSpawn).toBe(onSpawn);
    });
  });

  it("refuses an un-opted builder before it starts a process", async () => {
    await withTemp(async (makeTempDir) => {
      const fake = fakeProcess([]);
      const outcome = await createCodexRunner({ process: fake.spawnProcess, makeTempDir }).run(
        codexRequest({ role: "builder" })
      );
      expect(outcome).toMatchObject({ ok: false, failure: { kind: "process-error" } });
      expect(fake.calls).toHaveLength(0);
    });
  });

  it("reports a failed turn as a process error with the provider message", async () => {
    await withTemp(async (makeTempDir) => {
      const fake = fakeProcess(fixtureLines("codex-turn-failed.jsonl"), { code: 1 });
      const outcome = await createCodexRunner({ process: fake.spawnProcess, makeTempDir }).run(
        codexRequest({ role: "planner" })
      );
      expect(outcome.ok).toBe(false);
      if (outcome.ok || outcome.failure.kind !== "process-error") return;
      expect(outcome.failure.message).toContain("not supported");
      expect(outcome.partial.sessionId).toBe("00000000-0000-4000-8000-000000000001");
    });
  });

  it("maps a timeout and a stream cut before turn.completed", async () => {
    await withTemp(async (makeTempDir) => {
      const timeout = await createCodexRunner({
        process: fakeProcess([], { code: null, timedOut: true }).spawnProcess,
        makeTempDir
      }).run(codexRequest({ role: "planner" }));
      expect(timeout).toMatchObject({ ok: false, failure: { kind: "timeout" } });
      const cut = await createCodexRunner({
        process: fakeProcess(fixtureLines("codex-structured.jsonl").slice(0, 3)).spawnProcess,
        makeTempDir
      }).run(codexRequest({ role: "planner" }));
      expect(cut).toMatchObject({ ok: false, failure: { kind: "no-result" } });
    });
  });

  it("resumes with the thread id", async () => {
    await withTemp(async (makeTempDir) => {
      const fake = fakeProcess(fixtureLines("codex-structured.jsonl"), {
        lastMessage: '{"word":"a","overrideSeen":true}'
      });
      await createCodexRunner({ process: fake.spawnProcess, makeTempDir }).run(
        codexRequest({ role: "reviewer", resumeSessionId: "thread-7" })
      );
      expect(fake.calls[0]?.argv.slice(1, 3)).toEqual(["exec", "resume"]);
      expect(fake.calls[0]?.argv).toContain("thread-7");
    });
  });
});

describe("the container sandbox flag", () => {
  const inContainer = { insideContainer: true };

  it("is never emitted for a host run, whatever the request says", () => {
    const requests = [
      codexRequest({ role: "planner" }),
      codexRequest({ role: "reviewer", resumeSessionId: "t" }),
      codexRequest({ role: "builder", allowCodexBuilder: true }),
      codexRequest({ role: "builder", allowCodexBuilder: true, resumeSessionId: "t" }),
      codexRequest({ role: "builder", allowCodexBuilder: true, containerSandbox: false })
    ];
    for (const request of requests) {
      expect(buildCodexArgs(request, files).join(" ")).not.toContain(CONTAINER_BYPASS_FLAG);
      // An explicit "not inside a container" changes nothing either.
      expect(buildCodexArgs(request, files, { insideContainer: false }).join(" ")).not.toContain(
        "--dangerously"
      );
    }
  });

  it("makes a host runner refuse a request that asks for it", () => {
    for (const request of [
      codexRequest({ role: "builder", containerSandbox: true }),
      codexRequest({ role: "builder", allowCodexBuilder: true, containerSandbox: true }),
      codexRequest({ role: "planner", containerSandbox: true })
    ]) {
      expect(() => buildCodexArgs(request, files)).toThrow(CodexPolicyError);
      expect(() => buildCodexArgs(request, files, { insideContainer: false })).toThrow(
        /Docker container/
      );
    }
  });

  it("is emitted only when the request asks for it and the runner is inside a container", () => {
    const args = buildCodexArgs(
      codexRequest({ role: "builder", containerSandbox: true, cwd: "/workspace" }),
      files,
      inContainer
    );
    expect(args).toContain(CONTAINER_BYPASS_FLAG);
    expect(args).not.toContain("-s");
    expect(valueAfter(args, "-C")).toBe("/workspace");
    expect(args).toContain("--ignore-user-config");
    expect(args).not.toContain("--full-auto");
    expect(args.join(" ")).not.toContain("danger-full-access");
  });

  it("does not need the host opt-in for a Codex builder in a container", () => {
    expect(() => buildCodexArgs(codexRequest({ role: "builder" }), files, inContainer)).toThrow(
      /disabled/
    );
    expect(() =>
      buildCodexArgs(codexRequest({ role: "builder", containerSandbox: true }), files, inContainer)
    ).not.toThrow();
  });

  it("resumes a thread with the flag", () => {
    const args = buildCodexArgs(
      codexRequest({ role: "builder", containerSandbox: true, resumeSessionId: "thread-3" }),
      files,
      inContainer
    );
    expect(args.slice(0, 2)).toEqual(["exec", "resume"]);
    expect(args).toContain(CONTAINER_BYPASS_FLAG);
    expect(args).not.toContain("-C");
  });

  it("is refused for a planner, a reviewer and an intake role even inside a container", () => {
    for (const role of ["planner", "reviewer", "intake"] as const) {
      expect(() =>
        buildCodexArgs(codexRequest({ role, containerSandbox: true }), files, inContainer)
      ).toThrow(/Only the builder/);
    }
  });

  it("still refuses every other full-access flag inside a container", () => {
    const args = buildCodexArgs(
      codexRequest({ role: "builder", containerSandbox: true }),
      files,
      inContainer
    );
    const flags = args.slice(0, args.indexOf("--"));
    expect(flags.filter((arg) => arg.startsWith("--dangerously-"))).toEqual([
      CONTAINER_BYPASS_FLAG
    ]);
    expect(flags.join(" ")).not.toMatch(/--yolo|danger-full-access|--full-auto/);
  });

  it("keeps a prompt that looks like the flag out of the flag list", () => {
    const args = buildCodexArgs(
      codexRequest({ role: "planner", prompt: CONTAINER_BYPASS_FLAG }),
      files
    );
    expect(args.slice(-2)).toEqual(["--", CONTAINER_BYPASS_FLAG]);
    expect(beforePrompt(args)).not.toContain(CONTAINER_BYPASS_FLAG);
  });
});

describe("createCodexRunner: host and container", () => {
  const request = codexRequest({ role: "builder", containerSandbox: true });

  it("a host runner refuses the container request before it starts a process", async () => {
    let started = false;
    const spawn: AgentProcess = () => {
      started = true;
      return Promise.reject(new Error("must not start"));
    };
    const outcome = await createCodexRunner({ process: spawn }).run(request);
    expect(started).toBe(false);
    expect(outcome).toMatchObject({ ok: false, failure: { kind: "process-error" } });
    expect(outcome.ok ? "" : JSON.stringify(outcome.failure)).toContain("Docker container");
  });

  it("maps the schema and output paths and writes the schema where the host can read it", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "desk-codex-map-"));
    try {
      const seen: { request: AgentProcessRequest | null } = { request: null };
      let schemaOnDisk = "";
      const spawn: AgentProcess = async (processRequest) => {
        seen.request = processRequest;
        schemaOnDisk = await readFile(path.join(dir, "output-schema.json"), "utf8");
        return { code: 0, timedOut: false, aborted: false, stderrTail: "" };
      };
      await createCodexRunner({
        process: spawn,
        insideContainer: true,
        makeTempDir: () => Promise.resolve(dir),
        argPaths: () => ({ schemaPath: "/desk/in/s.json", outputPath: "/tmp/out.txt" })
      }).run(request);
      const argv = seen.request?.argv ?? [];
      expect(valueAfter(argv, "--output-schema")).toBe("/desk/in/s.json");
      expect(valueAfter(argv, "-o")).toBe("/tmp/out.txt");
      expect(argv).toContain(CONTAINER_BYPASS_FLAG);
      expect(JSON.parse(schemaOnDisk)).toMatchObject({ type: "object" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
