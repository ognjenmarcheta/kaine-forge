import { describe, expect, it } from "vitest";

import type { AgentProcess, AgentProcessRequest, AgentProcessResult } from "./agent.process";
import type { AgentEvent } from "./agent.runner";
import { buildClaudeArgs, createClaudeRunner, parseClaudeStream } from "./claude.runner";
import { baseRequest, fixtureLines } from "../testing/agent.testing";

const SESSION = "11111111-1111-4111-8111-111111111111";

const valueAfter = (args: readonly string[], flag: string): string | undefined => {
  const index = args.indexOf(flag);
  return index < 0 ? undefined : args[index + 1];
};
const valuesAfter = (args: readonly string[], flag: string): string[] =>
  args.flatMap((arg, index) => (arg === flag ? [args[index + 1] ?? ""] : []));

describe("buildClaudeArgs", () => {
  it("builds the proven headless flag set for a new session", () => {
    const args = buildClaudeArgs(
      baseRequest({
        prompt: "PROMPT",
        model: "haiku",
        settingsPath: "/run/settings.json",
        mcpConfigPath: "/run/mcp.json",
        permissions: {
          allow: ["Read", "Bash(git diff:*)"],
          disallow: ["Bash(git commit:*)", "WebFetch"]
        }
      }),
      { newSessionId: SESSION }
    );
    expect(args.slice(0, 2)).toEqual(["-p", "PROMPT"]);
    expect(valueAfter(args, "--output-format")).toBe("stream-json");
    expect(args).toContain("--verbose");
    expect(valueAfter(args, "--permission-mode")).toBe("dontAsk");
    expect(valueAfter(args, "--permission-prompts")).toBe("none");
    expect(valueAfter(args, "--setting-sources")).toBe("project");
    expect(valueAfter(args, "--settings")).toBe("/run/settings.json");
    expect(valueAfter(args, "--model")).toBe("haiku");
    expect(valuesAfter(args, "--allowedTools")).toEqual(["Read", "Bash(git diff:*)"]);
    expect(valuesAfter(args, "--disallowedTools")).toEqual(["Bash(git commit:*)", "WebFetch"]);
    expect(args).toContain("--strict-mcp-config");
    expect(valueAfter(args, "--mcp-config")).toBe("/run/mcp.json");
    expect(valueAfter(args, "--session-id")).toBe(SESSION);
    expect(args).not.toContain("--resume");
    expect(args).not.toContain("--agents");
  });

  it("puts the prompt right after -p, before any variadic tool flag", () => {
    const args = buildClaudeArgs(
      baseRequest({ prompt: "P", permissions: { allow: ["Read"], disallow: ["Edit"] } }),
      { newSessionId: SESSION }
    );
    expect(args.indexOf("P")).toBe(1);
    expect(args.indexOf("--allowedTools")).toBeGreaterThan(1);
  });

  it("never emits flags that skip policy or settings", () => {
    const args = buildClaudeArgs(
      baseRequest({
        skills: ["kaine-test"],
        skillMode: "invoke",
        systemAppend: "rules",
        resumeSessionId: SESSION
      }),
      { newSessionId: SESSION }
    );
    for (const forbidden of [
      "--bare",
      "--dangerously-skip-permissions",
      "--allow-dangerously-skip-permissions",
      "bypassPermissions"
    ]) {
      expect(args).not.toContain(forbidden);
    }
    expect(valueAfter(args, "--permission-mode")).toBe("dontAsk");
  });

  it("resumes an earlier session instead of starting one", () => {
    const args = buildClaudeArgs(baseRequest({ resumeSessionId: "earlier" }), {
      newSessionId: SESSION
    });
    expect(valueAfter(args, "--resume")).toBe("earlier");
    expect(args).not.toContain("--session-id");
  });

  it("loads no MCP server unless a config is passed", () => {
    const args = buildClaudeArgs(baseRequest(), { newSessionId: SESSION });
    expect(args).toContain("--strict-mcp-config");
    expect(args).not.toContain("--mcp-config");
  });

  it("preloads role skills through --agents in invoke mode and appends the override block", () => {
    const args = buildClaudeArgs(
      baseRequest({
        role: "planner",
        skills: ["kaine-write-plan"],
        skillMode: "invoke",
        systemAppend: "DESK RULES"
      }),
      { newSessionId: SESSION }
    );
    expect(valueAfter(args, "--agent")).toBe("desk-planner");
    const agents = JSON.parse(valueAfter(args, "--agents") ?? "{}") as Record<
      string,
      { skills: string[]; prompt: string; description: string }
    >;
    expect(agents["desk-planner"]?.skills).toEqual(["kaine-write-plan"]);
    expect(valueAfter(args, "--append-system-prompt")).toBe("DESK RULES");
  });

  it("does not preload skills in inline mode", () => {
    const args = buildClaudeArgs(baseRequest({ skills: ["kaine-test"], skillMode: "inline" }), {
      newSessionId: SESSION
    });
    expect(args).not.toContain("--agents");
    expect(args).not.toContain("--agent");
  });

  it("passes the output schema as JSON", () => {
    const args = buildClaudeArgs(baseRequest(), { newSessionId: SESSION });
    const schema = JSON.parse(valueAfter(args, "--json-schema") ?? "{}") as { required: string[] };
    expect(schema.required).toEqual(["word", "overrideSeen"]);
  });
});

