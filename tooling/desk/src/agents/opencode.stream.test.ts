import { describe, expect, it } from "vitest";

import { parseOpencodeStream } from "./opencode.stream";
import { fixtureLines } from "../testing/agent.testing";

// The fixtures are real `opencode run --standalone --format json` runs of OpenCode 2.2.5,
// with the probe repository's path replaced by /repo.

describe("parseOpencodeStream", () => {
  it("reads the answer, session, usage and cost of a finished run", () => {
    const summary = parseOpencodeStream(fixtureLines("opencode-structured.jsonl"));
    expect(summary).toMatchObject({
      sessionId: "ses_e63b684ddffePNdw45blGk0y6Y",
      lastMessage: '{"answer": "blue"}',
      usage: { inputTokens: 7901, cachedInputTokens: 0, outputTokens: 7 },
      costUsd: 0,
      turns: 1,
      completed: true,
      failure: null,
      denials: [],
      ignoredLines: 0
    });
  });

  it("maps tool calls to desk tool names and sums usage over every step", () => {
    const summary = parseOpencodeStream(fixtureLines("opencode-tools.jsonl"));
    const calls = summary.events.filter((event) => event.type === "tool_call");
    expect(calls).toEqual([
      expect.objectContaining({ tool: "Read", paths: ["NOTE.md"], command: undefined }),
      expect.objectContaining({ tool: "Bash", paths: [], command: "git status --short" })
    ]);
    // Cache reads are reported apart from input, so they are not subtracted.
    expect(summary.usage).toEqual({ inputTokens: 8143, cachedInputTokens: 7808, outputTokens: 75 });
    expect(summary.turns).toBe(2);
    expect(summary.lastMessage).toBe('{"note": "hello"}');
  });

  it("records a call a permission rule refused as a denial", () => {
    const summary = parseOpencodeStream(fixtureLines("opencode-denied.jsonl"));
    expect(summary.denials).toEqual([
      {
        tool: "Bash",
        toolUseId: "call_00_4em92xgfyiivl1qe2xtg5mfa",
        command: "git commit --allow-empty -m probe .",
        paths: []
      }
    ]);
    expect(summary.events).toContainEqual({
      type: "tool_result",
      id: "call_00_4em92xgfyiivl1qe2xtg5mfa",
      isError: true,
      output: "Permission denied: shell"
    });
    expect(summary.completed).toBe(true);
  });

  it("names write and edit calls so the edit count and the protected-path denial see them", () => {
    const summary = parseOpencodeStream(fixtureLines("opencode-edit.jsonl"));
    const calls = summary.events.flatMap((event) =>
      event.type === "tool_call" ? [`${event.tool} ${event.paths.join(",")}`] : []
    );
    expect(calls).toEqual([
      "Write /repo/out.txt",
      "Edit /repo/out.txt",
      "Write /repo/opencode.json"
    ]);
    expect(summary.denials.map((denial) => `${denial.tool} ${denial.paths.join(",")}`)).toEqual([
      "Write /repo/opencode.json"
    ]);
  });

  it("reports an error line as the failure of the run", () => {
    const summary = parseOpencodeStream(fixtureLines("opencode-error.jsonl"));
    expect(summary).toMatchObject({
      sessionId: "ses_e63b60de9ffeGwKTW08E6z6jKy",
      failure: "Model unavailable: opencode/no-such-model-xyz",
      completed: false,
      lastMessage: null
    });
  });

  it("is not complete when the stream stops before the last step_finish", () => {
    const lines = fixtureLines("opencode-tools.jsonl");
    const summary = parseOpencodeStream(lines.slice(0, -1));
    expect(summary.completed).toBe(false);
    expect(summary.turns).toBe(1);
  });

  it("counts lines that are not JSON or not an event and keeps the rest", () => {
    const summary = parseOpencodeStream([
      "not json",
      '{"no":"type"}',
      ...fixtureLines("opencode-structured.jsonl")
    ]);
    expect(summary.ignoredLines).toBe(2);
    expect(summary.completed).toBe(true);
  });
});