describe("parseClaudeStream", () => {
  it("finds the skill call, the result line and the structured output", () => {
    const summary = parseClaudeStream(fixtureLines("claude-structured.jsonl"));
    expect(summary.sessionId).toBe("00000000-0000-4000-8000-000000000001");
    expect(summary.final).toMatchObject({
      subtype: "success",
      isError: false,
      structured: { word: "PINEAPPLE-42", overrideSeen: true }
    });
    expect(summary.final?.costUsd).toBeCloseTo(0.0496, 3);
    expect(summary.final?.usage.outputTokens).toBeGreaterThan(0);
    const calls = summary.events.filter((event) => event.type === "tool_call");
    expect(calls.map((call) => call.tool)).toEqual(["Skill", "Bash"]);
    expect(calls[0]).toMatchObject({ skill: "probe-skill" });
    expect(calls[1]).toMatchObject({ command: "git status --short" });
  });

  it("does not report the CLI's own StructuredOutput tool as agent activity", () => {
    const summary = parseClaudeStream(fixtureLines("claude-structured.jsonl"));
    expect(
      summary.events.some(
        (event) => event.type === "tool_call" && event.tool === "StructuredOutput"
      )
    ).toBe(false);
  });

  it("uses the result line, not the last line of the stream", () => {
    // The CLI prints system lines after the result; the real stream ends with one.
    const lines = [
      ...fixtureLines("claude-hook-denied.jsonl"),
      '{"type":"system","subtype":"task_summary","detail":null}'
    ];
    expect(JSON.parse(lines.at(-1) ?? "{}")).toMatchObject({ subtype: "task_summary" });
    const summary = parseClaudeStream(lines);
    expect(summary.final?.denials).toHaveLength(1);
  });

  it("reads a hook denial from permission_denials", () => {
    const summary = parseClaudeStream(fixtureLines("claude-hook-denied.jsonl"));
    expect(summary.denials).toEqual([
      expect.objectContaining({ tool: "Bash", command: "echo secret-deny" })
    ]);
    const result = summary.events.find((event) => event.type === "tool_result");
    expect(result).toMatchObject({ isError: true });
  });

  it("reads dontAsk denials of a command and a file write", () => {
    const summary = parseClaudeStream(fixtureLines("claude-dontask-denied.jsonl"));
    expect(summary.denials.map((denial) => denial.tool)).toEqual(["Bash", "Write"]);
    expect(summary.denials[0]?.command).toBe("touch wrote.txt");
    expect(summary.denials[1]?.paths[0]).toBe("/work/repo/wrote.txt");
    const denialEvents = summary.events.filter((event) => event.type === "denial");
    expect(denialEvents).toHaveLength(2);
  });

  it("keeps the attempted command when a bypass form is denied", () => {
    const summary = parseClaudeStream(fixtureLines("claude-commit-bypass-denied.jsonl"));
    expect(summary.denials[0]?.command).toMatch(/^git -C \. -c user\.name=t .* commit /);
    const attempted = summary.events.filter(
      (event) => event.type === "tool_call" && event.command?.includes("commit")
    );
    expect(attempted).toHaveLength(1);
  });

  it("returns no final when the stream was cut short, and skips junk lines", () => {
    const lines = fixtureLines("claude-skill-invoked.jsonl").slice(0, -1);
    const summary = parseClaudeStream(["not json", "[1,2]", ...lines]);
    expect(summary.final).toBeNull();
    expect(summary.ignoredLines).toBe(2);
    expect(summary.sessionId).not.toBeNull();
  });
});

describe("createClaudeRunner", () => {
  const replayProcess =
    (lines: readonly string[], result: Partial<AgentProcessResult> = {}) =>
    (calls: AgentProcessRequest[]): AgentProcess =>
    (request) => {
      calls.push(request);
      for (const line of lines) request.onLine(line);
      return Promise.resolve({
        code: 0,
        timedOut: false,
        aborted: false,
        stderrTail: "",
        ...result
      });
    };

  const run = (
    lines: readonly string[],
    result: Partial<AgentProcessResult> = {},
    request = baseRequest()
  ) => {
    const calls: AgentProcessRequest[] = [];
    const runner = createClaudeRunner({
      process: replayProcess(lines, result)(calls),
      newSessionId: () => SESSION
    });
    return { calls, outcome: runner.run(request) };
  };

  it("returns the validated structured output with usage, cost, trace and session", async () => {
    const { calls, outcome } = run(fixtureLines("claude-structured.jsonl"));
    const result = await outcome;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.structured).toEqual({ word: "PINEAPPLE-42", overrideSeen: true });
    expect(result.result.sessionId).toBe("00000000-0000-4000-8000-000000000001");
    expect(result.result.costUsd).toBeGreaterThan(0);
    expect(result.result.trace.some((event) => event.type === "tool_call")).toBe(true);
    expect(calls[0]?.argv[0]).toBe("claude");
    expect(calls[0]?.cwd).toBe("/work/repo");
  });

  it("streams events to onEvent as they arrive", async () => {
    const seen: AgentEvent[] = [];
    const { outcome } = run(
      fixtureLines("claude-structured.jsonl"),
      {},
      baseRequest({ onEvent: (event) => seen.push(event) })
    );
    await outcome;
    expect(seen.map((event) => event.type)).toContain("tool_call");
  });

  it("hands the spawn callback to the process", async () => {
    const onSpawn = () => undefined;
    const { calls, outcome } = run(
      fixtureLines("claude-structured.jsonl"),
      {},
      baseRequest({ onSpawn })
    );
    await outcome;
    expect(calls[0]?.onSpawn).toBe(onSpawn);
  });

  it("passes the receipts path to the hook through the environment", async () => {
    const { calls, outcome } = run(
      fixtureLines("claude-structured.jsonl"),
      {},
      baseRequest({ receiptsPath: "/run/receipts.jsonl" })
    );
    await outcome;
    expect(calls[0]?.env).toEqual({ KAINE_DESK_RECEIPTS: "/run/receipts.jsonl" });
  });

  it("reports a schema mismatch with the Zod issues and keeps the session", async () => {
    const lines = fixtureLines("claude-structured.jsonl").map((line) =>
      line.replace(
        '"structured_output":{"word":"PINEAPPLE-42","overrideSeen":true}',
        '"structured_output":{"word":7}'
      )
    );
    const { outcome } = run(lines);
    const result = await outcome;
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe("schema-mismatch");
    if (result.failure.kind !== "schema-mismatch") return;
    expect(result.failure.issues.map((issue) => issue.path).sort()).toEqual([
      "overrideSeen",
      "word"
    ]);
    expect(result.partial.sessionId).toBe("00000000-0000-4000-8000-000000000001");
  });

  it("falls back to JSON in the result text when no structured output came back", async () => {
    const lines = fixtureLines("claude-structured.jsonl").map((line) =>
      line.replace(/"structured_output":\{[^}]*\},?/, "")
    );
    const result = await run(lines).outcome;
    expect(result.ok).toBe(true);
  });

  it("reports missing structured output as a schema mismatch", async () => {
    const result = await run(fixtureLines("claude-skill-invoked.jsonl")).outcome;
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toMatchObject({ kind: "schema-mismatch" });
  });

  it("reports a stream without a result line as no-result", async () => {
    const lines = fixtureLines("claude-structured.jsonl").slice(0, -1);
    const result = await run(lines).outcome;
    expect(result).toMatchObject({ ok: false, failure: { kind: "no-result" } });
  });

  it("reports a non-zero exit without a result as a process error with stderr", async () => {
    const result = await run([], { code: 2, stderrTail: "boom" }).outcome;
    expect(result).toMatchObject({
      ok: false,
      failure: { kind: "process-error", exitCode: 2, stderrTail: "boom" }
    });
  });

  it("reports an error result subtype as a process error", async () => {
    const lines = fixtureLines("claude-structured.jsonl").map((line) =>
      line
        .replace('"subtype":"success"', '"subtype":"error_max_turns"')
        .replace('"is_error":false', '"is_error":true')
    );
    const result = await run(lines).outcome;
    expect(result).toMatchObject({ ok: false, failure: { kind: "process-error" } });
    if (!result.ok && result.failure.kind === "process-error") {
      expect(result.failure.message).toContain("error_max_turns");
    }
  });

  it("maps timeout and abort, keeping the partial trace", async () => {
    const lines = fixtureLines("claude-structured.jsonl").slice(0, 3);
    const timeout = await run(lines, { code: null, timedOut: true }).outcome;
    expect(timeout).toMatchObject({ ok: false, failure: { kind: "timeout", timeoutMs: 60_000 } });
    const aborted = await run(lines, { code: null, aborted: true }).outcome;
    expect(aborted).toMatchObject({ ok: false, failure: { kind: "aborted" } });
    if (!aborted.ok) expect(aborted.partial.trace.length).toBeGreaterThan(0);
  });

  it("reports a program that cannot start", async () => {
    const result = await run([], { code: null, spawnError: "spawn claude ENOENT" }).outcome;
    expect(result).toMatchObject({ ok: false, failure: { kind: "process-error" } });
  });

  it("refuses a request for the other provider and an oversized prompt", async () => {
    const wrong = await run([], {}, baseRequest({ provider: "codex" })).outcome;
    expect(wrong).toMatchObject({ ok: false, failure: { kind: "process-error" } });
    const calls: AgentProcessRequest[] = [];
    const runner = createClaudeRunner({ process: replayProcess([])(calls) });
    const big = await runner.run(baseRequest({ prompt: "x".repeat(100_001) }));
    expect(big).toMatchObject({ ok: false, failure: { kind: "process-error" } });
    expect(calls).toHaveLength(0);
  });
});
